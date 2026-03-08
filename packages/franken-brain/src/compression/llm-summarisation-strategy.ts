import type { WorkingTurn } from '../types/index.js';
import { generateId } from '../types/index.js';
import type { ICompressionStrategy, CompressionResult } from '../working/compression-strategy.js';
import type { ILlmClient } from './llm-client-interface.js';
import { TruncationStrategy } from './truncation-strategy.js';
import { buildSummarisationPrompt } from './prompts.js';

// Approximate token count: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export class LlmSummarisationStrategy implements ICompressionStrategy {
  private readonly fallback = new TruncationStrategy();

  constructor(private readonly llm: ILlmClient) {}

  async compress(candidates: WorkingTurn[], budget: number): Promise<CompressionResult> {
    try {
      const prompt = buildSummarisationPrompt(candidates);
      const summaryText = await this.llm.complete(prompt);

      return {
        summary: {
          id: generateId(),
          type: 'working',
          projectId: candidates[0]?.projectId ?? 'system',
          status: 'compressed',
          createdAt: Date.now(),
          role: 'assistant',
          content: summaryText,
          tokenCount: approxTokens(summaryText),
        },
        droppedCount: candidates.length,
      };
    } catch {
      // LLM unavailable — degrade gracefully to truncation
      return this.fallback.compress(candidates, budget);
    }
  }
}
