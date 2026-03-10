import { randomUUID } from 'node:crypto';
import type { ILlmClient } from '@franken/core';
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
  /** When true, skip PromptBuilder after first turn — rely on CLI session continuation. */
  sessionContinuation?: boolean;
}

export class ConversationEngine {
  private readonly llm: ILlmClient;
  private readonly router: IntentRouter;
  private readonly policy: EscalationPolicy;
  private readonly promptBuilder: PromptBuilder;
  private readonly budgetPerSession: number | undefined;
  private readonly sessionContinuation: boolean;
  private turnCount = 0;

  constructor({ llm, projectName, maxTranscriptLength, budgetPerSession, sessionContinuation }: ConversationEngineOptions) {
    this.llm = llm;
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
  ): Promise<TurnResult> {
    // Budget check: reject if cumulative cost exceeds session budget
    if (this.budgetPerSession !== undefined) {
      const totalCost = history.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
      if (totalCost >= this.budgetPerSession) {
        const userMessage: TranscriptMessage = {
          id: randomUUID(),
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
      id: randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    if (outcome.kind === 'reply') {
      try {
        // First turn: full prompt with system context + history.
        // Subsequent turns with session continuation: raw input only
        // (CLI session already has context from --continue).
        const prompt = (this.sessionContinuation && this.turnCount > 0)
          ? input
          : this.promptBuilder.build([...history, userMessage]);
        this.turnCount++;
        const response = await this.llm.complete(prompt);
        const replyOutcome: ReplyOutcome = {
          kind: 'reply',
          content: response,
          modelTier: tier,
        };
        const assistantMessage: TranscriptMessage = {
          id: randomUUID(),
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
