import type { TrackedAgent, TrackedAgentInitActionKind, BeastRun } from '../types.js';
import type { BeastDispatchService } from './beast-dispatch-service.js';
import { AgentService } from './agent-service.js';

export interface CreateChatInitAgentRequest {
  readonly definitionId: string;
  readonly chatSessionId: string;
  readonly command: string;
  readonly initActionKind: TrackedAgentInitActionKind;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface DispatchTrackedAgentRequest {
  readonly definitionId: string;
  readonly chatSessionId: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export class AgentInitService {
  constructor(
    private readonly agents: AgentService,
    private readonly dispatch: Pick<BeastDispatchService, 'createRun'>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  createChatInitAgent(request: CreateChatInitAgentRequest): TrackedAgent {
    const agent = this.agents.createAgent({
      definitionId: request.definitionId,
      source: 'chat',
      createdByUser: `chat-session:${request.chatSessionId}`,
      initAction: {
        kind: request.initActionKind,
        command: request.command,
        config: request.config,
        chatSessionId: request.chatSessionId,
      },
      initConfig: request.config,
      chatSessionId: request.chatSessionId,
    });

    this.agents.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.created',
      message: `Created tracked agent for ${request.definitionId}`,
      payload: {
        source: 'chat',
      },
    });
    this.agents.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.chat.bound',
      message: `Bound chat session ${request.chatSessionId}`,
      payload: {
        chatSessionId: request.chatSessionId,
      },
    });
    this.agents.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.command.sent',
      message: `Sent init command ${request.command}`,
      payload: {
        command: request.command,
      },
    });

    return agent;
  }

  async dispatchAgent(agentId: string, request: DispatchTrackedAgentRequest): Promise<BeastRun> {
    this.agents.appendEvent(agentId, {
      level: 'info',
      type: 'agent.dispatch.requested',
      message: `Dispatch requested for ${request.definitionId}`,
      payload: {
        definitionId: request.definitionId,
      },
    });

    return this.dispatch.createRun({
      definitionId: request.definitionId,
      config: request.config,
      dispatchedBy: 'chat',
      dispatchedByUser: `chat-session:${request.chatSessionId}`,
      trackedAgentId: agentId,
      startNow: true,
    });
  }
}
