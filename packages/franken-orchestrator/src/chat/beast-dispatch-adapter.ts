import type { BeastCatalogService } from '../beasts/services/beast-catalog-service.js';
import type { BeastDispatchService } from '../beasts/services/beast-dispatch-service.js';
import type { BeastInterviewService, BeastInterviewProgress } from '../beasts/services/beast-interview-service.js';
import type { ChatBeastContext, TranscriptMessage } from './types.js';

export interface ChatBeastDispatchState {
  readonly projectId: string;
  readonly sessionId: string;
  readonly transcript: TranscriptMessage[];
  readonly beastContext?: ChatBeastContext | null | undefined;
}

export interface ChatBeastDispatchResult {
  readonly kind: 'interview' | 'dispatch';
  readonly assistantMessage: string;
  readonly beastContext: ChatBeastContext | null;
  readonly definitionId: string;
  readonly runId?: string | undefined;
}

export interface ChatBeastDispatchAdapterOptions {
  readonly catalog: BeastCatalogService;
  readonly interviews: BeastInterviewService;
  readonly dispatch: BeastDispatchService;
}

interface BeastDefinitionSummary {
  readonly id: string;
  readonly label: string;
}

const BEAST_VERBS = /\b(spawn|dispatch|launch|start|run|create)\b/i;
const BEAST_NOUNS = /\b(beast|frankenbeast|agent|worker)\b/i;

export class ChatBeastDispatchAdapter {
  constructor(private readonly options: ChatBeastDispatchAdapterOptions) {}

  async handle(input: string, state: ChatBeastDispatchState): Promise<ChatBeastDispatchResult | null> {
    const activeContext = state.beastContext;
    if (activeContext?.status === 'interviewing' && activeContext.interviewSessionId) {
      const progress = this.options.interviews.answer(activeContext.interviewSessionId, input);
      return this.resultFromProgress(progress, activeContext.definitionId, state.sessionId);
    }

    const definition = this.matchDefinition(input);
    if (!definition) {
      return null;
    }

    const interview = this.options.interviews.start(definition.id);
    const prompt = interview.currentPrompt;
    if (!prompt) {
      throw new Error(`Beast interview started without a prompt: ${definition.id}`);
    }

    return {
      kind: 'interview',
      definitionId: definition.id,
      assistantMessage: this.formatPrompt(definition.label, prompt.prompt, prompt.options),
      beastContext: {
        definitionId: definition.id,
        interviewSessionId: interview.id,
        status: 'interviewing',
      },
    };
  }

  private async resultFromProgress(
    progress: BeastInterviewProgress,
    definitionId: string,
    sessionId: string,
  ): Promise<ChatBeastDispatchResult> {
    const definition = this.getDefinitionOrThrow(definitionId);
    if (!progress.complete || !progress.config) {
      if (!progress.currentPrompt) {
        throw new Error(`Beast interview requires next prompt or completed config: ${definitionId}`);
      }
      return {
        kind: 'interview',
        definitionId,
        assistantMessage: this.formatPrompt(definition.label, progress.currentPrompt.prompt, progress.currentPrompt.options),
        beastContext: {
          definitionId,
          interviewSessionId: progress.session.id,
          status: 'interviewing',
        },
      };
    }

    const run = await this.options.dispatch.createRun({
      definitionId,
      config: progress.config,
      dispatchedBy: 'chat',
      dispatchedByUser: `chat-session:${sessionId}`,
      startNow: true,
    });

    return {
      kind: 'dispatch',
      definitionId,
      runId: run.id,
      assistantMessage: `Started ${definition.label} beast run ${run.id}. Status: ${run.status}.`,
      beastContext: null,
    };
  }

  private matchDefinition(input: string): BeastDefinitionSummary | null {
    if (!BEAST_VERBS.test(input) || !BEAST_NOUNS.test(input)) {
      return null;
    }

    const normalized = input.toLowerCase();
    return this.options.catalog.listDefinitions()
      .map((definition) => ({ id: definition.id, label: definition.label }))
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

  private getDefinitionOrThrow(definitionId: string): BeastDefinitionSummary {
    const definition = this.options.catalog.listDefinitions()
      .map((entry) => ({ id: entry.id, label: entry.label }))
      .find((entry) => entry.id === definitionId);
    if (!definition) {
      throw new Error(`Unknown Beast definition: ${definitionId}`);
    }
    return definition;
  }

  private formatPrompt(label: string, prompt: string, options?: readonly string[] | undefined): string {
    if (!options || options.length === 0) {
      return `${label} interview: ${prompt}`;
    }
    return `${label} interview: ${prompt} Options: ${options.join(', ')}`;
  }
}
