import type { ILlmClient } from '@franken/types';
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
}

type ContinuationAwareLlmClient = ILlmClient & {
  complete(prompt: string, options?: { sessionContinue?: boolean; sessionId?: string }): Promise<string>;
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
        const prompt = shouldContinue
          ? input
          : this.promptBuilder.build([...history, userMessage]);
        const response = await this.llm.complete(prompt, {
          sessionContinue: shouldContinue,
          ...(sessionId ? { sessionId } : {}),
        });
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
        };
        return {
          outcome: replyOutcome,
          tier,
          newMessages: [userMessage, assistantMessage],
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
