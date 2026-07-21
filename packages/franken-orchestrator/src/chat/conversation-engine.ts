import type { ILlmClient, ProviderContext, TokenUsage } from '@franken/types';
import type {
  ModelTierValue,
  TranscriptMessage,
  TurnOutcome,
  ReplyOutcome,
} from './types.js';
import { deterministicUuid, isoNow } from '@franken/types';
import { IntentRouter } from './intent-router.js';
import { EscalationPolicy } from './escalation-policy.js';
import { PromptBuilder } from './prompt-builder.js';

export interface TurnResult {
  outcome: TurnOutcome;
  tier: ModelTierValue;
  newMessages: TranscriptMessage[];
  /** Real token usage for this turn's LLM call, when the provider reported it. */
  usage?: TokenUsage;
  /** Whether this turn's prompt had to drop history to fit maxTranscriptLength. */
  truncated?: boolean;
  /** The CLI provider/model that actually served this turn, and any fallback that occurred. */
  providerContext?: ProviderContext;
}

export interface ConversationEngineOptions {
  llm: ILlmClient;
  projectName: string;
  maxTranscriptLength?: number;
  budgetPerSession?: number;
  /** When true, skip PromptBuilder after first turn — rely on CLI session continuation. */
  sessionContinuation?: boolean;
}

interface ConversationEngineTurnOptions {
  sessionId?: string;
  /**
   * The provider/model that served the most recently completed turn, if any.
   * Injected into this turn's prompt so the model can answer "what model are
   * you" or "is this a fallback" from real runtime facts rather than its own
   * training-time self-description, which has no way to know it was invoked
   * via a fallback. Deliberately based on the *last known* state, not this
   * turn's outcome — that isn't knowable until after the call completes.
   */
  priorProviderContext?: ProviderContext;
}

const SWITCH_REASON_TEXT: Record<string, string> = {
  rate_limited: 'was rate-limited',
  unavailable: 'was unavailable',
};

/**
 * Builds a short runtime-status note describing which provider/model is
 * actually serving this turn, for injection into the prompt. Exported for
 * direct unit testing of the wording.
 */
export function formatProviderTransparencyNote(ctx: ProviderContext): string {
  const modelPart = ctx.model ? ` (model: ${ctx.model})` : '';
  const base = `Runtime status: this turn is being served by the "${ctx.provider}" CLI provider${modelPart}.`;
  if (!ctx.switchedFrom) {
    return `${base} Answer questions about your current model/provider using this fact.`;
  }
  const reasonText = (ctx.switchReason && SWITCH_REASON_TEXT[ctx.switchReason]) ?? 'was unavailable';
  return `${base} This is an automatic fallback: the configured provider "${ctx.switchedFrom}" ${reasonText}, so the request was retried against "${ctx.provider}". If asked what model/provider you're running on, or whether this is a fallback, answer truthfully using these facts — do not deny it or guess your identity from training data.`;
}

type ContinuationAwareLlmClient = ILlmClient & {
  complete(prompt: string, options?: { sessionContinue?: boolean; sessionId?: string }): Promise<string>;
  completeWithUsage?(
    prompt: string,
    options?: { sessionContinue?: boolean; sessionId?: string },
  ): Promise<{ text: string; usage?: TokenUsage; providerContext?: ProviderContext }>;
};

export class ConversationEngine {
  private readonly llm: ContinuationAwareLlmClient;
  private readonly router: IntentRouter;
  private readonly policy: EscalationPolicy;
  private readonly promptBuilder: PromptBuilder;
  private readonly budgetPerSession: number | undefined;
  private readonly sessionContinuation: boolean;
  private readonly primedSessions = new Set<string>();

  constructor({ llm, projectName, maxTranscriptLength, budgetPerSession, sessionContinuation }: ConversationEngineOptions) {
    this.llm = llm as ContinuationAwareLlmClient;
    this.router = new IntentRouter();
    this.policy = new EscalationPolicy();
    this.promptBuilder = new PromptBuilder({
      projectName,
      ...(maxTranscriptLength !== undefined ? { maxMessages: maxTranscriptLength } : {}),
    });
    this.budgetPerSession = budgetPerSession;
    this.sessionContinuation = sessionContinuation ?? false;
  }

  async processTurn(
    input: string,
    history: TranscriptMessage[],
    options: ConversationEngineTurnOptions = {},
  ): Promise<TurnResult> {
    // Budget check: reject if cumulative cost exceeds session budget
    if (this.budgetPerSession !== undefined) {
      const totalCost = history.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
      if (totalCost >= this.budgetPerSession) {
        const userMessage: TranscriptMessage = {
          id: deterministicUuid('packages/franken-orchestrator/src/chat/conversation-engine.ts'),
          role: 'user',
          content: input,
          timestamp: isoNow(),
        };
        const budgetReply: ReplyOutcome = {
          kind: 'reply',
          content: `Session budget exceeded ($${totalCost.toFixed(2)} / $${this.budgetPerSession.toFixed(2)}). Please start a new session.`,
          modelTier: 'cheap',
        };
        return {
          outcome: budgetReply,
          tier: 'cheap',
          newMessages: [userMessage],
        };
      }
    }

    const intent = this.router.classify(input);
    const { tier, outcome } = this.policy.evaluate(intent, input);

    const userMessage: TranscriptMessage = {
      id: deterministicUuid('packages/franken-orchestrator/src/chat/conversation-engine.ts'),
      role: 'user',
      content: input,
      timestamp: isoNow(),
    };

    if (outcome.kind === 'reply') {
      try {
        // First reply turn for each live session: full prompt with system context + history.
        // Subsequent turns with session continuation: raw input only
        // (CLI session already has context from --continue). Scope the decision to
        // sessions that this engine has actually primed with a prior LLM reply so
        // a shared HTTP runtime cannot leak continuation state across independent
        // or resumed chat sessions.
        const sessionId = this.sessionContinuation ? options.sessionId : undefined;
        const shouldContinue = this.sessionContinuation
          && (sessionId ? this.primedSessions.has(sessionId) : history.length > 0);
        const built = shouldContinue
          ? undefined
          : this.promptBuilder.build([...history, userMessage]);
        const basePrompt = built ? built.prompt : input;
        // Based on the last known provider state (available from the prior
        // completed turn, if any) — this turn's own outcome isn't knowable
        // until after the call below, so a fallback happening *right now*
        // is reported starting next turn, not this one.
        const transparencyNote = options.priorProviderContext
          ? formatProviderTransparencyNote(options.priorProviderContext)
          : undefined;
        const prompt = transparencyNote ? `${basePrompt}\n\n${transparencyNote}` : basePrompt;
        const completeOptions = {
          sessionContinue: shouldContinue,
          ...(sessionId ? { sessionId } : {}),
        };
        const { response, usage, providerContext } = typeof this.llm.completeWithUsage === 'function'
          ? await this.llm.completeWithUsage(prompt, completeOptions).then((result) => ({ response: result.text, usage: result.usage, providerContext: result.providerContext }))
          : await this.llm.complete(prompt, completeOptions).then((text) => ({ response: text, usage: undefined as TokenUsage | undefined, providerContext: undefined as ProviderContext | undefined }));
        if (sessionId) {
          this.primedSessions.add(sessionId);
        }
        const replyOutcome: ReplyOutcome = {
          kind: 'reply',
          content: response,
          modelTier: tier,
        };
        const assistantMessage: TranscriptMessage = {
          id: deterministicUuid('packages/franken-orchestrator/src/chat/conversation-engine.ts'),
          role: 'assistant',
          content: response,
          timestamp: isoNow(),
          modelTier: tier,
          ...(usage ? { tokens: usage.totalTokens } : {}),
        };
        return {
          outcome: replyOutcome,
          tier,
          newMessages: [userMessage, assistantMessage],
          ...(usage ? { usage } : {}),
          ...(built ? { truncated: built.truncated } : {}),
          ...(providerContext ? { providerContext } : {}),
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        const errorOutcome: ReplyOutcome = {
          kind: 'reply',
          content: `Error: ${errorMsg}`,
          modelTier: tier,
        };
        return {
          outcome: errorOutcome,
          tier,
          newMessages: [userMessage],
        };
      }
    }

    // For execute, plan, clarify: return outcome immediately without calling LLM
    return {
      outcome,
      tier,
      newMessages: [userMessage],
    };
  }
}
