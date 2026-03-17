import { Hono } from 'hono';
import { z } from 'zod';
import { requireBeastOperatorAuth } from '../../beasts/http/beast-auth.js';
import { InMemoryRateLimiter, requireBeastRateLimit, type BeastRateLimitOptions } from '../../beasts/http/beast-rate-limit.js';
import { UnknownTrackedAgentError } from '../../beasts/errors.js';
import { BeastCatalogService } from '../../beasts/services/beast-catalog-service.js';
import { BeastDispatchService } from '../../beasts/services/beast-dispatch-service.js';
import { BeastInterviewService } from '../../beasts/services/beast-interview-service.js';
import { BeastRunService } from '../../beasts/services/beast-run-service.js';
import type { AgentService } from '../../beasts/services/agent-service.js';
import type { BeastEventBus } from '../../beasts/events/beast-event-bus.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { BeastMetrics } from '../../beasts/telemetry/beast-metrics.js';
import { HttpError, parseJsonBody, validateBody } from '../middleware.js';
import { TransportSecurityService } from '../security/transport-security.js';

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
  executionMode: z.enum(['process', 'container']).optional(),
  startNow: z.boolean().optional(),
  moduleConfig: ModuleConfigSchema.optional(),
}).strict();

const InterviewAnswerBody = z.object({
  answer: z.string().min(1),
}).strict();

export interface BeastRoutesDeps {
  agents: AgentService;
  catalog: BeastCatalogService;
  dispatch: BeastDispatchService;
  runs: BeastRunService;
  interviews: BeastInterviewService;
  metrics: BeastMetrics;
  operatorToken: string;
  security: TransportSecurityService;
  rateLimit: BeastRateLimitOptions;
  eventBus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
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

  app.post('/v1/beasts/runs', async (c) => {
    const body = validateBody(CreateRunBody, await parseJsonBody(c));
    let run;
    try {
      run = await deps.dispatch.createRun({
        definitionId: body.definitionId,
        config: body.config,
        dispatchedBy: 'api',
        dispatchedByUser: 'operator',
        ...(body.trackedAgentId ? { trackedAgentId: body.trackedAgentId } : {}),
        ...(body.executionMode ? { executionMode: body.executionMode } : {}),
        ...(body.startNow !== undefined ? { startNow: body.startNow } : {}),
        ...(body.moduleConfig ? { moduleConfig: body.moduleConfig } : {}),
      });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError && body.trackedAgentId) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${body.trackedAgentId}' was not found`,
        );
      }
      throw error;
    }
    return c.json({ data: run }, 201);
  });

  app.get('/v1/beasts/runs', (c) => {
    return c.json({ data: { runs: deps.runs.listRuns() } });
  });

  app.get('/v1/beasts/runs/:runId', (c) => {
    const runId = c.req.param('runId');
    return c.json({
      data: {
        run: deps.runs.getRun(runId),
        attempts: deps.runs.listAttempts(runId),
        events: deps.runs.listEvents(runId),
      },
    });
  });

  app.get('/v1/beasts/runs/:runId/events', (c) => {
    return c.json({
      data: {
        events: deps.runs.listEvents(c.req.param('runId')),
      },
    });
  });

  app.get('/v1/beasts/runs/:runId/logs', async (c) => {
    return c.json({
      data: {
        logs: await deps.runs.readLogs(c.req.param('runId')),
      },
    });
  });

  app.post('/v1/beasts/runs/:runId/start', async (c) => {
    const run = await deps.runs.start(c.req.param('runId'), 'operator');
    return c.json({ data: run });
  });

  app.post('/v1/beasts/runs/:runId/stop', async (c) => {
    const run = await deps.runs.stop(c.req.param('runId'), 'operator');
    return c.json({ data: run });
  });

  app.post('/v1/beasts/runs/:runId/kill', async (c) => {
    const run = await deps.runs.kill(c.req.param('runId'), 'operator');
    return c.json({ data: run });
  });

  app.post('/v1/beasts/runs/:runId/restart', async (c) => {
    const run = await deps.runs.restart(c.req.param('runId'), 'operator');
    return c.json({ data: run });
  });

  app.post('/v1/beasts/interviews/:definitionId/start', (c) => {
    const session = deps.interviews.start(c.req.param('definitionId'));
    return c.json({ data: session }, 201);
  });

  app.post('/v1/beasts/interviews/:sessionId/answer', async (c) => {
    const body = validateBody(InterviewAnswerBody, await parseJsonBody(c));
    const progress = deps.interviews.answer(c.req.param('sessionId'), body.answer);
    return c.json({ data: progress });
  });

  return app;
}
