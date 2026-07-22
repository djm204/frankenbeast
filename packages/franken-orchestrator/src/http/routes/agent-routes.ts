import { Hono } from 'hono';
import { z } from 'zod';
import { requireBeastOperatorAuth } from '../../beasts/http/beast-auth.js';
import { InMemoryRateLimiter, requireBeastRateLimit, type BeastRateLimitOptions } from '../../beasts/http/beast-rate-limit.js';
import { DeletedTrackedAgentError, UnknownTrackedAgentError } from '../../beasts/errors.js';
import { CapacityReservationError } from '../../beasts/services/capacity-reservation-policy.js';
import { MaintenanceModeError, type MaintenanceModeService } from '../../beasts/services/maintenance-mode-service.js';
import type { AgentService } from '../../beasts/services/agent-service.js';
import { AgentToolPolicyError } from '../../beasts/services/role-tool-manifest.js';
import type { BeastDispatchService } from '../../beasts/services/beast-dispatch-service.js';
import { SAFE_DISPATCH_FAILURE_MESSAGE } from '../../beasts/services/dispatch-failure-message.js';
import type { BeastRunService } from '../../beasts/services/beast-run-service.js';
import {
  BEAST_CONTROL_MAX_BODY_SIZE,
  HttpError,
  parseJsonBody,
  requestSizeLimit,
  validateBody,
} from '../middleware.js';
import { TransportSecurityService } from '../security/transport-security.js';
import { assertSafeJsonValue, SafeJsonParseError } from '../../utils/safe-json.js';
import type { BeastRun, TrackedAgent, TrackedAgentEvent } from '../../beasts/types.js';
import {
  DEFAULT_TRACKED_AGENT_PAGE_LIMIT,
  InvalidTrackedAgentCursorError,
  MAX_TRACKED_AGENT_PAGE_LIMIT,
} from '../../beasts/repository/sqlite-beast-repository.js';

const ModuleConfigSchema = z.object({
  firewall: z.boolean().optional(),
  skills: z.boolean().optional(),
  memory: z.boolean().optional(),
  planner: z.boolean().optional(),
  critique: z.boolean().optional(),
  governor: z.boolean().optional(),
  heartbeat: z.boolean().optional(),
}).strict();

// Max length for an init-action command string (#3214). Real dashboard/chat
// commands are short prompts or CLI invocations (well under 1 KiB); 8 KiB is
// generous headroom while still bounding stored agent records.
const AGENT_CREATE_COMMAND_MAX_LENGTH = 8 * 1024;

// Size/depth bounds for the free-form `initAction.config` and `initConfig`
// records (#3214), enforced via the shared safe-json helper. Real dashboard
// payloads are shallow (<=4 nesting levels) with tens of keys/array items;
// these caps are deliberately generous. Note maxObjectKeys/maxArrayItems are
// cumulative across the whole record tree (see assertSafeJsonValue).
const AGENT_CONFIG_MAX_DEPTH = 16;
const AGENT_CONFIG_MAX_CONTAINERS = 1024;
const AGENT_CONFIG_MAX_OBJECT_KEYS = 512;
const AGENT_CONFIG_MAX_ARRAY_ITEMS = 1024;

// Raw request-body cap for the agent-creation route (#3214). Dashboard wizard
// payloads serialize the same launch config into both initAction.config and
// initConfig, so prompt attachments are effectively duplicated; 256 KiB bounds
// those duplicated payloads while staying below the coarser
// BEAST_CONTROL_MAX_BODY_SIZE (1 MiB) applied to all agent routes.
const AGENT_CREATE_MAX_BODY_SIZE = 256 * 1024;

function boundedConfigRecord(context: string) {
  return z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    try {
      assertSafeJsonValue(value, {
        context,
        maxDepth: AGENT_CONFIG_MAX_DEPTH,
        maxContainers: AGENT_CONFIG_MAX_CONTAINERS,
        maxObjectKeys: AGENT_CONFIG_MAX_OBJECT_KEYS,
        maxArrayItems: AGENT_CONFIG_MAX_ARRAY_ITEMS,
      });
    } catch (error) {
      if (error instanceof SafeJsonParseError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error.message });
        return;
      }
      throw error;
    }
  });
}

const CreateAgentBody = z.object({
  definitionId: z.string().min(1),
  initAction: z.object({
    kind: z.enum(['design-interview', 'chunk-plan', 'martin-loop']),
    command: z.string().min(1).max(AGENT_CREATE_COMMAND_MAX_LENGTH),
    config: boundedConfigRecord('initAction.config'),
    chatSessionId: z.string().min(1).optional(),
  }).strict(),
  initConfig: boundedConfigRecord('initConfig'),
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

const AGENT_TOOL_POLICY_CONFIG_KEYS = [
  'agentRole',
  'role',
  'laneRole',
  'requestedTools',
  'enabledTools',
  'toolManifest',
  'tools',
  'skills',
] as const;

const AGENT_TOOL_MANIFEST_KEYS = [
  'requestedTools',
  'enabledTools',
  'toolManifest',
  'tools',
] as const;

function pickAgentToolPolicyConfig(
  config: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    AGENT_TOOL_POLICY_CONFIG_KEYS
      .filter(key => Object.hasOwn(config, key))
      .map(key => [key, config[key]]),
  );
}

export interface AgentRoutesDeps {
  agents: AgentService;
  dispatch?: BeastDispatchService;
  maintenance?: MaintenanceModeService | undefined;
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
    app.use('/v1/beasts/agents/*', rateLimit);
  }

  app.post('/v1/beasts/agents', requestSizeLimit(AGENT_CREATE_MAX_BODY_SIZE), async (c) => {
    const body = validateBody(CreateAgentBody, await parseJsonBody(c));
    const actionPolicyConfig = pickAgentToolPolicyConfig(body.initAction.config);
    const hasExplicitToolManifest = AGENT_TOOL_MANIFEST_KEYS.some(
      key => Object.hasOwn(actionPolicyConfig, key) || Object.hasOwn(body.initConfig, key),
    );
    const policyDefaults: Record<string, unknown> = {
      ...deps.agents.defaultToolPolicyConfig(
        body.definitionId,
        body.initAction.kind,
        { ...body.initAction.config, ...body.initConfig },
      ),
    };
    if (hasExplicitToolManifest) {
      delete policyDefaults.requestedTools;
    }
    const explicitRoleAlias = body.initConfig.agentRole
      ?? body.initConfig.role
      ?? body.initConfig.laneRole
      ?? actionPolicyConfig.agentRole
      ?? actionPolicyConfig.role
      ?? actionPolicyConfig.laneRole;
    const initConfigWithAliases = {
      ...policyDefaults,
      ...actionPolicyConfig,
      ...body.initConfig,
    };
    const roleAlias = explicitRoleAlias ?? initConfigWithAliases.agentRole;
    const initConfig = {
      ...initConfigWithAliases,
      ...(typeof roleAlias === 'string' ? { agentRole: roleAlias } : {}),
    };
    const shouldAutoDispatch = body.autoDispatch !== false && deps.dispatch && shouldDispatchOnCreate(body.initAction.kind);
    if (shouldAutoDispatch) {
      try {
        deps.maintenance?.assertDispatchAllowed();
      } catch (error) {
        if (error instanceof MaintenanceModeError) {
          return c.json({
            error: {
              code: 'MAINTENANCE_MODE_ACTIVE',
              message: error.message,
              details: { maintenance: error.state },
            },
          }, 423);
        }
        throw error;
      }
      const capacityDecision = deps.agents.canStartInitConfig(initConfig);
      if (!capacityDecision.allowed) {
        return c.json({
          error: {
            code: 'AGENT_CAPACITY_RESERVED',
            message: 'Agent capacity is reserved for urgent matching work',
            details: {
              decision: capacityDecision,
              capacity: deps.agents.getCapacityReservationState(),
            },
          },
        }, 409);
      }
    }
    let agent: TrackedAgent;
    try {
      agent = deps.agents.createAgent({
        definitionId: body.definitionId,
        source: body.chatSessionId ? 'chat' : 'dashboard',
        createdByUser: body.chatSessionId ? `chat-session:${body.chatSessionId}` : 'operator',
        initAction: body.initAction,
        initConfig,
        ...(body.chatSessionId ? { chatSessionId: body.chatSessionId } : {}),
        ...(body.executionMode ? { executionMode: body.executionMode } : {}),
        ...(body.moduleConfig ? { moduleConfig: body.moduleConfig } : {}),
      });
    } catch (error) {
      if (error instanceof AgentToolPolicyError) {
        return c.json({
          error: {
            code: 'AGENT_TOOL_POLICY_DENIED',
            message: error.message,
            details: { validation: error.validation },
          },
        }, 403);
      }
      throw error;
    }
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
      message: 'Sent init command',
      payload: {
        kind: body.initAction.kind,
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
        config: initConfig,
        dispatchedBy: body.chatSessionId ? 'chat' : 'api',
        dispatchedByUser: body.chatSessionId ? `chat-session:${body.chatSessionId}` : 'operator',
        trackedAgentId: agent.id,
        startNow: true,
        ...(body.executionMode ? { executionMode: body.executionMode } : {}),
        ...(body.moduleConfig ? { moduleConfig: body.moduleConfig } : {}),
      });
    } catch (error) {
      if (error instanceof AgentToolPolicyError) {
        deps.agents.updateAgent(agent.id, { status: 'stopped' });
        deps.agents.appendEvent(agent.id, {
          level: 'warning',
          type: 'agent.dispatch.denied',
          message: error.message,
          payload: { validation: error.validation },
        });
        return c.json({
          error: {
            code: 'AGENT_TOOL_POLICY_DENIED',
            message: error.message,
            details: { agentId: agent.id, validation: error.validation },
          },
        }, 403);
      }
      if (error instanceof MaintenanceModeError) {
        deps.agents.updateAgent(agent.id, { status: 'stopped' });
        deps.agents.appendEvent(agent.id, {
          level: 'warning',
          type: 'agent.dispatch.paused',
          message: error.message,
          payload: { maintenance: error.state },
        });
        return c.json({
          error: {
            code: 'MAINTENANCE_MODE_ACTIVE',
            message: error.message,
            details: { maintenance: error.state },
          },
        }, 423);
      }
      if (error instanceof CapacityReservationError) {
        return c.json({
          error: {
            code: 'AGENT_CAPACITY_RESERVED',
            message: 'Agent capacity is reserved for urgent matching work',
            details: {
              decision: error.decision,
              capacity: error.state,
              agentId: agent.id,
            },
          },
        }, 409);
      }
      console.error(`[agent-routes] ${SAFE_DISPATCH_FAILURE_MESSAGE} for ${agent.id}`);
      deps.agents.updateAgent(agent.id, { status: 'failed' });
      deps.agents.appendEvent(agent.id, {
        level: 'error',
        type: 'agent.dispatch.failed',
        message: SAFE_DISPATCH_FAILURE_MESSAGE,
        payload: { error: SAFE_DISPATCH_FAILURE_MESSAGE },
      });
      const failedAgent = deps.agents.getAgent(agent.id);
      return c.json({
        error: {
          code: 'AGENT_DISPATCH_FAILED',
          message: `Dispatch failed for tracked agent '${agent.id}'`,
          details: {
            agentId: agent.id,
            dispatchError: SAFE_DISPATCH_FAILURE_MESSAGE,
            agent: {
              id: failedAgent.id,
              status: failedAgent.status,
              dispatchRunId: failedAgent.dispatchRunId,
            },
          },
        },
      }, 409);
    }

    return c.json({
      data: redactAgentIfNeeded(deps.agents.getAgent(agent.id), deps),
    }, 201);
  });

  app.get('/v1/beasts/agents', (c) => {
    const rawLimit = c.req.query('limit');
    const limit = rawLimit === undefined ? DEFAULT_TRACKED_AGENT_PAGE_LIMIT : Number(rawLimit);
    if (rawLimit !== undefined
      && (!/^\d+$/.test(rawLimit)
        || !Number.isSafeInteger(limit)
        || limit < 1
        || limit > MAX_TRACKED_AGENT_PAGE_LIMIT)) {
      throw new HttpError(
        400,
        'INVALID_AGENT_PAGE_LIMIT',
        `Tracked-agent page limit must be an integer between 1 and ${MAX_TRACKED_AGENT_PAGE_LIMIT}`,
      );
    }
    let page;
    try {
      const cursor = c.req.query('cursor');
      page = deps.agents.listAgentPage({
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      });
    } catch (error) {
      if (error instanceof InvalidTrackedAgentCursorError) {
        throw new HttpError(400, 'INVALID_AGENT_PAGE_CURSOR', error.message);
      }
      throw error;
    }
    const redactedAgentIds = deps.agents.listDispatchFailureRedactedAgentIds(page.agents.map(({ id }) => id));
    return c.json({
      data: {
        agents: page.agents.map((agent) => redactedAgentIds.has(agent.id)
          ? redactDispatchFailedAgentResponse(agent)
          : agent),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        capacityReservation: deps.agents.getCapacityReservationState(),
      },
    });
  });

  app.get('/v1/beasts/agents/:agentId', (c) => {
    const agentId = c.req.param('agentId');
    try {
      const detail = deps.agents.getAgentDetail(agentId);
      const redactDispatchFailure = deps.agents.hasDispatchFailureHistory(agentId);
      return c.json({
        data: {
          ...detail,
          agent: redactDispatchFailure ? redactDispatchFailedAgentResponse(detail.agent) : detail.agent,
          events: redactDispatchFailedAgentEvents(detail.events, redactDispatchFailure),
        },
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
      return c.json({ data: redactAgentIfNeeded(updated, deps) });
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
          : await startLinkedAgentRun(deps, agent);
        deps.agents.appendEvent(agentId, {
          level: 'info',
          type: 'agent.start.requested',
          message: `Start requested for linked run ${run.id}`,
          payload: {
            runId: run.id,
          },
        });
        return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
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
      return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throwMaintenanceModeError(error);
      throwCapacityReservationError(error);
      throwAgentToolPolicyError(error);
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
        return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
      }

      const updated = deps.agents.updateAgent(agentId, { status: 'stopped' });
      deps.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.stop.requested',
        message: 'Stop requested before a linked run was created',
        payload: {},
      });
      return c.json({ data: redactAgentIfNeeded(updated, deps) });
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
          ? await dispatchReplacementAgentRun(deps, agent, existingRun)
          : await restartLinkedAgentRun(deps, agent);
        deps.agents.appendEvent(agentId, {
          level: 'info',
          type: 'agent.restart.requested',
          message: `Restart requested for linked run ${run.id}`,
          payload: {
            runId: run.id,
          },
        });
        return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
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
      return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throwMaintenanceModeError(error);
      throwCapacityReservationError(error);
      throwAgentToolPolicyError(error);
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
      return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
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
      return c.json({ data: deps.runs.sanitizeRunForResponse(run) });
    } catch (error) {
      if (error instanceof UnknownTrackedAgentError) {
        throw new HttpError(
          404,
          'TRACKED_AGENT_NOT_FOUND',
          `Tracked agent '${agentId}' was not found`,
        );
      }
      throwMaintenanceModeError(error);
      throwCapacityReservationError(error);
      throwAgentToolPolicyError(error);
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

function throwMaintenanceModeError(error: unknown): void {
  if (error instanceof MaintenanceModeError) {
    throw new HttpError(423, 'MAINTENANCE_MODE_ACTIVE', error.message, { maintenance: error.state });
  }
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

async function dispatchReplacementAgentRun(
  deps: AgentRoutesDeps,
  agent: TrackedAgent,
  existingRun: ReturnType<BeastRunService['getRun']>,
) {
  deps.maintenance?.assertDispatchAllowed();
  assertAgentCapacityAvailable(deps, agent);
  if (existingRun?.status === 'running') {
    await deps.runs.stop(existingRun.id, 'operator');
  }
  return dispatchDetachedAgent(deps, agent.id);
}

async function startLinkedAgentRun(deps: AgentRoutesDeps, agent: TrackedAgent): Promise<BeastRun> {
  if (!agent.dispatchRunId) {
    throw new Error(`Tracked agent '${agent.id}' has no linked run`);
  }
  return deps.runs.start(agent.dispatchRunId, 'operator');
}

async function restartLinkedAgentRun(deps: AgentRoutesDeps, agent: TrackedAgent): Promise<BeastRun> {
  if (!agent.dispatchRunId) {
    throw new Error(`Tracked agent '${agent.id}' has no linked run`);
  }
  return deps.runs.restart(agent.dispatchRunId, 'operator');
}

function assertAgentCapacityAvailable(deps: AgentRoutesDeps, agent: TrackedAgent): void {
  const capacityDecision = deps.agents.canStartAgent(agent);
  if (!capacityDecision.allowed) {
    throw new HttpError(
      409,
      'AGENT_CAPACITY_RESERVED',
      'Agent capacity is reserved for urgent matching work',
      {
        decision: capacityDecision,
        capacity: deps.agents.getCapacityReservationState(),
      },
    );
  }
}

function redactDispatchFailedAgentResponse(agent: TrackedAgent) {
  return {
    ...agent,
    name: undefined,
    initAction: {
      ...agent.initAction,
      command: '[REDACTED]',
      config: {},
    },
    initConfig: {},
    dispatchRunId: undefined,
  };
}

function redactAgentIfNeeded(agent: TrackedAgent, deps: AgentRoutesDeps) {
  return deps.agents.hasDispatchFailureHistory(agent.id)
    ? redactDispatchFailedAgentResponse(agent)
    : agent;
}

function redactDispatchFailedAgentEvents(
  events: readonly TrackedAgentEvent[],
  redactLinkedEvents = true,
): TrackedAgentEvent[] {
  return events.map((event) => {
    if (event.type === 'agent.command.sent') {
      return {
        ...event,
        message: 'Sent init command',
        payload: {},
      };
    }
    if (event.type === 'agent.dispatch.failed') {
      return {
        ...event,
        message: SAFE_DISPATCH_FAILURE_MESSAGE,
        payload: { error: SAFE_DISPATCH_FAILURE_MESSAGE },
      };
    }
    if (redactLinkedEvents && event.type === 'agent.dispatch.linked') {
      return {
        ...event,
        message: 'Linked Beast run',
        payload: {},
      };
    }
    return event;
  });
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

  assertAgentCapacityAvailable(deps, agent);

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
