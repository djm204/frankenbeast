import type { BeastDefinition, BeastDispatchSource, BeastExecutionMode, BeastRun, ModuleConfig, TrackedAgent } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastExecutor } from '../execution/beast-executor.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import { BeastCatalogService } from './beast-catalog-service.js';
import { wallClockNow } from '@franken/types';
import { SAFE_DISPATCH_FAILURE_MESSAGE } from './dispatch-failure-message.js';
import { UnknownBeastDefinitionError } from '../errors.js';
import { GitConfigSchema, LlmConfigSchema, PromptConfigSchema } from '../../cli/run-config-loader.js';
import {
  CapacityReservationError,
  type CapacityReservationPolicy,
  type CapacityReservationWorkItem,
  capacityItemFromConfig,
} from './capacity-reservation-policy.js';
import type { MaintenanceModeService } from './maintenance-mode-service.js';
import { AgentToolPolicyError, defaultAgentToolPolicyConfig, validateAgentRoleTools } from './role-tool-manifest.js';
import type { ToolPolicyDenial, ToolPolicyValidationContext } from './role-tool-manifest.js';

export interface BeastDispatchServiceOptions {
  eventBus?: BeastEventBus;
  capacityPolicy?: CapacityReservationPolicy | undefined;
  maintenance?: MaintenanceModeService | undefined;
  trustedSkillToolManifests?: ToolPolicyValidationContext['trustedSkillToolManifests'];
}

export interface BeastExecutors {
  readonly process: BeastExecutor;
  readonly container: BeastExecutor;
}

const SHARED_RUNTIME_CONFIG_KEYS = [
  'skills',
  'gitConfig',
  'llmConfig',
  'promptConfig',
  'provider',
  'model',
  'maxDurationMs',
  'maxTotalTokens',
  'reflection',
  'label',
  'labels',
  'issueLabels',
  'category',
  'categories',
  'issue',
] as const;

const TOOL_POLICY_CONFIG_KEYS = [
  'agentRole',
  'role',
  'laneRole',
  'requestedTools',
  'enabledTools',
  'toolManifest',
  'tools',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeGitConfig(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;

  const gitConfig: Record<string, unknown> = {};
  for (const key of ['preset', 'baseBranch', 'commitConvention'] as const) {
    if (typeof value[key] === 'string' && value[key].trim().length > 0) {
      gitConfig[key] = value[key];
    }
  }
  if (typeof value.branchPattern === 'string') {
    gitConfig.branchPattern = value.branchPattern;
  }
  if (value.prCreation === true) {
    gitConfig.prCreation = 'auto';
  } else if (value.prCreation === false) {
    gitConfig.prCreation = 'disabled';
  } else if (value.prCreation === 'auto' || value.prCreation === 'manual' || value.prCreation === 'disabled') {
    gitConfig.prCreation = value.prCreation;
  }
  if (value.mergeStrategy === 'merge' || value.mergeStrategy === 'squash' || value.mergeStrategy === 'rebase') {
    gitConfig.mergeStrategy = value.mergeStrategy;
  }
  if (typeof value.disableBranding === 'boolean') {
    gitConfig.disableBranding = value.disableBranding;
  }

  return Object.keys(gitConfig).length > 0 ? gitConfig : undefined;
}

function parseOptionalSharedConfig<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function normalizeSharedRuntimeConfigValue(key: string, value: unknown): unknown | undefined {
  switch (key) {
    case 'skills':
      return Array.isArray(value) && value.every((skill) => typeof skill === 'string') ? value : undefined;
    case 'gitConfig':
      return parseOptionalSharedConfig(GitConfigSchema, normalizeGitConfig(value));
    case 'llmConfig':
      return parseOptionalSharedConfig(LlmConfigSchema, value);
    case 'promptConfig':
      return parseOptionalSharedConfig(PromptConfigSchema, value);
    case 'provider':
    case 'model':
      return typeof value === 'string' ? value : undefined;
    case 'maxDurationMs':
    case 'maxTotalTokens':
      return typeof value === 'number' ? value : undefined;
    case 'reflection':
      return typeof value === 'boolean' ? value : undefined;
    case 'label':
    case 'category':
      return typeof value === 'string' ? value : undefined;
    case 'labels':
    case 'issueLabels':
    case 'categories':
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
    case 'issue':
      return isRecord(value) ? value : undefined;
    default:
      return undefined;
  }
}

function pickSharedRuntimeConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    SHARED_RUNTIME_CONFIG_KEYS.flatMap((key) => {
      const value = normalizeSharedRuntimeConfigValue(key, config[key]);
      return value !== undefined ? [[key, value]] : [];
    }),
  );
}

function pickToolPolicyConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    TOOL_POLICY_CONFIG_KEYS
      .filter((key) => Object.hasOwn(config, key))
      .map((key) => [key, config[key]]),
  );
}

function canonicalTrackedAgentToolPolicyConfig(
  config: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const policy = pickToolPolicyConfig(config);
  const rawRole = config.agentRole ?? config.role ?? config.laneRole;
  const canonicalRole = typeof rawRole === 'string' && rawRole.trim().length > 0
    ? { agentRole: rawRole.trim() }
    : {};
  return {
    ...Object.fromEntries(Object.entries(policy).filter(([key]) => key !== 'agentRole' && key !== 'role' && key !== 'laneRole')),
    ...canonicalRole,
  };
}

function pickSkillsPolicyConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.hasOwn(config, 'skills') ? { skills: config.skills } : {};
}

function preserveTrackedAgentPolicyConfig(
  config: Readonly<Record<string, unknown>>,
  requestConfig: Readonly<Record<string, unknown>>,
  trackedAgent?: TrackedAgent | undefined,
): Readonly<Record<string, unknown>> {
  if (!trackedAgent) return config;
  return {
    ...config,
    ...pickSkillsPolicyConfig(trackedAgent.initAction.config),
    ...pickSkillsPolicyConfig(trackedAgent.initConfig),
    ...pickSkillsPolicyConfig(requestConfig),
    ...canonicalTrackedAgentToolPolicyConfig(trackedAgent.initAction.config),
    ...canonicalTrackedAgentToolPolicyConfig(trackedAgent.initConfig),
  };
}

export function normalizeBeastRunConfig(
  definition: BeastDefinition,
  requestedConfig: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const firstAttempt = definition.configSchema.safeParse(requestedConfig);
  if (firstAttempt.success) return firstAttempt.data;

  const hasUnrecognizedKeys = firstAttempt.error.issues.some(
    (issue) => issue.code === 'unrecognized_keys',
  );
  if (!hasUnrecognizedKeys) throw firstAttempt.error;

  const shape = (definition.configSchema as { shape?: Record<string, unknown> }).shape;
  const stripped = shape
    ? Object.fromEntries(Object.entries(requestedConfig).filter(([key]) => key in shape))
    : requestedConfig;
  return {
    ...definition.configSchema.parse(stripped),
    ...pickSharedRuntimeConfig(requestedConfig),
  };
}

export interface CreateBeastRunRequest {
  readonly definitionId: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly dispatchedBy: BeastDispatchSource;
  readonly dispatchedByUser: string;
  readonly trackedAgentId?: string | undefined;
  readonly executionMode?: BeastExecutionMode | undefined;
  readonly startNow?: boolean | undefined;
  readonly onRunCreated?: ((run: BeastRun) => void) | undefined;
  readonly moduleConfig?: ModuleConfig | undefined;
}

export class BeastDispatchService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly catalog: BeastCatalogService,
    private readonly executors: BeastExecutors,
    private readonly metrics: BeastMetrics,
    private readonly logs: BeastLogStore,
    private readonly options: BeastDispatchServiceOptions = {},
  ) {}

  async createRun(request: CreateBeastRunRequest): Promise<BeastRun> {
    this.options.maintenance?.assertDispatchAllowed();
    const definition = this.getDefinitionOrThrow(request.definitionId);
    // Normalize strict definition fields while preserving approved shared runtime
    // keys; retry paths reuse this same contract when rebuilding redacted snapshots.
    const config = normalizeBeastRunConfig(definition, request.config);
    const trackedAgent = request.trackedAgentId
      ? this.repository.requireTrackedAgent(request.trackedAgentId)
      : undefined;
    const moduleConfig = request.moduleConfig ?? this.resolveAgentModuleConfig(request.trackedAgentId);
    const directRunPolicyConfig = trackedAgent
      ? {}
      : {
          ...canonicalTrackedAgentToolPolicyConfig(request.config),
          ...pickSkillsPolicyConfig(request.config),
        };
    const parsedConfigSnapshot: Readonly<Record<string, unknown>> = moduleConfig
      ? { ...defaultAgentToolPolicyConfig(definition.id), ...config, ...directRunPolicyConfig, modules: moduleConfig }
      : { ...defaultAgentToolPolicyConfig(definition.id), ...config, ...directRunPolicyConfig };
    const configSnapshot = preserveTrackedAgentPolicyConfig(parsedConfigSnapshot, request.config, trackedAgent);
    this.assertRoleToolManifestAllows(request, configSnapshot);
    const executionMode = request.executionMode ?? definition.executionModeDefault;
    const createdAt = new Date(wallClockNow()).toISOString();
    const linkedAt = new Date(wallClockNow()).toISOString();
    const run = this.repository.transaction(() => {
      if (request.trackedAgentId) {
        this.repository.requireTrackedAgent(request.trackedAgentId);
        this.assertTrackedAgentCapacity(request.trackedAgentId, {
          ...request.config,
          ...configSnapshot,
        });
      }

      const createdRun = this.repository.createRun({
        ...(request.trackedAgentId ? { trackedAgentId: request.trackedAgentId } : {}),
        definitionId: definition.id,
        definitionVersion: definition.version,
        executionMode,
        configSnapshot,
        dispatchedBy: request.dispatchedBy,
        dispatchedByUser: request.dispatchedByUser,
        createdAt,
      });

      this.repository.appendEvent(createdRun.id, {
        type: 'run.created',
        payload: {
          definitionId: createdRun.definitionId,
          executionMode,
          dispatchedBy: createdRun.dispatchedBy,
        },
        createdAt: createdRun.createdAt,
      });

      if (request.trackedAgentId) {
        const trackedAgent = this.repository.getTrackedAgent(request.trackedAgentId);
        const identity = trackedAgent && isRecord(trackedAgent.initConfig.identity)
          ? trackedAgent.initConfig.identity
          : undefined;
        this.repository.updateTrackedAgent(request.trackedAgentId, {
          status: 'dispatching',
          dispatchRunId: createdRun.id,
          initConfig: identity ? { ...config, identity } : config,
          ...(moduleConfig ? { moduleConfig } : {}),
          updatedAt: linkedAt,
        });
        const linkedEvent = {
          level: 'info' as const,
          type: 'agent.dispatch.linked',
          message: `Linked Beast run ${createdRun.id}`,
          payload: { runId: createdRun.id },
          createdAt: linkedAt,
        };
        this.repository.appendTrackedAgentEvent(request.trackedAgentId, linkedEvent);
        this.options.eventBus?.publish({
          type: 'agent.event',
          data: { agentId: request.trackedAgentId, event: linkedEvent },
        });
      }

      return createdRun;
    });

    request.onRunCreated?.(run);

    await this.appendLogSafely(run.id, 'system', 'stdout', 'run created');
    this.metrics.recordRunCreated(run.definitionId, run.dispatchedBy);

    if (request.startNow) {
      try {
        const startableRun = this.repository.getRun(run.id);
        if (!startableRun) {
          throw new Error(`Beast run disappeared before start: ${run.id}`);
        }
        if (startableRun.status !== 'queued') {
          return startableRun;
        }

        await this.executorFor(executionMode).start(startableRun, definition);
        const updated = this.repository.getRun(startableRun.id);
        if (!updated) {
          throw new Error(`Beast run disappeared after start: ${startableRun.id}`);
        }
        if (updated.trackedAgentId) {
          const agentStatus = updated.status === 'running'
            ? 'running'
            : updated.status === 'pending_approval'
              ? 'awaiting_approval'
              : updated.status === 'completed'
                ? 'completed'
                : 'dispatching';
          const updatedAt = new Date(wallClockNow()).toISOString();
          this.repository.updateTrackedAgent(updated.trackedAgentId, {
            status: agentStatus,
            updatedAt,
          });
          if ((agentStatus === 'running' || agentStatus === 'awaiting_approval' || agentStatus === 'completed')
            && this.repository.hasUnrecoveredDispatchFailure(updated.trackedAgentId)) {
            const recoveredEvent = {
              level: 'info' as const,
              type: 'agent.dispatch.recovered',
              message: `Tracked agent dispatch recovered for run ${updated.id}`,
              payload: { runId: updated.id },
              createdAt: updatedAt,
            };
            this.repository.appendTrackedAgentEvent(updated.trackedAgentId, recoveredEvent);
            this.options.eventBus?.publish({
              type: 'agent.event',
              data: { agentId: updated.trackedAgentId, event: recoveredEvent },
            });
          }
          this.options.eventBus?.publish({
            type: 'agent.status',
            data: { agentId: updated.trackedAgentId, status: agentStatus, updatedAt },
          });
        }
        return updated;
      } catch {
        const failedAt = new Date(wallClockNow()).toISOString();
        const currentRun = this.repository.getRun(run.id);
        const executorRecordedSpawnFailure = currentRun?.status === 'failed'
          && currentRun.stopReason === 'spawn_failed';
        const failedRun = this.repository.transaction(() => {
          const updatedRun = executorRecordedSpawnFailure && currentRun
            ? (currentRun.trackedAgentId
                ? this.repository.updateRun(currentRun.id, { configSnapshot: {} })
                : currentRun)
            : this.repository.updateRun(run.id, {
                status: 'failed',
                ...(run.trackedAgentId ? { configSnapshot: {} } : {}),
                finishedAt: failedAt,
                stopReason: 'start_failed',
              });
          if (!executorRecordedSpawnFailure) {
            this.repository.appendEvent(run.id, {
              type: 'run.start_failed',
              payload: {
                error: SAFE_DISPATCH_FAILURE_MESSAGE,
              },
              createdAt: failedAt,
            });
          }
          if (updatedRun.trackedAgentId) {
            this.repository.updateTrackedAgent(updatedRun.trackedAgentId, {
              status: 'failed',
              updatedAt: failedAt,
            });
            this.options.eventBus?.publish({
              type: 'agent.status',
              data: { agentId: updatedRun.trackedAgentId, status: 'failed', updatedAt: failedAt },
            });
            const failedEvent = {
              level: 'error' as const,
              type: 'agent.dispatch.failed',
              message: `Failed to start Beast run ${updatedRun.id}`,
              payload: { runId: updatedRun.id, error: SAFE_DISPATCH_FAILURE_MESSAGE },
              createdAt: failedAt,
            };
            this.repository.appendTrackedAgentEvent(updatedRun.trackedAgentId, failedEvent);
            this.options.eventBus?.publish({
              type: 'agent.event',
              data: { agentId: updatedRun.trackedAgentId, event: failedEvent },
            });
          }
          return updatedRun;
        });
        await this.appendLogSafely(run.id, 'system', 'stderr', `start_failed: ${SAFE_DISPATCH_FAILURE_MESSAGE}`);
        return failedRun;
      }
    }

    return run;
  }

  private async appendLogSafely(
    runId: string,
    attemptId: string,
    stream: 'stdout' | 'stderr',
    message: string,
  ): Promise<void> {
    try {
      await this.logs.append(runId, attemptId, stream, message);
    } catch {
      // Logging is best-effort and must not turn a persisted run into an API failure.
    }
  }

  private executorFor(mode: BeastExecutionMode): BeastExecutor {
    return mode === 'container' ? this.executors.container : this.executors.process;
  }

  private assertTrackedAgentCapacity(
    trackedAgentId: string,
    candidateConfig: Readonly<Record<string, unknown>>,
  ): void {
    if (!this.options.capacityPolicy) return;
    const activeItems = this.activeCapacityItems();
    const decision = this.options.capacityPolicy.canStart(
      capacityItemFromConfig(trackedAgentId, candidateConfig),
      activeItems,
    );
    if (!decision.allowed) {
      throw new CapacityReservationError(decision, this.options.capacityPolicy.describe(activeItems));
    }
  }

  private activeCapacityItems(): CapacityReservationWorkItem[] {
    return this.repository.listRuns()
      .filter(run => run.trackedAgentId)
      .filter(run => run.status === 'queued'
        || run.status === 'interviewing'
        || run.status === 'pending_approval'
        || run.status === 'running')
      .map(run => capacityItemFromConfig(run.trackedAgentId!, run.configSnapshot));
  }

  private resolveAgentModuleConfig(trackedAgentId?: string): ModuleConfig | undefined {
    if (!trackedAgentId) return undefined;
    return this.repository.getTrackedAgent(trackedAgentId)?.moduleConfig;
  }

  private assertRoleToolManifestAllows(
    request: CreateBeastRunRequest,
    configSnapshot: Readonly<Record<string, unknown>>,
  ): void {
    const trackedAgent = request.trackedAgentId
      ? this.repository.requireTrackedAgent(request.trackedAgentId)
      : undefined;
    if (trackedAgent && trackedAgent.definitionId !== request.definitionId) {
      throw new AgentToolPolicyError({
        allowed: false,
        rawRole: undefined,
        requestedTools: [],
        denials: [{
          role: '<definition-mismatch>',
          requestedTool: `definition:${request.definitionId}`,
          reason: `tracked agent '${trackedAgent.id}' was created for definition '${trackedAgent.definitionId}' and cannot dispatch definition '${request.definitionId}'`,
        }],
      });
    }
    const policyConfig = trackedAgent
      ? {
        ...request.config,
        ...pickSkillsPolicyConfig(trackedAgent.initAction.config),
        ...pickSkillsPolicyConfig(trackedAgent.initConfig),
        ...configSnapshot,
        ...canonicalTrackedAgentToolPolicyConfig(trackedAgent.initAction.config),
        ...canonicalTrackedAgentToolPolicyConfig(trackedAgent.initConfig),
      }
      : { ...request.config, ...configSnapshot };
    const validation = validateAgentRoleTools(policyConfig, {
      definitionId: request.definitionId,
      initActionConfig: trackedAgent?.initAction.config,
      trustedSkillToolManifests: this.options.trustedSkillToolManifests,
    });
    if (validation.allowed) return;

    for (const denial of validation.denials) {
      defaultToolPolicyLogger(denial);
    }
    throw new AgentToolPolicyError(validation);
  }

  private getDefinitionOrThrow(definitionId: string): BeastDefinition {
    const definition = this.catalog.getDefinition(definitionId);
    if (!definition) {
      throw new UnknownBeastDefinitionError(definitionId);
    }
    return definition;
  }
}

function defaultToolPolicyLogger(entry: ToolPolicyDenial): void {
  console.warn('[agent-tool-policy-denial]', JSON.stringify(entry));
}
