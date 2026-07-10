import type {
  BeastExecutionMode,
  ModuleConfig,
  TrackedAgent,
  TrackedAgentEvent,
  TrackedAgentInitAction,
} from '../types.js';
import { isoNow } from '@franken/types';
import { UnknownTrackedAgentError } from '../errors.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';

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

export class AgentService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly now: () => string = () => isoNow(),
  ) {}

  createAgent(request: CreateTrackedAgentRequest): TrackedAgent {
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
    return this.repository.listTrackedAgents().filter((agent) => isVisibleAgent(agent));
  }

  getAgent(agentId: string): TrackedAgent {
    const agent = this.repository.getTrackedAgent(agentId);
    if (!agent || !isVisibleAgent(agent)) {
      throw new UnknownTrackedAgentError(agentId);
    }
    return agent;
  }

  getAgentDetail(agentId: string): TrackedAgentDetail {
    return {
      agent: this.getAgent(agentId),
      events: this.repository.listTrackedAgentEvents(agentId),
    };
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
    if (agent.status !== 'stopped') {
      throw new Error(`Tracked agent '${agentId}' is not stopped`);
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
}

function isVisibleAgent(agent: TrackedAgent): boolean {
  return agent.status !== 'deleted';
}
