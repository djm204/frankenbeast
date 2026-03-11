import type {
  TrackedAgent,
  TrackedAgentEvent,
  TrackedAgentInitAction,
} from '../types.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';

export interface CreateTrackedAgentRequest {
  readonly definitionId: string;
  readonly source: TrackedAgent['source'];
  readonly createdByUser: string;
  readonly initAction: TrackedAgentInitAction;
  readonly initConfig: Readonly<Record<string, unknown>>;
  readonly chatSessionId?: string | undefined;
}

export interface AppendTrackedAgentEventRequest {
  readonly level: TrackedAgentEvent['level'];
  readonly type: string;
  readonly message: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface UpdateTrackedAgentRequest {
  readonly status?: TrackedAgent['status'] | undefined;
  readonly chatSessionId?: string | undefined;
  readonly dispatchRunId?: string | undefined;
}

export interface TrackedAgentDetail {
  readonly agent: TrackedAgent;
  readonly events: TrackedAgentEvent[];
}

export class AgentService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly now: () => string = () => new Date().toISOString(),
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
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  listAgents(): TrackedAgent[] {
    return this.repository.listTrackedAgents();
  }

  getAgent(agentId: string): TrackedAgent {
    const agent = this.repository.getTrackedAgent(agentId);
    if (!agent) {
      throw new Error(`Unknown tracked agent: ${agentId}`);
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

  updateAgent(agentId: string, request: UpdateTrackedAgentRequest): TrackedAgent {
    return this.repository.updateTrackedAgent(agentId, {
      ...(request.status !== undefined ? { status: request.status } : {}),
      ...(request.chatSessionId !== undefined ? { chatSessionId: request.chatSessionId } : {}),
      ...(request.dispatchRunId !== undefined ? { dispatchRunId: request.dispatchRunId } : {}),
      updatedAt: this.now(),
    });
  }
}
