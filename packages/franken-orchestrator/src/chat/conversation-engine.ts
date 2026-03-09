import type { ILlmClient } from '@franken/types';
import type {
  ModelTierValue,
  TranscriptMessage,
  TurnOutcome,
  ReplyOutcome,
} from './types.js';
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
}

export class ConversationEngine {
  private readonly llm: ILlmClient;
  private readonly router: IntentRouter;
  private readonly policy: EscalationPolicy;
  private readonly promptBuilder: PromptBuilder;
  private readonly budgetPerSession?: number;

  constructor({ llm, projectName, maxTranscriptLength, budgetPerSession }: ConversationEngineOptions) {
    this.llm = llm;
    this.router = new IntentRouter();
    this.policy = new EscalationPolicy();
    this.promptBuilder = new PromptBuilder({
      projectName,
      ...(maxTranscriptLength !== undefined ? { maxMessages: maxTranscriptLength } : {}),
    });
    this.budgetPerSession = budgetPerSession;
  }

  async processTurn(
    input: string,
    history: TranscriptMessage[],
  ): Promise<TurnResult> {
    // Budget check: reject if cumulative cost exceeds session budget
    if (this.budgetPerSession !== undefined) {
      const totalCost = history.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
      if (totalCost >= this.budgetPerSession) {
        const userMessage: TranscriptMessage = {
          role: 'user',
          content: input,
          timestamp: new Date().toISOString(),
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
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    if (outcome.kind === 'reply') {
      try {
        const prompt = this.promptBuilder.build([...history, userMessage]);
        const response = await this.llm.complete(prompt);
        const replyOutcome: ReplyOutcome = {
          kind: 'reply',
          content: response,
          modelTier: tier,
        };
        const assistantMessage: TranscriptMessage = {
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
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
