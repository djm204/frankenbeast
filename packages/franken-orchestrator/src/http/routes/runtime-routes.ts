import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import {
  MIN_CONSUMED_RETENTION_MS,
  type SseConnectionTicketStore,
} from '../../beasts/events/sse-connection-ticket.js';
import {
  InMemoryRateLimiter,
  requireBeastRateLimit,
  type BeastRateLimitOptions,
} from '../../beasts/http/beast-rate-limit.js';
import type { RuntimeAdapterRegistry } from '../../runtime/runtime-adapter-registry.js';
import type { RuntimeAdapter } from '../../runtime/runtime-adapter.js';
import { RuntimeEventPageSchema, RuntimeSnapshotSchema } from '../../runtime/runtime-schemas.js';
import { isSensitiveLogKey, redactSensitiveText } from '../../logging/redaction.js';
import { redactAbsoluteHostPathValues } from '../beast-response-redaction.js';
import { errorHandler, HttpError } from '../middleware.js';
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
  maxActiveStreams?: number | undefined;
}

const BASE_PATH = '/v1/smart-swarm/providers';
const TICKET_COOKIE = 'frankenbeast_runtime_sse_ticket';
const DEFAULT_RATE_LIMIT: BeastRateLimitOptions = { max: 120, windowMs: 60_000 };
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_ACTIVE_STREAMS = 32;
const MAX_TIMER_INTERVAL_MS = 2_147_483_647;

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

function workspaceIdValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length < 1) {
    throw new HttpError(422, 'INVALID_QUERY', 'workspaceId must not be empty');
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

function validateInterval(
  name: string,
  value: number | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > max) {
    throw new RangeError(`${name} must be a positive safe integer no greater than ${max}`);
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

type RuntimeSseStream = Parameters<Parameters<typeof streamSSE>[1]>[0];

interface RuntimeSseMessage {
  data: string;
  event?: string;
  id?: string;
}

interface RuntimeEventStreamOptions {
  initialCursor?: string | undefined;
  workspaceId?: string | undefined;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

function runtimeSseBody(message: RuntimeSseMessage): ReadableStream<Uint8Array> {
  if (message.id && /[\0\r\n]/u.test(message.id)) {
    throw new Error('Runtime SSE cursor IDs must be single-line values without NUL');
  }
  const dataLines = message.data.split(/\r\n|\r|\n/u).map((line) => `data: ${line}`).join('\n');
  const payload = [
    message.id && `id: ${message.id}`,
    message.event && `event: ${message.event}`,
    dataLines,
  ].filter(Boolean).join('\n') + '\n\n';
  const bytes = new TextEncoder().encode(payload);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export async function runRuntimeEventStream(
  adapter: RuntimeAdapter,
  stream: RuntimeSseStream,
  options: RuntimeEventStreamOptions,
): Promise<void> {
  const pollController = new AbortController();
  let cursor = options.initialCursor;
  let activePublish: Promise<void> | undefined;
  let closed = false;
  let resolveAbort!: () => void;
  const aborted = new Promise<void>((resolve) => {
    resolveAbort = resolve;
  });
  const endStream = () => {
    if (closed) return;
    closed = true;
    pollController.abort();
    resolveAbort();
  };
  stream.onAbort(endStream);

  let writeChain = Promise.resolve();
  let queuedWrites = 0;
  const writeSse = (message: RuntimeSseMessage): Promise<void> => {
    queuedWrites += 1;
    const write = writeChain.then(() => stream.pipe(runtimeSseBody(message)));
    const tracked = write.finally(() => { queuedWrites -= 1; });
    writeChain = tracked.catch(() => undefined);
    return tracked;
  };
  const publish = (): Promise<void> => {
    if (activePublish) return activePublish;
    if (closed) return Promise.resolve();
    const pending = (async () => {
      const page = RuntimeEventPageSchema.parse(await adapter.getEvents({
        ...(cursor ? { cursor } : {}),
        ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
        limit: 100,
        signal: pollController.signal,
      }));
      if (closed) return;
      for (const event of page.events) {
        await writeSse({
          id: event.cursor,
          event: 'activity',
          data: JSON.stringify(runtimeResponse(event)),
        });
        cursor = event.cursor;
      }
      if (page.nextCursor && page.nextCursor !== cursor) {
        await writeSse({ id: page.nextCursor, event: 'checkpoint', data: '' });
        cursor = page.nextCursor;
      }
    })();
    activePublish = pending;
    void pending.then(
      () => { if (activePublish === pending) activePublish = undefined; },
      () => { if (activePublish === pending) activePublish = undefined; },
    );
    return pending;
  };

  let poll: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const initialPublish = publish().catch((error: unknown) => {
      if (closed && pollController.signal.aborted) return;
      throw error;
    });
    await Promise.race([initialPublish, aborted]);
    if (closed) {
      await initialPublish;
      return;
    }
    poll = setInterval(() => void publish().catch(endStream), options.pollIntervalMs);
    heartbeat = setInterval(
      () => {
        if (queuedWrites > 0) return;
        void writeSse({ event: 'heartbeat', data: '' }).catch(endStream);
      },
      options.heartbeatIntervalMs,
    );
    await aborted;
    const pending = activePublish;
    if (pending) {
      try {
        await pending;
      } catch (error) {
        if (!pollController.signal.aborted) throw error;
      }
    }
  } finally {
    pollController.abort();
    if (poll) clearInterval(poll);
    if (heartbeat) clearInterval(heartbeat);
  }
}

export function createRuntimeRoutes(deps: RuntimeRouteDeps): Hono {
  const app = new Hono();
  const auth = requireOperatorAuth({ operatorToken: deps.operatorToken, security: deps.security });
  const limiter = new InMemoryRateLimiter(deps.rateLimit ?? DEFAULT_RATE_LIMIT);
  const pollIntervalMs = validateInterval(
    'pollIntervalMs',
    deps.pollIntervalMs,
    DEFAULT_POLL_INTERVAL_MS,
    MAX_TIMER_INTERVAL_MS,
  );
  const heartbeatIntervalMs = validateInterval(
    'heartbeatIntervalMs',
    deps.heartbeatIntervalMs,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    MAX_TIMER_INTERVAL_MS,
  );
  const maxActiveStreams = validateInterval(
    'maxActiveStreams',
    deps.maxActiveStreams,
    DEFAULT_MAX_ACTIVE_STREAMS,
  );
  let activeStreams = 0;

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
    () => 'operator:smart-swarm',
  );
  app.use('/v1/smart-swarm/*', async (c, next) => {
    if (c.req.method === 'GET' && isStreamPath(new URL(c.req.url).pathname)) {
      await next();
      return;
    }
    return sharedRateLimit(c, next);
  });

  app.get(BASE_PATH, async (c) => c.json({ data: runtimeResponse(await deps.registry.list()) }));

  app.get(`${BASE_PATH}/:providerId/snapshot`, async (c) => {
    const adapter = adapterOr404(deps.registry, c.req.param('providerId'));
    const activityLimit = positiveInteger(c.req.query('activityLimit'), 'activityLimit', 500);
    const workspaceId = workspaceIdValue(c.req.query('workspaceId'));
    const request = {
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(activityLimit !== undefined ? { activityLimit } : {}),
      signal: c.req.raw.signal,
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
    const workspaceId = workspaceIdValue(c.req.query('workspaceId'));
    const request = {
      ...(cursor ? { cursor } : {}),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(limit !== undefined ? { limit } : {}),
      signal: c.req.raw.signal,
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

  app.post(`${BASE_PATH}/:providerId/events/ticket`, (c) => {
    const providerId = c.req.param('providerId');
    adapterOr404(deps.registry, providerId);
    const connectionId = randomUUID();
    const ticket = deps.ticketStore.issue(deps.operatorToken, `${providerId}:${connectionId}`);
    setCookie(c, TICKET_COOKIE, ticket, {
      httpOnly: true,
      maxAge: Math.ceil(MIN_CONSUMED_RETENTION_MS / 1_000),
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
    const checkedTicketStatus = deps.ticketStore.check(ticket, deps.operatorToken, `${providerId}:${connectionId}`);
    if (checkedTicketStatus === 'reused') return c.body(null, 204);
    if (checkedTicketStatus === 'invalid') {
      if (!limiter.take('ticket:runtime-stream:invalid').allowed) {
        throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
      }
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }
    const adapter = adapterOr404(deps.registry, providerId);
    const initialCursor = cursorValue(c.req.header('Last-Event-ID') ?? c.req.query('cursor'));
    validateAdapterCursor(adapter, initialCursor);
    const workspaceId = workspaceIdValue(c.req.query('workspaceId'));
    if (activeStreams >= maxActiveStreams) {
      throw new HttpError(429, 'RUNTIME_STREAM_LIMIT', 'Concurrent runtime stream limit exceeded');
    }
    if (!limiter.take(`ticket:runtime-stream:valid:${providerId}`).allowed) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }
    const ticketStatus = deps.ticketStore.consume(ticket, deps.operatorToken, `${providerId}:${connectionId}`);
    if (ticketStatus === 'reused') return c.body(null, 204);
    if (ticketStatus === 'invalid') {
      if (!limiter.take('ticket:runtime-stream:invalid').allowed) {
        throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
      }
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }
    activeStreams += 1;

    try {
      return streamSSE(c, async (stream) => {
        try {
          await runRuntimeEventStream(adapter, stream, {
            initialCursor,
            workspaceId,
            pollIntervalMs,
            heartbeatIntervalMs,
          });
        } finally {
          activeStreams -= 1;
        }
      });
    } catch (error) {
      activeStreams -= 1;
      throw error;
    }
  });

  return app;
}
