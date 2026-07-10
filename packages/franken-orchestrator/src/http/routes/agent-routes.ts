import { Hono } from 'hono';
import { z } from 'zod';
import { requireBeastOperatorAuth } from '../../beasts/http/beast-auth.js';
import { InMemoryRateLimiter, requireBeastRateLimit, type BeastRateLimitOptions } from '../../beasts/http/beast-rate-limit.js';
import { DeletedTrackedAgentError, UnknownTrackedAgentError } from '../../beasts/errors.js';
import type { AgentService } from '../../beasts/services/agent-service.js';
import type { BeastDispatchService } from '../../beasts/services/beast-dispatch-service.js';
import type { BeastRunService } from '../../beasts/services/beast-run-service.js';
import {
  BEAST_CONTROL_MAX_BODY_SIZE,
  HttpError,
  parseJsonBody,
  requestSizeLimit,
  validateBody,
} from '../middleware.js';
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

const CreateAgentBody = z.object({
  definitionId: z.string().min(1),
  initAction: z.object({
    kind: z.enum(['design-interview', 'chunk-plan', 'martin-loop']),
    command: z.string().min(1),
    config: z.record(z.string(), z.unknown()),
    chatSessionId: z.string().min(1).optional(),
  }).strict(),
  initConfig: z.record(z.string(), z.unknown()),
  chatSessionId: z.string().min(1).optional(),
  moduleConfig: ModuleConfigSchema.optional(),
  executionMode: z.enum(['process', 'container']).optional(),
  autoDispatch: z.boolean().optional(),
}).strict();

const PatchAgentConfigBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  moduleConfig: ModuleConfigSchema.optional(),
}).strict();

export interface AgentRoutesDeps {
  agents: AgentService;
  dispatch?: BeastDispatchService;
  runs: BeastRunService;
  operatorToken: string;
  security: TransportSecurityService;
  rateLimit?: BeastRateLimitOptions;
}

export function agentRoutes(deps: AgentRoutesDeps): Hono {
  const app = new Hono();
  const auth = requireBeastOperatorAuth({
    operatorToken: deps.operatorToken,
    security: deps.security,
  });

  app.use('/v1/beasts/agents', auth);
  app.use('/v1/beasts/agents/*', auth);
  app.use('/v1/beasts/agents', requestSizeLimit(BEAST_CONTROL_MAX_BODY_SIZE));
  app.use('/v1/beasts/agents/*', requestSizeLimit(BEAST_CONTROL_MAX_BODY_SIZE));
  if (deps.rateLimit) {
    const limiter = new InMemoryRateLimiter(deps.rateLimit);
    const rateLimit = requireBeastRateLimit(
      limiter,
      (authHeader, path) => `${authHeader ?? 'anonymous'}:${path}`,
    );
    app.use('/v1/beasts/agents', rateLimit);
  }

  app.post('/v1/beasts/agents', async (c) => {
    const body = validateBody(CreateAgentBody, await parseJsonBody(c));
    const agent = deps.agents.createAgent({
      definitionId: body.definitionId,
      source: body.chatSessionId ? 'chat' : 'dashboard',
      createdByUser: body.chatSessionId ? `chat-session:${body.chatSessionId}` : 'operator',
      initAction: body.initAction,
      initConfig: body.initConfig,
      ...(body.chatSessionId ? { chatSessionId: body.chatSessionId } : {}),
      ...(body.executionMode ? { executionMode: body.executionMode } : {}),
      ...(body.moduleConfig ? { moduleConfig: body.moduleConfig } : {}),
    });
    deps.agents.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.created',
      message: `Created tracked agent for ${agent.definitionId}`,
      payload: {
        source: agent.source,
      },
    });

    if (body.chatSessionId) {
      deps.agents.appendEvent(agent.id, {
        level: 'info',
        type: 'agent.chat.bound',
        message: `Bound chat session ${body.chatSessionId}`,
        payload: {
          chatSessionId: body.chatSessionId,
        },
      });
    }
    deps.agents.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.command.sent',
      message: `Sent init command ${body.initAction.command}`,
      payload: {
        command: body.initAction.command,
      },
    });

    if (body.autoDispatch === false || !deps.dispatch || !shouldDispatchOnCreate(body.initAction.kind)) {
      const deferredAgent = deps.dispatch && shouldDispatchOnCreate(body.initAction.kind)
        ? deps.agents.updateAgent(agent.id, { status: 'stopped' })
        : agent;
      return c.json({ data: deferredAgent }, 201);
    }

    try {
      await deps.dispatch.createRun({
        definitionId: body.definitionId,
        config: body.initConfig,
        dispatchedBy: body.chatSessionId ? 'chat' : 'api',
        dispatchedByUser: body.chatSessionId ? `chat-session:${body.chatSessionId}` : 'operator',
        trackedAgentId: agent.id,
        startNow: true,
        ...(body.executionMode ? { executionMode: body.executionMode } : {}),
        ...(body.moduleConfig ? { moduleConfig: body.moduleConfig } : {}),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[agent-routes] Dispatch failed for ${agent.id}: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      deps.agents.updateAgent(agent.id, { status: 'failed' });
      deps.agents.appendEvent(agent.id, {
        level: 'error',
        type: 'agent.dispatch.failed',
        message: `Dispatch failed: ${errorMessage}`,
        payload: { error: errorMessage },
      });
      return c.json({ data: deps.agents.getAgent(agent.id) }, 201);
    }

    return c.json({ data: deps.agents.getAgent(agent.id) }, 201);
  });

  app.get('/v1/beasts/agents', (c) => {
    return c.json({
      data: {
        agents: deps.agents.listAgents(),
      },
    });
  });

  app.get('/v1/beasts/agents/:agentId', (c) => {
    const agentId = c.req.param('agentId');
    try {
      return c.json({
        data: deps.agents.getAgentDetail(agentId),
      });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.patch('/v1/beasts/agents/:agentId/config', async (c) => {
    const agentId = c.req.param('agentId');
    const body = validateBody(PatchAgentConfigBody, await parseJsonBody(c));
    try {
      const current = getMutableAgent(deps, agentId);
      const hasIdentityPatch = body.name !== undefined || body.description !== undefined;
      const updated = deps.agents.updateAgent(agentId, {
        ...(hasIdentityPatch ? { initConfig: patchInitConfigIdentity(current.initConfig, body) } : {}),
        ...(body.moduleConfig !== undefined ? { moduleConfig: body.moduleConfig } : {}),
      });
      if (body.moduleConfig !== undefined && current.dispatchRunId) {
        const run = deps.runs.getRun(current.dispatchRunId);
        if (run && deps.runs.listAttempts(run.id).length === 0) {
          deps.runs.updateConfigSnapshot(run.id, {
            ...run.configSnapshot,
            modules: body.moduleConfig,
          });
        }
      }
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.config.updated',
        message: 'Updated tracked agent configuration from the dashboard',
        payload: {
          fields: [
            ...(hasIdentityPatch ? ['identity'] : []),
            ...(body.moduleConfig !== undefined ? ['moduleConfig'] : []),
          ],
        },
      });
      return c.json({ data: updated });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.post('/v1/beasts/agents/:agentId/start', async (c) => {
    const agentId = c.req.param('agentId');
    try {
      const agent = getMutableAgent(deps, agentId);
      if (agent.status !== 'stopped' && agent.status !== 'failed' && agent.status !== 'completed') {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_STARTABLE',
          `Tracked agent '${agentId}' is not in a startable state`,
        );
      }

      if (agent.dispatchRunId) {
        const existingRun = deps.runs.getRun(agent.dispatchRunId);
        const run = shouldDispatchFreshRunForModuleConfig(agent, existingRun)
          ? await dispatchDetachedAgent(deps, agentId)
          : await deps.runs.start(agent.dispatchRunId, 'operator');
        deps.agents.appendEvent(agentId, {
          level: 'info',
          type: 'agent.start.requested',
          message: `Start requested for linked run ${run.id}`,
          payload: {
            runId: run.id,
          },
        });
        return c.json({ data: run });
      }

      const run = await dispatchDetachedAgent(deps, agentId);
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.start.requested',
        message: `Start requested for new linked run ${run.id}`,
        payload: {
          runId: run.id,
        },
      });
      return c.json({ data: run });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.post('/v1/beasts/agents/:agentId/stop', async (c) => {
    const agentId = c.req.param('agentId');
    try {
      const agent = getMutableAgent(deps, agentId);
      if (agent.dispatchRunId) {
        const run = await deps.runs.stop(agent.dispatchRunId, 'operator');
        deps.agents.appendEvent(agentId, {
          level: 'info',
          type: 'agent.stop.requested',
          message: `Stop requested for linked run ${agent.dispatchRunId}`,
          payload: {
            runId: agent.dispatchRunId,
          },
        });
        return c.json({ data: run });
      }

      const updated = deps.agents.updateAgent(agentId, { status: 'stopped' });
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.stop.requested',
        message: 'Stop requested before a linked run was created',
        payload: {},
      });
      return c.json({ data: updated });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.post('/v1/beasts/agents/:agentId/restart', async (c) => {
    const agentId = c.req.param('agentId');
    try {
      const agent = getMutableAgent(deps, agentId);
      if (agent.dispatchRunId) {
        const existingRun = deps.runs.getRun(agent.dispatchRunId);
        const run = shouldDispatchFreshRunForModuleConfig(agent, existingRun)
          ? await dispatchReplacementAgentRun(deps, agentId, existingRun)
          : await deps.runs.restart(agent.dispatchRunId, 'operator');
        deps.agents.appendEvent(agentId, {
          level: 'info',
          type: 'agent.restart.requested',
          message: `Restart requested for linked run ${run.id}`,
          payload: {
            runId: run.id,
          },
        });
        return c.json({ data: run });
      }

      if (agent.status !== 'stopped') {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_STARTABLE',
          `Tracked agent '${agentId}' cannot restart without a linked run`,
        );
      }

      const run = await dispatchDetachedAgent(deps, agentId);
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.restart.requested',
        message: `Restart requested with new linked run ${run.id}`,
        payload: {
          runId: run.id,
        },
      });
      return c.json({ data: run });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.post('/v1/beasts/agents/:agentId/kill', async (c) => {
    const agentId = c.req.param('agentId');
    try {
      const agent = getMutableAgent(deps, agentId);
      if (!agent.dispatchRunId) {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_KILLABLE',
          `Tracked agent '${agentId}' has no linked run to kill`,
        );
      }
      if (agent.status !== 'running') {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_KILLABLE',
          `Tracked agent '${agentId}' is not running`,
        );
      }
      const run = await deps.runs.kill(agent.dispatchRunId, 'operator');
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.kill.requested',
        message: `Kill requested for linked run ${agent.dispatchRunId}`,
        payload: {
          runId: agent.dispatchRunId,
        },
      });
      return c.json({ data: run });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.post('/v1/beasts/agents/:agentId/resume', async (c) => {
    const agentId = c.req.param('agentId');
    try {
      const agent = getMutableAgent(deps, agentId);
      if (!agent.dispatchRunId) {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_RESUMABLE',
          `Tracked agent '${agentId}' has no linked run to resume`,
        );
      }
      if (agent.status !== 'stopped') {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_RESUMABLE',
          `Tracked agent '${agentId}' is not stopped`,
        );
      }
      const existingRun = deps.runs.getRun(agent.dispatchRunId);
      const run = shouldDispatchFreshRunForModuleConfig(agent, existingRun)
        ? await dispatchDetachedAgent(deps, agentId)
        : await deps.runs.start(agent.dispatchRunId, 'operator');
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.resume.requested',
        message: `Resume requested for linked run ${run.id}`,
        payload: {
          runId: run.id,
        },
      });
      return c.json({ data: run });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  app.delete('/v1/beasts/agents/:agentId', (c) => {
    const agentId = c.req.param('agentId');
    try {
      const agent = getMutableAgent(deps, agentId);
      if (agent.status !== 'stopped' && agent.status !== 'failed' && agent.status !== 'completed') {
        throw new HttpError(
          409,
          'TRACKED_AGENT_NOT_DELETABLE',
          `Tracked agent '${agentId}' must be stopped, failed, or completed to delete`,
        );
      }
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.delete.requested',
        message: 'Soft-deleted tracked agent from the dashboard',
        payload: {},
      });
      deps.agents.softDeleteAgent(agentId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throw error;
    }
  });

  return app;
}

function getMutableAgent(
  deps: AgentRoutesDeps,
  agentId: string,
): ReturnType<AgentService['getAgent']> {
  try {
    return deps.agents.getMutableAgent(agentId);
  } catch (error) {
    if (!(error instanceof DeletedTrackedAgentError)) {
      throw error;
    }
    throw new HttpError(
      409,
      'TRACKED_AGENT_DELETED',
      `Tracked agent '${agentId}' has been deleted`,
    );
  }
}

function shouldDispatchOnCreate(kind: z.infer<typeof CreateAgentBody>['initAction']['kind']): boolean {
  return kind === 'chunk-plan' || kind === 'martin-loop' || kind === 'design-interview';
}

function patchInitConfigIdentity(
  initConfig: Readonly<Record<string, unknown>>,
  patchBody: z.infer<typeof PatchAgentConfigBody>,
): Readonly<Record<string, unknown>> {
  const currentIdentity = isRecord(initConfig.identity) ? initConfig.identity : {};
  return {
    ...initConfig,
    identity: {
      ...currentIdentity,
      ...(patchBody.name !== undefined ? { name: patchBody.name } : {}),
      ...(patchBody.description !== undefined ? { description: patchBody.description } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldDispatchFreshRunForModuleConfig(
  agent: ReturnType<AgentService['getAgent']>,
  run: ReturnType<BeastRunService['getRun']>,
): boolean {
  if (!run || agent.moduleConfig === undefined || run.attemptCount === 0) return false;
  return JSON.stringify(run.configSnapshot.modules ?? {}) !== JSON.stringify(agent.moduleConfig);
}

async function dispatchReplacementAgentRun(
  deps: AgentRoutesDeps,
  agentId: string,
  existingRun: ReturnType<BeastRunService['getRun']>,
) {
  if (existingRun?.status === 'running') {
    await deps.runs.stop(existingRun.id, 'operator');
  }
  return dispatchDetachedAgent(deps, agentId);
}

async function dispatchDetachedAgent(
  deps: AgentRoutesDeps,
  agentId: string,
) {
  const agent = getMutableAgent(deps, agentId);
  if (!deps.dispatch || !shouldDispatchOnCreate(agent.initAction.kind)) {
    throw new HttpError(
      409,
      'TRACKED_AGENT_NOT_STARTABLE',
      `Tracked agent '${agentId}' cannot be started without a linked run`,
    );
  }

  return deps.dispatch.createRun({
    definitionId: agent.definitionId,
    config: agent.initConfig,
    dispatchedBy: 'dashboard',
    dispatchedByUser: 'operator',
    trackedAgentId: agent.id,
    startNow: true,
    ...(agent.executionMode ? { executionMode: agent.executionMode } : {}),
    ...(agent.moduleConfig ? { moduleConfig: agent.moduleConfig } : {}),
  });
}
