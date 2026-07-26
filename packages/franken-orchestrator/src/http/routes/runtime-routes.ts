import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { IGovernorModule } from '../../deps.js';
import {
  InMemoryRateLimiter,
  requireBeastRateLimit,
  type BeastRateLimitOptions,
} from '../../beasts/http/beast-rate-limit.js';
import type { RuntimeAdapterRegistry } from '../../runtime/runtime-adapter-registry.js';
import type { RuntimeAdapter } from '../../runtime/runtime-adapter.js';
import {
  RuntimeActionStore,
  type RuntimeActionAuditEvent,
} from '../../runtime/runtime-action-store.js';
export type { RuntimeActionAuditEvent } from '../../runtime/runtime-action-store.js';
import {
  RuntimeActionRequestSchema,
  RuntimeActionResultSchema,
  RuntimeEventPageSchema,
  RuntimeSnapshotSchema,
  type RuntimeAction,
  type RuntimeActionAudit,
} from '../../runtime/runtime-schemas.js';
import { isSensitiveLogKey, redactSensitiveText } from '../../logging/redaction.js';
import { redactAbsoluteHostPathValues } from '../beast-response-redaction.js';
import { errorHandler, HttpError, requestSizeLimit } from '../middleware.js';
import { requireOperatorAuth } from '../operator-auth.js';
import type { TransportSecurityService } from '../security/transport-security.js';

export interface RuntimeRouteDeps {
  registry: RuntimeAdapterRegistry;
  operatorToken: string;
  security: TransportSecurityService;
  ticketStore: SseConnectionTicketStore;
  rateLimit?: BeastRateLimitOptions | undefined;
  pollIntervalMs?: number | undefined;
  heartbeatIntervalMs?: number | undefined;
  actionAudit?: ((event: RuntimeActionAuditEvent) => void | Promise<void>) | undefined;
  actionGovernor?: IGovernorModule | undefined;
  actionStore?: RuntimeActionStore | undefined;
}

const BASE_PATH = '/v1/smart-swarm/providers';
const TICKET_COOKIE = 'frankenbeast_runtime_sse_ticket';
const DEFAULT_RATE_LIMIT: BeastRateLimitOptions = { max: 120, windowMs: 60_000 };
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const MAX_ACTION_BODY_BYTES = 16 * 1024;

function streamPath(providerId: string, connectionId: string): string {
  return `${BASE_PATH}/${encodeURIComponent(providerId)}/events/${encodeURIComponent(connectionId)}`;
}

function isStreamPath(pathname: string): boolean {
  return /^\/v1\/smart-swarm\/providers\/[^/]+\/events\/[^/]+$/u.test(pathname);
}

function isHttpsRequest(requestUrl: string, forwardedProto: string | undefined): boolean {
  const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  return proto ? proto === 'https' : new URL(requestUrl).protocol === 'https:';
}

function positiveInteger(value: string | undefined, name: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) throw new HttpError(422, 'INVALID_QUERY', `${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new HttpError(422, 'INVALID_QUERY', `${name} must be between 1 and ${max}`);
  }
  return parsed;
}

function cursorValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length < 1) {
    throw new HttpError(422, 'INVALID_CURSOR', 'cursor must not be empty');
  }
  return value;
}

function adapterOr404(registry: RuntimeAdapterRegistry, providerId: string) {
  try {
    return registry.get(providerId);
  } catch {
    throw new HttpError(404, 'RUNTIME_PROVIDER_NOT_FOUND', `Runtime provider '${providerId}' was not found`);
  }
}

function validateInterval(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function redactRuntimePaths(value: unknown, inMetadata = false): unknown {
  if (typeof value === 'string') return redactAbsoluteHostPathValues(redactSensitiveText(value));
  if (Array.isArray(value)) return value.map((entry) => redactRuntimePaths(entry, inMetadata));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const opaqueContractField = !inMetadata
      && (
        key === 'id'
        || key === 'cursor'
        || key === 'nextCursor'
        || key.endsWith('Id')
        || key.endsWith('Ids')
      );
    if (opaqueContractField) return [key, entry];
    if (isSensitiveLogKey(key)) return [key, '<redacted>'];
    return [key, redactRuntimePaths(entry, inMetadata || key === 'metadata')];
  }));
}

function runtimeResponse(value: unknown): unknown {
  return redactRuntimePaths(value);
}

function actionTarget(action: RuntimeAction): string {
  return action.type === 'approval.resolve' ? action.approvalId : action.taskId;
}

function actionCapability(action: RuntimeAction): 'approvals' | 'blockers' | 'pause' | 'resume' | 'cancellation' | 'policyActions' {
  switch (action.type) {
    case 'approval.resolve': return 'approvals';
    case 'blocker.add':
    case 'blocker.resolve': return 'blockers';
    case 'task.pause': return 'pause';
    case 'task.resume': return 'resume';
    case 'task.cancel': return 'cancellation';
    case 'policy.apply': return 'policyActions';
  }
}

function actionAudit(action: RuntimeAction, outcome: RuntimeActionAudit['outcome']): RuntimeActionAudit {
  return {
    requestedBy: 'authenticated-operator',
    actionType: action.type,
    targetId: actionTarget(action),
    outcome,
  };
}

function requiresGovernor(action: RuntimeAction): boolean {
  return action.type === 'task.cancel' || action.type === 'policy.apply';
}

function parseAdapterActionResult(
  adapter: RuntimeAdapter,
  request: ReturnType<typeof RuntimeActionRequestSchema.parse>,
  value: unknown,
) {
  const result = RuntimeActionResultSchema.parse(value);
  if (
    result.providerId !== adapter.id
    || result.correlationId !== request.correlationId
    || result.audit.actionType !== request.action.type
    || result.audit.targetId !== actionTarget(request.action)
    || result.audit.outcome !== result.status
  ) {
    throw new Error('Runtime adapter returned a result for a different action');
  }
  return result;
}

function isInvalidCursorError(error: unknown): error is Error & { code: 'INVALID_CURSOR' } {
  return error instanceof Error
    && 'code' in error
    && (error as Error & { code?: unknown }).code === 'INVALID_CURSOR';
}

function validateAdapterCursor(adapter: RuntimeAdapter, cursor: string | undefined): void {
  if (!cursor) return;
  try {
    adapter.validateEventCursor(cursor);
  } catch (error) {
    if (isInvalidCursorError(error)) {
      throw new HttpError(422, 'INVALID_CURSOR', error.message);
    }
    throw error;
  }
}

export function createRuntimeRoutes(deps: RuntimeRouteDeps): Hono {
  const app = new Hono();
  const auth = requireOperatorAuth({ operatorToken: deps.operatorToken, security: deps.security });
  const limiter = new InMemoryRateLimiter(deps.rateLimit ?? DEFAULT_RATE_LIMIT);
  const pollIntervalMs = validateInterval('pollIntervalMs', deps.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
  const heartbeatIntervalMs = validateInterval(
    'heartbeatIntervalMs',
    deps.heartbeatIntervalMs,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
  );
  const actionStore = deps.actionStore ?? new RuntimeActionStore();
  const inFlightActions = new Map<string, Promise<ReturnType<typeof RuntimeActionResultSchema.parse>>>();

  const recordActionAudit = (
    providerId: string,
    request: ReturnType<typeof RuntimeActionRequestSchema.parse>,
    audit: RuntimeActionAudit,
  ): void => {
    const event = {
      ...audit,
      providerId,
      correlationId: request.correlationId,
      ...(request.causationId ? { causationId: request.causationId } : {}),
    };
    actionStore.recordAudit(event);
    void Promise.resolve().then(() => deps.actionAudit?.(event)).catch(() => {});
  };

  const executeAction = async (
    adapter: RuntimeAdapter,
    request: ReturnType<typeof RuntimeActionRequestSchema.parse>,
  ) => {
    let result;
    try {
      const provider = await adapter.describe();
      const capability = provider.capabilities[actionCapability(request.action)];
      if (capability.status === 'unsupported') {
        result = RuntimeActionResultSchema.parse({
          status: 'unsupported',
          providerId: adapter.id,
          correlationId: request.correlationId,
          reason: capability.reason.slice(0, 1000),
          audit: actionAudit(request.action, 'unsupported'),
        });
      } else if (requiresGovernor(request.action)) {
        const outcome = deps.actionGovernor
          ? await deps.actionGovernor.requestApproval({
              taskId: actionTarget(request.action),
              summary: `Governed runtime action ${request.action.type}`,
              requiresHitl: true,
            })
          : { decision: 'rejected' as const, reason: 'Runtime action governor is unavailable' };
        result = outcome.decision === 'approved'
          ? parseAdapterActionResult(adapter, request, await adapter.executeAction(request))
          : RuntimeActionResultSchema.parse({
            status: 'rejected',
            providerId: adapter.id,
            correlationId: request.correlationId,
            reason: 'Runtime action was not approved by the governor',
            audit: actionAudit(request.action, 'rejected'),
          });
      } else {
        result = parseAdapterActionResult(adapter, request, await adapter.executeAction(request));
      }
    } catch {
      result = RuntimeActionResultSchema.parse({
        status: 'failed',
        providerId: adapter.id,
        correlationId: request.correlationId,
        reason: 'Runtime provider action failed',
        audit: actionAudit(request.action, 'failed'),
      });
    }
    recordActionAudit(adapter.id, request, result.audit);
    return result;
  };

  app.onError(errorHandler);
  app.use('/v1/smart-swarm/*', async (c, next) => {
    if (c.req.method === 'GET' && isStreamPath(new URL(c.req.url).pathname)) {
      await next();
      return;
    }
    return auth(c, next);
  });
  const sharedRateLimit = requireBeastRateLimit(
    limiter,
    (authHeader, path) => authHeader ? `${authHeader}:${path}` : `ticket:${path}`,
  );
  app.use('/v1/smart-swarm/*', async (c, next) => {
    if (c.req.method === 'GET' && isStreamPath(new URL(c.req.url).pathname)) {
      await next();
      return;
    }
    return sharedRateLimit(c, next);
  });
  app.use(`${BASE_PATH}/:providerId/actions`, requestSizeLimit(MAX_ACTION_BODY_BYTES));

  app.get(BASE_PATH, async (c) => c.json({ data: runtimeResponse(await deps.registry.list()) }));

  app.get(`${BASE_PATH}/:providerId/snapshot`, async (c) => {
    const adapter = adapterOr404(deps.registry, c.req.param('providerId'));
    const activityLimit = positiveInteger(c.req.query('activityLimit'), 'activityLimit', 500);
    const workspaceId = c.req.query('workspaceId');
    const request = {
      ...(workspaceId ? { workspaceId } : {}),
      ...(activityLimit !== undefined ? { activityLimit } : {}),
    };
    const snapshot = RuntimeSnapshotSchema.parse(await adapter.getSnapshot(request));
    if (snapshot.providerId !== adapter.id) {
      throw new Error(`Runtime snapshot provider id '${snapshot.providerId}' does not match adapter '${adapter.id}'`);
    }
    return c.json({ data: runtimeResponse(snapshot) });
  });

  app.get(`${BASE_PATH}/:providerId/events`, async (c) => {
    const adapter = adapterOr404(deps.registry, c.req.param('providerId'));
    const limit = positiveInteger(c.req.query('limit'), 'limit', 500);
    const cursor = cursorValue(c.req.query('cursor'));
    validateAdapterCursor(adapter, cursor);
    const workspaceId = c.req.query('workspaceId');
    const request = {
      ...(cursor ? { cursor } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
    try {
      return c.json({ data: runtimeResponse(RuntimeEventPageSchema.parse(await adapter.getEvents(request))) });
    } catch (error) {
      if (isInvalidCursorError(error)) {
        throw new HttpError(422, 'INVALID_CURSOR', error.message);
      }
      throw error;
    }
  });

  app.post(`${BASE_PATH}/:providerId/actions`, async (c) => {
    const adapter = adapterOr404(deps.registry, c.req.param('providerId'));
    const parsed = RuntimeActionRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      throw new HttpError(422, 'INVALID_RUNTIME_ACTION', 'Runtime action payload is invalid');
    }
    const request = parsed.data;
    const key = createHash('sha256')
      .update(JSON.stringify([adapter.id, request.idempotencyKey]))
      .digest('base64url');
    const fingerprint = createHash('sha256').update(JSON.stringify(request.action)).digest('base64url');
    const now = Date.now();
    const reservation = actionStore.reserve(key, fingerprint, now + IDEMPOTENCY_TTL_MS, now);
    if (reservation.status === 'conflict') {
      throw new HttpError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'Idempotency key was already used for a different action');
    }
    if (reservation.status === 'completed') {
      const result = reservation.result;
      const replay = result.status === 'applied' ? { ...result, replayed: true } : result;
      return c.json({ data: runtimeResponse(RuntimeActionResultSchema.parse(replay)) });
    }
    if (reservation.status === 'pending') {
      const pending = inFlightActions.get(key);
      if (!pending) {
        throw new HttpError(409, 'IDEMPOTENCY_KEY_IN_PROGRESS', 'Idempotent runtime action is still in progress');
      }
      const result = await pending;
      const replay = result.status === 'applied' ? { ...result, replayed: true } : result;
      return c.json({ data: runtimeResponse(RuntimeActionResultSchema.parse(replay)) });
    }
    const lease = setInterval(
      () => actionStore.renew(key, fingerprint, Date.now() + IDEMPOTENCY_TTL_MS),
      IDEMPOTENCY_TTL_MS / 2,
    );
    lease.unref();
    const result = actionStore.track((async () => {
      try {
        const completed = await executeAction(adapter, request);
        actionStore.complete(key, fingerprint, completed, Date.now() + IDEMPOTENCY_TTL_MS);
        return completed;
      } finally {
        clearInterval(lease);
      }
    })());
    inFlightActions.set(key, result);
    try {
      const completed = await result;
      return c.json({ data: runtimeResponse(completed) });
    } finally {
      inFlightActions.delete(key);
    }
  });

  app.post(`${BASE_PATH}/:providerId/events/ticket`, (c) => {
    const providerId = c.req.param('providerId');
    adapterOr404(deps.registry, providerId);
    const connectionId = randomUUID();
    const ticket = deps.ticketStore.issue(deps.operatorToken, `${providerId}:${connectionId}`);
    setCookie(c, TICKET_COOKIE, ticket, {
      httpOnly: true,
      maxAge: 30,
      path: streamPath(providerId, connectionId),
      sameSite: 'Strict',
      secure: isHttpsRequest(c.req.url, c.req.header('x-forwarded-proto')),
    });
    return c.json({ connectionId });
  });

  app.get(`${BASE_PATH}/:providerId/events/:connectionId`, (c) => {
    const providerId = c.req.param('providerId');
    const connectionId = c.req.param('connectionId');
    const ticket = getCookie(c, TICKET_COOKIE);
    if (!ticket) {
      if (!limiter.take('ticket:runtime-stream:invalid').allowed) {
        throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
      }
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }
    if (!limiter.take('ticket:runtime-stream:candidate').allowed) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }
    const adapter = adapterOr404(deps.registry, providerId);
    const initialCursor = cursorValue(c.req.header('Last-Event-ID') ?? c.req.query('cursor'));
    validateAdapterCursor(adapter, initialCursor);
    const ticketStatus = deps.ticketStore.consume(ticket, deps.operatorToken, `${providerId}:${connectionId}`);
    if (ticketStatus === 'reused') return c.body(null, 204);
    if (ticketStatus === 'invalid') {
      if (!limiter.take('ticket:runtime-stream:invalid').allowed) {
        throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
      }
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }
    if (!limiter.take(`ticket:runtime-stream:valid:${providerId}`).allowed) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }
    const workspaceId = c.req.query('workspaceId');

    return streamSSE(c, async (stream) => {
      let cursor = initialCursor;
      let polling = false;
      let closed = false;
      const publish = async () => {
        if (polling || closed) return;
        polling = true;
        try {
          const page = RuntimeEventPageSchema.parse(await adapter.getEvents({
            ...(cursor ? { cursor } : {}),
            ...(workspaceId ? { workspaceId } : {}),
            limit: 100,
          }));
          for (const event of page.events) {
            await stream.writeSSE({
              id: event.cursor,
              event: 'activity',
              data: JSON.stringify(runtimeResponse(event)),
            });
            cursor = event.cursor;
          }
          if (page.nextCursor) cursor = page.nextCursor;
        } catch {
          // Keep the stream alive across transient SQLite/WAL or schema changes.
        } finally {
          polling = false;
        }
      };

      await publish();
      const poll = setInterval(() => void publish(), pollIntervalMs);
      const heartbeat = setInterval(
        () => void stream.writeSSE({ event: 'heartbeat', data: '' }).catch(() => {}),
        heartbeatIntervalMs,
      );
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      closed = true;
      clearInterval(poll);
      clearInterval(heartbeat);
    });
  });

  return app;
}
