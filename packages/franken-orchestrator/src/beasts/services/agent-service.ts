import type {
  BeastExecutionMode,
  BeastRun,
  ModuleConfig,
  TrackedAgent,
  TrackedAgentEvent,
  TrackedAgentInitAction,
} from '../types.js';
import { isoNow } from '@franken/types';
import { DeletedTrackedAgentError, UnknownTrackedAgentError } from '../errors.js';
import {
  BeastRepositoryJsonCorruptionError,
  SQLiteBeastRepository,
  type TrackedAgentPage,
  type TrackedAgentPageOptions,
} from '../repository/sqlite-beast-repository.js';
import type {
  CapacityReservationDecision,
  CapacityReservationPolicy,
  CapacityReservationState,
  CapacityReservationWorkItem,
} from './capacity-reservation-policy.js';
import { capacityItemFromConfig } from './capacity-reservation-policy.js';
import { AgentToolPolicyError, defaultAgentToolPolicyConfig, validateAgentRoleTools } from './role-tool-manifest.js';
import type { ToolPolicyDenial, ToolPolicyValidationContext } from './role-tool-manifest.js';

export interface CreateTrackedAgentRequest {
  readonly definitionId: string;
  readonly source: TrackedAgent['source'];
  readonly createdByUser: string;
  readonly initAction: TrackedAgentInitAction;
  readonly initConfig: Readonly<Record<string, unknown>>;
  readonly chatSessionId?: string | undefined;
  readonly executionMode?: BeastExecutionMode | undefined;
  readonly moduleConfig?: ModuleConfig | undefined;
}

export interface AppendTrackedAgentEventRequest {
  readonly level: TrackedAgentEvent['level'];
  readonly type: string;
  readonly message: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface UpdateTrackedAgentRequest {
  readonly status?: TrackedAgent['status'] | undefined;
  readonly initConfig?: Readonly<Record<string, unknown>> | undefined;
  readonly chatSessionId?: string | undefined;
  readonly dispatchRunId?: string | undefined;
  readonly executionMode?: BeastExecutionMode | undefined;
  readonly moduleConfig?: ModuleConfig | undefined;
}

export interface TrackedAgentDetail {
  readonly agent: TrackedAgent;
  readonly events: TrackedAgentEvent[];
}

export interface AgentServiceOptions {
  readonly capacityPolicy?: CapacityReservationPolicy | undefined;
  readonly toolPolicyLogger?: ((entry: ToolPolicyDenial) => void) | undefined;
  readonly trustedSkillToolManifests?: ToolPolicyValidationContext['trustedSkillToolManifests'];
}

function defaultToolPolicyLogger(entry: ToolPolicyDenial): void {
  console.warn('[agent-tool-policy-denial]', JSON.stringify(entry));
}

export class AgentService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly now: () => string = () => isoNow(),
    private readonly options: AgentServiceOptions = {},
  ) {}

  createAgent(request: CreateTrackedAgentRequest): TrackedAgent {
    this.assertRoleToolManifestAllows(request);
    const timestamp = this.now();
    return this.repository.createTrackedAgent({
      definitionId: request.definitionId,
      source: request.source,
      status: 'initializing',
      createdByUser: request.createdByUser,
      initAction: request.initAction,
      initConfig: request.initConfig,
      ...(request.chatSessionId ? { chatSessionId: request.chatSessionId } : {}),
      ...(request.executionMode ? { executionMode: request.executionMode } : {}),
      ...(request.moduleConfig ? { moduleConfig: request.moduleConfig } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  listAgents(): TrackedAgent[] {
    return this.repository.listTrackedAgents({ recoverCorruptJson: true });
  }

  listAgentPage(options: Omit<TrackedAgentPageOptions, 'recoverCorruptJson'>): TrackedAgentPage {
    return this.repository.listTrackedAgentPage({ ...options, recoverCorruptJson: true });
  }

  getCapacityReservationState(): CapacityReservationState | undefined {
    return this.options.capacityPolicy?.describe(this.activeCapacityItems(true));
  }

  canStartInitConfig(initConfig: Readonly<Record<string, unknown>>): CapacityReservationDecision {
    return this.options.capacityPolicy?.canStart(capacityItemFromConfig('candidate', initConfig), this.activeCapacityItems())
      ?? { allowed: true, reason: 'normal_capacity_available', reservationId: undefined };
  }

  canStartAgent(agent: TrackedAgent): CapacityReservationDecision {
    const activeItems = this.activeCapacityItems().filter((item) => item.id !== agent.id);
    return this.options.capacityPolicy?.canStart(capacityItemFromAgent(agent), activeItems)
      ?? { allowed: true, reason: 'normal_capacity_available', reservationId: undefined };
  }

  defaultToolPolicyConfig(
    definitionId: string,
    initActionKind: string,
    config: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    return defaultAgentToolPolicyConfig(
      definitionId,
      initActionKind,
      config,
      this.options.trustedSkillToolManifests,
    );
  }

  getAgent(agentId: string): TrackedAgent {
    const agent = this.repository.getTrackedAgent(agentId);
    if (!agent) {
      throw new UnknownTrackedAgentError(agentId);
    }
    return agent;
  }

  getMutableAgent(agentId: string): TrackedAgent {
    const agent = this.getAgent(agentId);
    if (agent.status === 'deleted') {
      throw new DeletedTrackedAgentError(agentId);
    }
    return agent;
  }

  getAgentDetail(agentId: string): TrackedAgentDetail {
    return {
      agent: this.getAgent(agentId),
      events: this.repository.listTrackedAgentEvents(agentId, { recoverCorruptJson: true }),
    };
  }

  listDispatchFailureRedactedAgentIds(agentIds?: readonly string[]): Set<string> {
    return new Set(this.repository.listDispatchFailureHistoryAgentIds(agentIds));
  }

  hasActiveDispatchFailure(agentId: string): boolean {
    return this.repository.hasActiveDispatchFailure(agentId);
  }

  hasDispatchFailureHistory(agentId: string): boolean {
    return this.repository.hasDispatchFailureHistory(agentId);
  }

  appendEvent(agentId: string, request: AppendTrackedAgentEventRequest): TrackedAgentEvent {
    return this.repository.appendTrackedAgentEvent(agentId, {
      ...request,
      createdAt: this.now(),
    });
  }

  linkRun(agentId: string, runId: string): TrackedAgent {
    return this.updateAgent(agentId, {
      status: 'dispatching',
      dispatchRunId: runId,
    });
  }

  softDeleteAgent(agentId: string): TrackedAgent {
    const agent = this.getAgent(agentId);
    if (agent.status !== 'stopped' && agent.status !== 'failed' && agent.status !== 'completed') {
      throw new Error(`Tracked agent '${agentId}' is not stopped, failed, or completed`);
    }
    return this.repository.updateTrackedAgent(agentId, {
      status: 'deleted',
      updatedAt: this.now(),
    });
  }

  updateAgent(agentId: string, request: UpdateTrackedAgentRequest): TrackedAgent {
    return this.repository.updateTrackedAgent(agentId, {
      ...(request.status !== undefined ? { status: request.status } : {}),
      ...(request.initConfig !== undefined ? { initConfig: request.initConfig } : {}),
      ...(request.chatSessionId !== undefined ? { chatSessionId: request.chatSessionId } : {}),
      ...(request.dispatchRunId !== undefined ? { dispatchRunId: request.dispatchRunId } : {}),
      ...(request.executionMode !== undefined ? { executionMode: request.executionMode } : {}),
      ...(request.moduleConfig !== undefined ? { moduleConfig: request.moduleConfig } : {}),
      updatedAt: this.now(),
    });
  }

  private assertRoleToolManifestAllows(request: CreateTrackedAgentRequest): void {
    const validation = validateAgentRoleTools(request.initConfig, {
      definitionId: request.definitionId,
      initActionKind: request.initAction.kind,
      initActionConfig: request.initAction.config,
      trustedSkillToolManifests: this.options.trustedSkillToolManifests,
    });
    if (validation.allowed) return;

    for (const denial of validation.denials) {
      (this.options.toolPolicyLogger ?? defaultToolPolicyLogger)(denial);
    }
    throw new AgentToolPolicyError(validation);
  }

  private activeCapacityItems(recoverCorruptJson = false): CapacityReservationWorkItem[] {
    return this.repository.listCapacityTrackedAgents({ recoverCorruptJson })
      .map((agent) => {
        let linkedRun: BeastRun | undefined;
        try {
          linkedRun = agent.dispatchRunId ? this.repository.getRun(agent.dispatchRunId) : undefined;
        } catch (error) {
          if (!recoverCorruptJson || !(error instanceof BeastRepositoryJsonCorruptionError)) throw error;
          console.warn(
            `Using tracked-agent capacity fallback after corrupt Beast JSON in ${error.context.table}.${error.context.column} for row ${error.context.rowId}; persisted state was left unchanged for operator repair.`,
          );
        }
        return capacityItemFromConfig(agent.id, linkedRun?.configSnapshot ?? agent.initConfig);
      });
  }
}

function capacityItemFromAgent(agent: TrackedAgent): CapacityReservationWorkItem {
  return capacityItemFromConfig(agent.id, agent.initConfig);
}
