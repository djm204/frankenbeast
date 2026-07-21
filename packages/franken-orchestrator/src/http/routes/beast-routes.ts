import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireBeastOperatorAuth } from '../../beasts/http/beast-auth.js';
import { InMemoryRateLimiter, requireBeastRateLimit, type BeastRateLimitOptions } from '../../beasts/http/beast-rate-limit.js';
import { UnknownBeastDefinitionError, UnknownTrackedAgentError } from '../../beasts/errors.js';
import { InvalidBeastInterviewAnswerError } from '../../beasts/interview-answers.js';
import { BeastCatalogService } from '../../beasts/services/beast-catalog-service.js';
import { BeastDispatchService } from '../../beasts/services/beast-dispatch-service.js';
import {
  BeastInterviewService,
  UnknownBeastInterviewSessionError,
} from '../../beasts/services/beast-interview-service.js';
import { BeastRunService, UnknownBeastRunError } from '../../beasts/services/beast-run-service.js';
import { CapacityReservationError } from '../../beasts/services/capacity-reservation-policy.js';
import { AgentToolPolicyError } from '../../beasts/services/role-tool-manifest.js';
import type { MaintenanceModeService } from '../../beasts/services/maintenance-mode-service.js';
import { MaintenanceModeError } from '../../beasts/services/maintenance-mode-service.js';
import type { AgentService } from '../../beasts/services/agent-service.js';
import type { BeastEventBus } from '../../beasts/events/beast-event-bus.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { BeastMetrics } from '../../beasts/telemetry/beast-metrics.js';
import {
  BEAST_CONTROL_MAX_BODY_SIZE,
  HttpError,
  parseJsonBody,
  requestSizeLimit,
  validateBody,
} from '../middleware.js';
import { wallClockNow } from '@franken/types';
import { TransportSecurityService } from '../security/transport-security.js';
import type { BeastRun, BeastRunAttempt, BeastRunEvent } from '../../beasts/types.js';
import {
  DEFAULT_BEAST_RUN_PAGE_LIMIT,
  InvalidBeastRunCursorError,
  MAX_BEAST_RUN_PAGE_LIMIT,
} from '../../beasts/repository/sqlite-beast-repository.js';

type BeastRunResponse = BeastRun & {
  readonly containerId?: unknown;
  readonly containerName?: unknown;
  readonly containerRuntime?: unknown;
  readonly image?: unknown;
  readonly containerImage?: unknown;
  readonly containerNetwork?: unknown;
  readonly resourceSnapshot?: unknown;
  readonly resources?: unknown;
  readonly workspaceContainerPath?: unknown;
};

const DEFAULT_BEAST_EVENT_PAGE_LIMIT = 100;
const MAX_BEAST_EVENT_PAGE_LIMIT = 500;

function parseBeastEventPagination(query: Record<string, string>): { afterSequence: number; limit: number } {
  const afterSequenceRaw = query.afterSequence ?? '0';
  const limitRaw = query.limit ?? String(DEFAULT_BEAST_EVENT_PAGE_LIMIT);
  const isUnsignedInteger = (value: string): boolean => /^(0|[1-9]\d*)$/.test(value);
  const afterSequence = isUnsignedInteger(afterSequenceRaw) ? Number(afterSequenceRaw) : Number.NaN;
  const limit = isUnsignedInteger(limitRaw) ? Number(limitRaw) : Number.NaN;
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BEAST_EVENT_PAGE_LIMIT) {
    throw new HttpError(
      400,
      'INVALID_BEAST_EVENT_PAGINATION',
      `afterSequence must be a non-negative integer and limit must be between 1 and ${MAX_BEAST_EVENT_PAGE_LIMIT}`,
    );
  }
  return { afterSequence, limit };
}

function runWithContainerFields(run: BeastRun | undefined, attempts: BeastRunAttempt[]): BeastRunResponse | undefined {
  run = redactRunHostPaths(run);
  if (!run || run.executionMode !== 'container') {
    return run;
  }
  const currentAttempt = run.currentAttemptId
    ? attempts.find((attempt) => attempt.id === run.currentAttemptId)
    : attempts.at(-1);
  const metadata = currentAttempt?.executorMetadata;
  if (!metadata) {
    return run;
  }
  return {
    ...run,
    ...(metadata.containerId !== undefined ? { containerId: metadata.containerId } : {}),
    ...(metadata.containerName !== undefined ? { containerName: metadata.containerName } : {}),
    ...(metadata.containerRuntime !== undefined ? { containerRuntime: metadata.containerRuntime } : {}),
    ...(metadata.image !== undefined ? { image: metadata.image } : {}),
    ...(metadata.containerImage !== undefined ? { containerImage: metadata.containerImage } : {}),
    ...(metadata.containerNetwork !== undefined ? { containerNetwork: metadata.containerNetwork } : {}),
    ...(metadata.resourceSnapshot !== undefined ? { resourceSnapshot: metadata.resourceSnapshot } : {}),
    ...(metadata.resources !== undefined ? { resources: metadata.resources } : {}),
    ...(metadata.workspaceContainerPath !== undefined ? { workspaceContainerPath: metadata.workspaceContainerPath } : {}),
  };
}

function redactHostExecutionPaths(attempt: BeastRunAttempt): BeastRunAttempt {
  if (!attempt.executorMetadata) {
    return attempt;
  }
  const executorMetadata = { ...attempt.executorMetadata };
  delete executorMetadata.workspaceHostPath;
  delete executorMetadata.command;
  delete executorMetadata.args;
  delete executorMetadata.dockerCommand;
  delete executorMetadata.dockerArgs;
  delete executorMetadata.worktreePath;
  delete executorMetadata.worktreeExecutionCwd;
  delete executorMetadata.worktreeProjectRoot;
  return { ...attempt, executorMetadata };
}

function redactRunHostPaths(run: BeastRun | undefined): BeastRun | undefined {
  if (!run) return run;
  const configSnapshot = { ...run.configSnapshot };
  delete configSnapshot.projectRoot;
  return { ...run, configSnapshot };
}

function redactEventHostPaths(event: BeastRunEvent): BeastRunEvent {
  const payload = { ...event.payload };
  delete payload.command;
  delete payload.args;
  delete payload.dockerCommand;
  delete payload.dockerArgs;
  return { ...event, payload };
}

function redactEventPageHostPaths<T extends { readonly events: BeastRunEvent[] }>(page: T): T {
  return { ...page, events: page.events.map(redactEventHostPaths) };
}

function attemptsForContainerRun(run: BeastRun | undefined, deps: BeastRoutesDeps): BeastRunAttempt[] {
  if (!run || run.executionMode !== 'container') {
    return [];
  }
  const currentAttempt = deps.runs.getCurrentAttemptForResponse(run);
  return currentAttempt ? [redactHostExecutionPaths(currentAttempt)] : [];
}

function runResponse(run: BeastRun | undefined, deps: BeastRoutesDeps): BeastRunResponse | undefined {
  return runWithContainerFields(
    deps.runs.sanitizeRunForResponse(run),
    attemptsForContainerRun(run, deps),
  );
}

function beastRunNotFound(runId: string): HttpError {
  return new HttpError(404, 'BEAST_RUN_NOT_FOUND', `Beast run '${runId}' was not found`);
}

function throwCapacityReservationError(error: unknown): void {
  if (error instanceof CapacityReservationError) {
    throw new HttpError(
      409,
      'AGENT_CAPACITY_RESERVED',
      'Agent capacity is reserved for urgent matching work',
      {
        decision: error.decision,
        capacity: error.state,
      },
    );
  }
}

function throwAgentToolPolicyError(error: unknown): void {
  if (error instanceof AgentToolPolicyError) {
    throw new HttpError(
      403,
      'AGENT_TOOL_POLICY_DENIED',
      error.message,
      { validation: error.validation },
    );
  }
}

class InterviewSessionNotFoundHttpError extends HttpError {
  constructor(sessionId: string) {
    super(404, 'INTERVIEW_SESSION_NOT_FOUND', `Beast interview session '${sessionId}' was not found`);
  }
}

function throwKnownRunError(runId: string, error: unknown): never {
  if (error instanceof MaintenanceModeError) {
    throw new HttpError(423, 'MAINTENANCE_MODE_ACTIVE', error.message, { maintenance: error.state });
  }
  throwAgentToolPolicyError(error);
  throwCapacityReservationError(error);
  if (error instanceof UnknownBeastRunError) {
    throw beastRunNotFound(runId);
  }
  throw error;
}

async function requireKnownRunAction(runId: string, action: () => Promise<BeastRun>): Promise<BeastRun> {
  try {
    return await action();
  } catch (error) {
    throwKnownRunError(runId, error);
  }
}

const ModuleConfigSchema = z.object({
  firewall: z.boolean().optional(),
  skills: z.boolean().optional(),
  memory: z.boolean().optional(),
  planner: z.boolean().optional(),
  critique: z.boolean().optional(),
  governor: z.boolean().optional(),
  heartbeat: z.boolean().optional(),
}).strict();

const CreateRunBody = z.object({
  definitionId: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  trackedAgentId: z.string().min(1).optional(),
  chatSessionId: z.string().min(1).optional(),
  executionMode: z.enum(['process', 'container']).optional(),
  startNow: z.boolean().optional(),
  moduleConfig: ModuleConfigSchema.optional(),
}).strict();

const InterviewAnswerBody = z.object({
  answer: z.string().min(1),
}).strict();

const StrictQueryInteger = z.string()
  .regex(/^(?:0|[1-9]\d*)$/u)
  .transform(Number)
  .refine(Number.isSafeInteger);

const BeastLogPageQuery = z.object({
  offset: StrictQueryInteger.optional(),
  limit: StrictQueryInteger.refine((value) => value >= 1 && value <= 2_000).optional(),
  tail: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  maxBytes: StrictQueryInteger.refine((value) => value >= 1_024 && value <= 1024 * 1024).optional(),
}).strict();

const DEFAULT_BEAST_LOG_LIMIT = 200;
const DEFAULT_BEAST_LOG_MAX_BYTES = 256 * 1024;

function parseBeastLogPageQuery(searchParams: URLSearchParams): {
  offset?: number;
  limit: number;
  tail: boolean;
  maxBytes: number;
} {
  const keys = [...searchParams.keys()];
  if (new Set(keys).size !== keys.length) {
    throw new HttpError(400, 'INVALID_BEAST_LOG_QUERY', 'Duplicate Beast log pagination query parameter');
  }
  const query = Object.fromEntries(searchParams.entries());
  const result = BeastLogPageQuery.safeParse(query);
  if (!result.success) {
    throw new HttpError(400, 'INVALID_BEAST_LOG_QUERY', 'Invalid Beast log pagination query', result.error.issues);
  }
  const tail = result.data.tail ?? result.data.offset === undefined;
  if (tail && result.data.offset !== undefined) {
    throw new HttpError(400, 'INVALID_BEAST_LOG_QUERY', 'offset cannot be combined with tail=true');
  }
  return {
    ...(result.data.offset !== undefined ? { offset: result.data.offset } : {}),
    limit: result.data.limit ?? DEFAULT_BEAST_LOG_LIMIT,
    tail,
    maxBytes: result.data.maxBytes ?? DEFAULT_BEAST_LOG_MAX_BYTES,
  };
}

type BeastLogPageResponse = {
  logs: string[];
  page: {
    offset: number;
    nextOffset: number;
    hasMore: boolean;
    tail: boolean;
    bytes: number;
  };
};

function boundBeastLogHttpResponse(response: BeastLogPageResponse, maxBytes: number): { data: BeastLogPageResponse } {
  const bounded: BeastLogPageResponse = {
    logs: [...response.logs],
    page: { ...response.page },
  };
  const envelope = { data: bounded };
  while (Buffer.byteLength(JSON.stringify(envelope)) > maxBytes && bounded.logs.length > 0) {
    if (bounded.logs.length === 1) {
      bounded.logs[0] = '[log line omitted: exceeds response byte budget]';
      bounded.page.hasMore = true;
      bounded.page.nextOffset = bounded.page.offset + 1;
      bounded.page.bytes = Buffer.byteLength(JSON.stringify(bounded.logs));
      if (Buffer.byteLength(JSON.stringify(envelope)) <= maxBytes) break;
    }
    if (bounded.page.tail) bounded.logs.shift();
    else bounded.logs.pop();
    bounded.page.hasMore = true;
    bounded.page.nextOffset = bounded.page.offset + bounded.logs.length;
    bounded.page.bytes = Buffer.byteLength(JSON.stringify(bounded.logs));
  }
  return envelope;
}

export interface BeastRoutesDeps {
  agents: AgentService;
  catalog: BeastCatalogService;
  dispatch: BeastDispatchService;
  runs: BeastRunService;
  interviews: BeastInterviewService;
  maintenance?: MaintenanceModeService | undefined;
  metrics: BeastMetrics;
  operatorToken: string;
  security: TransportSecurityService;
  rateLimit: BeastRateLimitOptions;
  eventBus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  drainMutatingRequest?: ((next: () => Promise<void>) => Promise<void>) | undefined;
}

export function beastRoutes(deps: BeastRoutesDeps): Hono {
  const app = new Hono();
  const limiter = new InMemoryRateLimiter(deps.rateLimit);
  const auth = requireBeastOperatorAuth({
    operatorToken: deps.operatorToken,
    security: deps.security,
  });
  const rateLimit = requireBeastRateLimit(
    limiter,
    (authHeader, path) => `${authHeader ?? 'anonymous'}:${path}`,
  );

  app.use('/v1/beasts/*', auth);
  app.use('/v1/beasts/*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      if (deps.drainMutatingRequest) {
        await deps.drainMutatingRequest(next);
        return;
      }
    }
    await next();
  });
  app.use('/v1/beasts/*', requestSizeLimit(BEAST_CONTROL_MAX_BODY_SIZE));
  app.use('/v1/beasts/runs', rateLimit);
  app.use('/v1/beasts/interviews/*', rateLimit);

  app.get('/v1/beasts/catalog', (c) => {
    return c.json({
      data: deps.catalog.listDefinitions().map((definition) => ({
        id: definition.id,
        version: definition.version,
        label: definition.label,
        description: definition.description,
        executionModeDefault: definition.executionModeDefault,
        interviewPrompts: definition.interviewPrompts,
      })),
    });
  });

  app.get('/v1/beasts/runtime/container', async (c) => {
    return c.json({ data: await getContainerRuntimeStatus() });
  });

  app.get('/v1/beasts/maintenance', (c) => {
    return c.json({
      data: deps.maintenance?.getState() ?? {
        enabled: false,
        allowedCommands: [],
      },
    });
  });

  app.post('/v1/beasts/runs', async (c) => {
    const body = validateBody(CreateRunBody, await parseJsonBody(c));
    let run;
    try {
      run = await deps.dispatch.createRun({
        definitionId: body.definitionId,
        config: body.config,
        dispatchedBy: body.chatSessionId ? 'chat' : 'api',
        dispatchedByUser: body.chatSessionId ? `chat-session:${body.chatSessionId}` : 'operator',
        ...(body.trackedAgentId ? { trackedAgentId: body.trackedAgentId } : {}),
        ...(body.executionMode ? { executionMode: body.executionMode } : {}),
        ...(body.startNow !== undefined ? { startNow: body.startNow } : {}),
        ...(body.moduleConfig ? { moduleConfig: body.moduleConfig } : {}),
      });
    } catch (error) {
      if (error instanceof MaintenanceModeError) {
        if (body.trackedAgentId) {
          try {
            const trackedAgent = deps.agents.getAgent(body.trackedAgentId);
            if (trackedAgent.status === 'initializing') {
              deps.agents.updateAgent(body.trackedAgentId, { status: 'stopped' });
              deps.agents.appendEvent(body.trackedAgentId, {
                level: 'warning',
                type: 'agent.dispatch.paused',
                message: error.message,
                payload: { maintenance: error.state },
              });
            }
          } catch (cleanupError) {
            if (!(cleanupError instanceof UnknownTrackedAgentError)) {
              throw cleanupError;
            }
          }
        }
        throw new HttpError(423, 'MAINTENANCE_MODE_ACTIVE', error.message, { maintenance: error.state });
      }
      if (error instanceof UnknownBeastDefinitionError) {
        throw new HttpError(
          404,
          'BEAST_DEFINITION_NOT_FOUND',
          `Beast definition '${body.definitionId}' was not found`,
        );
      }
      if (error instanceof UnknownTrackedAgentError && body.trackedAgentId) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${body.trackedAgentId}' was not found`,
        );
      }
      if (error instanceof AgentToolPolicyError && body.trackedAgentId) {
        try {
          const trackedAgent = deps.agents.getAgent(body.trackedAgentId);
          if (trackedAgent.status === 'initializing') {
            deps.agents.updateAgent(body.trackedAgentId, { status: 'stopped' });
            deps.agents.appendEvent(body.trackedAgentId, {
              level: 'warning',
              type: 'agent.dispatch.denied',
              message: error.message,
              payload: { denials: error.validation.denials },
            });
          }
        } catch (cleanupError) {
          if (!(cleanupError instanceof UnknownTrackedAgentError)) {
            throw cleanupError;
          }
        }
      }
      throwAgentToolPolicyError(error);
      if (error instanceof ZodError) {
        throw new HttpError(
          422,
          'BEAST_CONFIG_VALIDATION_ERROR',
          'Beast run config validation failed',
          error.issues,
        );
      }
      throwCapacityReservationError(error);
      throw error;
    }
    return c.json({ data: runResponse(run, deps) }, 201);
  });

  app.get('/v1/beasts/runs', (c) => {
    const rawLimit = c.req.query('limit');
    const limit = rawLimit === undefined ? DEFAULT_BEAST_RUN_PAGE_LIMIT : Number(rawLimit);
    if (rawLimit !== undefined
      && (!/^\d+$/.test(rawLimit)
        || !Number.isSafeInteger(limit)
        || limit < 1
        || limit > MAX_BEAST_RUN_PAGE_LIMIT)) {
      throw new HttpError(
        400,
        'INVALID_BEAST_RUN_PAGE_LIMIT',
        `Beast run page limit must be an integer between 1 and ${MAX_BEAST_RUN_PAGE_LIMIT}`,
      );
    }
    let page;
    try {
      const cursor = c.req.query('cursor');
      page = deps.runs.listRunPageForResponse({
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      });
    } catch (error) {
      if (error instanceof InvalidBeastRunCursorError) {
        throw new HttpError(400, 'INVALID_BEAST_RUN_PAGE_CURSOR', error.message);
      }
      throw error;
    }
    return c.json({
      data: {
        runs: page.runs.map((run) => (
          runWithContainerFields(run, attemptsForContainerRun(run, deps))
        )),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      },
    });
  });

  app.get('/v1/beasts/runs/:runId', (c) => {
    const runId = c.req.param('runId');
    const run = deps.runs.getRun(runId);
    if (!run) {
      throw beastRunNotFound(runId);
    }
    const attempts = deps.runs.listAttemptsForResponse(runId).map(redactHostExecutionPaths);
    return c.json({
      data: {
        run: runWithContainerFields(deps.runs.sanitizeRunForResponse(run), attempts),
        attempts,
        events: redactEventPageHostPaths(
          deps.runs.listEventPageForResponse(runId, 0, DEFAULT_BEAST_EVENT_PAGE_LIMIT),
        ).events,
      },
    });
  });

  app.get('/v1/beasts/runs/:runId/events', (c) => {
    const runId = c.req.param('runId');
    const { afterSequence, limit } = parseBeastEventPagination(c.req.query());
    try {
      return c.json({
        data: redactEventPageHostPaths(deps.runs.listEventPageForResponse(runId, afterSequence, limit)),
      });
    } catch (error) {
      throwKnownRunError(runId, error);
    }
  });

  app.get('/v1/beasts/runs/:runId/logs', async (c) => {
    const runId = c.req.param('runId');
    const options = parseBeastLogPageQuery(new URL(c.req.url).searchParams);
    try {
      const page = await deps.runs.readLogsPage(runId, options);
      return c.json(boundBeastLogHttpResponse({
        logs: page.lines,
        page: {
          offset: page.offset,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          tail: page.tail,
          bytes: page.bytes,
        },
      }, options.maxBytes));
    } catch (error) {
      throwKnownRunError(runId, error);
    }
  });

  app.post('/v1/beasts/runs/:runId/start', async (c) => {
    const runId = c.req.param('runId');
    const run = await requireKnownRunAction(runId, () => deps.runs.start(runId, 'operator'));
    return c.json({ data: runResponse(run, deps) });
  });

  app.post('/v1/beasts/runs/:runId/stop', async (c) => {
    const runId = c.req.param('runId');
    const run = await requireKnownRunAction(runId, () => deps.runs.stop(runId, 'operator'));
    return c.json({ data: runResponse(run, deps) });
  });

  app.post('/v1/beasts/runs/:runId/kill', async (c) => {
    const runId = c.req.param('runId');
    const run = await requireKnownRunAction(runId, () => deps.runs.kill(runId, 'operator'));
    return c.json({ data: runResponse(run, deps) });
  });

  app.post('/v1/beasts/runs/:runId/restart', async (c) => {
    const runId = c.req.param('runId');
    const run = await requireKnownRunAction(runId, () => deps.runs.restart(runId, 'operator'));
    return c.json({ data: runResponse(run, deps) });
  });

  app.post('/v1/beasts/interviews/:definitionId/start', (c) => {
    const session = deps.interviews.start(c.req.param('definitionId'));
    return c.json({ data: session }, 201);
  });

  app.post('/v1/beasts/interviews/:sessionId/answer', async (c) => {
    const body = validateBody(InterviewAnswerBody, await parseJsonBody(c));
    const sessionId = c.req.param('sessionId');
    let progress;
    try {
      progress = deps.interviews.answer(sessionId, body.answer);
    } catch (error) {
      if (error instanceof UnknownBeastInterviewSessionError) {
        throw new InterviewSessionNotFoundHttpError(sessionId);
      }
      if (error instanceof InvalidBeastInterviewAnswerError) {
        throw new HttpError(400, 'INVALID_INTERVIEW_ANSWER', error.message, {
          promptKey: error.prompt.key,
          prompt: error.prompt.prompt,
          options: error.prompt.options,
        });
      }
      throw error;
    }
    return c.json({ data: progress });
  });

  return app;
}

const execFileAsync = promisify(execFile);
const CONTAINER_RUNTIME_STATUS_CACHE_MS = 30_000;

type ContainerRuntimeStatus = { available: boolean; reason?: string };

let containerRuntimeStatusCache: {
  readonly checkedAt: number;
  readonly status: ContainerRuntimeStatus;
} | undefined;
let containerRuntimeStatusProbe: Promise<ContainerRuntimeStatus> | undefined;

async function getContainerRuntimeStatus(now = wallClockNow()): Promise<ContainerRuntimeStatus> {
  if (containerRuntimeStatusCache && now - containerRuntimeStatusCache.checkedAt < CONTAINER_RUNTIME_STATUS_CACHE_MS) {
    return containerRuntimeStatusCache.status;
  }

  containerRuntimeStatusProbe ??= probeContainerRuntime()
    .then((status) => {
      containerRuntimeStatusCache = { checkedAt: wallClockNow(), status };
      return status;
    })
    .finally(() => {
      containerRuntimeStatusProbe = undefined;
    });

  return containerRuntimeStatusProbe;
}

async function probeContainerRuntime(): Promise<ContainerRuntimeStatus> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      encoding: 'utf8',
      timeout: 2000,
    });
    return { available: true };
  } catch (error) {
    const reason = error instanceof Error && error.message
      ? error.message
      : 'Docker runtime is unavailable.';
    return {
      available: false,
      reason: `Docker runtime unavailable: ${reason}`,
    };
  }
}
