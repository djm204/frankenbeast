import type { BeastExecutionMode } from '../beasts/types.js';
import type { ChatBeastContext, TranscriptMessage } from './types.js';
import type { ChatBeastDispatchResult, ChatBeastDispatchState } from './beast-dispatch-adapter.js';

interface BeastDefinitionSummary {
  readonly id: string;
  readonly label: string;
}

interface InterviewPrompt {
  readonly prompt: string;
  readonly options?: readonly string[] | undefined;
}

interface InterviewSession {
  readonly id: string;
  readonly definitionId: string;
  readonly currentPrompt?: InterviewPrompt | undefined;
}

interface InterviewProgress {
  readonly complete: boolean;
  readonly config?: Readonly<Record<string, unknown>> | undefined;
  readonly currentPrompt?: InterviewPrompt | undefined;
  readonly session: InterviewSession;
}

interface BeastRunResponse {
  readonly id: string;
  readonly status: string;
}

interface TrackedAgentResponse {
  readonly id: string;
  readonly dispatchRunId?: string | undefined;
}

export interface BeastDaemonDispatchAdapterOptions {
  readonly baseUrl: string;
  readonly operatorToken: string;
}

const BEAST_VERBS = /\b(spawn|dispatch|launch|start|run|create)\b/i;
const BEAST_NOUNS = /\b(beast|frankenbeast|agent|worker)\b/i;

export class BeastDaemonDispatchAdapter {
  constructor(private readonly options: BeastDaemonDispatchAdapterOptions) {}

  async handle(input: string, state: ChatBeastDispatchState): Promise<ChatBeastDispatchResult | null> {
    const activeContext = state.beastContext && state.executionMode
      ? { ...state.beastContext, executionMode: state.executionMode }
      : state.beastContext;
    if (activeContext?.status === 'interviewing' && activeContext.interviewSessionId) {
      const progress = await this.answerInterview(activeContext.interviewSessionId, input);
      return this.resultFromProgress(progress, activeContext, state.sessionId);
    }

    if (!this.isLaunchRequest(input)) {
      return null;
    }

    let definitions: BeastDefinitionSummary[];
    try {
      definitions = await this.listDefinitions();
    } catch {
      return null;
    }
    const definition = this.matchDefinition(input, definitions);
    if (!definition) {
      return null;
    }

    const interview = await this.startInterview(definition.id);
    const prompt = interview.currentPrompt;
    if (!prompt) {
      throw new Error(`Beast interview started without a prompt: ${definition.id}`);
    }

    return {
      kind: 'interview',
      definitionId: definition.id,
      assistantMessage: this.formatPrompt(definition.label, prompt.prompt, prompt.options),
      beastContext: {
        agentId: await this.createTrackedAgent(definition.id, state.sessionId),
        definitionId: definition.id,
        interviewSessionId: interview.id,
        ...(state.executionMode ? { executionMode: state.executionMode } : {}),
        status: 'interviewing',
      },
    };
  }

  private async resultFromProgress(
    progress: InterviewProgress,
    context: ChatBeastContext,
    sessionId: string,
  ): Promise<ChatBeastDispatchResult> {
    const definitionId = context.definitionId;
    const definition = (await this.listDefinitions()).find((entry) => entry.id === definitionId);
    if (!definition) {
      throw new Error(`Unknown Beast definition: ${definitionId}`);
    }

    if (!progress.complete || !progress.config) {
      if (!progress.currentPrompt) {
        throw new Error(`Beast interview requires next prompt or completed config: ${definitionId}`);
      }
      return {
        kind: 'interview',
        definitionId,
        assistantMessage: this.formatPrompt(definition.label, progress.currentPrompt.prompt, progress.currentPrompt.options),
        beastContext: {
          ...(context.agentId ? { agentId: context.agentId } : {}),
          definitionId,
          interviewSessionId: progress.session.id,
          ...(context.executionMode ? { executionMode: context.executionMode } : {}),
          status: 'interviewing',
        },
      };
    }

    const run = await this.createRun({
      definitionId,
      config: progress.config,
      sessionId,
      ...(context.agentId ? { trackedAgentId: context.agentId } : {}),
      ...(context.executionMode ? { executionMode: context.executionMode } : {}),
    });

    return {
      kind: 'dispatch',
      definitionId,
      runId: run.id,
      assistantMessage: `Started ${definition.label} beast run ${run.id}. Status: ${run.status}.`,
      beastContext: null,
    };
  }

  private async listDefinitions(): Promise<BeastDefinitionSummary[]> {
    const body = await this.request<{ data: BeastDefinitionSummary[] }>('/v1/beasts/catalog');
    return body.data.map((definition) => ({ id: definition.id, label: definition.label }));
  }

  private async startInterview(definitionId: string): Promise<InterviewSession> {
    const body = await this.request<{ data: InterviewSession }>(`/v1/beasts/interviews/${encodeURIComponent(definitionId)}/start`, {
      method: 'POST',
    });
    return body.data;
  }

  private async answerInterview(sessionId: string, answer: string): Promise<InterviewProgress> {
    const body = await this.request<{ data: InterviewProgress }>(`/v1/beasts/interviews/${encodeURIComponent(sessionId)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
    return body.data;
  }

  private async createTrackedAgent(definitionId: string, sessionId: string): Promise<string> {
    const body = await this.request<{ data: TrackedAgentResponse }>('/v1/beasts/agents', {
      method: 'POST',
      body: JSON.stringify({
        definitionId,
        initAction: {
          kind: definitionId,
          command: commandFor(definitionId),
          config: {},
          chatSessionId: sessionId,
        },
        initConfig: {},
        chatSessionId: sessionId,
        autoDispatch: false,
      }),
    });
    return body.data.id;
  }

  private async createRun(request: {
    definitionId: string;
    config: Readonly<Record<string, unknown>>;
    sessionId: string;
    trackedAgentId?: string | undefined;
    executionMode?: BeastExecutionMode | undefined;
  }): Promise<BeastRunResponse> {
    const body = await this.request<{ data: BeastRunResponse }>('/v1/beasts/runs', {
      method: 'POST',
      body: JSON.stringify({
        definitionId: request.definitionId,
        config: request.config,
        startNow: true,
        ...(request.trackedAgentId ? { trackedAgentId: request.trackedAgentId } : {}),
        ...(request.executionMode ? { executionMode: request.executionMode } : {}),
      }),
    });
    return body.data;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.options.operatorToken}`);
    if (init.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const response = await fetch(new URL(path, this.options.baseUrl), {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(`Beast daemon request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  private isLaunchRequest(input: string): boolean {
    return BEAST_VERBS.test(input) && BEAST_NOUNS.test(input);
  }

  private matchDefinition(input: string, definitions: BeastDefinitionSummary[]): BeastDefinitionSummary | null {
    const normalized = input.toLowerCase();
    return definitions
      .find((definition) => this.aliasesFor(definition).some((alias) => normalized.includes(alias)))
      ?? null;
  }

  private aliasesFor(definition: BeastDefinitionSummary): string[] {
    const aliases = new Set<string>([
      definition.id.toLowerCase(),
      definition.label.toLowerCase(),
      definition.id.replace(/-/g, ' ').toLowerCase(),
      definition.label.replace(/\s+/g, ' ').toLowerCase(),
    ]);

    if (definition.id === 'martin-loop') {
      aliases.add('martin');
      aliases.add('martin loop');
    }
    if (definition.id === 'chunk-plan') {
      aliases.add('chunk');
      aliases.add('chunk plan');
    }
    if (definition.id === 'design-interview') {
      aliases.add('design interview');
    }

    return [...aliases];
  }

  private formatPrompt(label: string, prompt: string, options?: readonly string[] | undefined): string {
    if (!options || options.length === 0) {
      return `${label} interview: ${prompt}`;
    }
    return `${label} interview: ${prompt} Options: ${options.join(', ')}`;
  }
}

export type BeastDispatchPort = {
  handle(input: string, state: {
    projectId: string;
    sessionId: string;
    transcript: TranscriptMessage[];
    beastContext?: ChatBeastContext | null | undefined;
    executionMode?: BeastExecutionMode | undefined;
  }): Promise<ChatBeastDispatchResult | null>;
};

function commandFor(definitionId: string): string {
  switch (definitionId) {
    case 'design-interview':
      return '/interview';
    case 'chunk-plan':
      return '/plan';
    case 'martin-loop':
    default:
      return definitionId;
  }
}
