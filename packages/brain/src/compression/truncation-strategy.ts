import type { WorkingTurn } from '../types/index.js';
import { generateId } from '../types/index.js';
import type { ICompressionStrategy, CompressionResult } from '../working/compression-strategy.js';

// Approximate token count: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export class TruncationStrategy implements ICompressionStrategy {
  async compress(candidates: WorkingTurn[], budget: number): Promise<CompressionResult> {
    if (candidates.length === 0) {
      return {
        summary: makeSummaryTurn('', 0, 0),
        droppedCount: 0,
      };
    }

    // Separate pinned turns — they are always kept
    const pinned = candidates.filter((t) => t.pinned === true);
    const droppable = candidates.filter((t) => t.pinned !== true);

    const pinnedTokens = pinned.reduce((sum, t) => sum + t.tokenCount, 0);
    const remaining = budget - pinnedTokens;

    // Walk droppable turns newest-first, keep as many as fit
    const kept: WorkingTurn[] = [];
    let usedTokens = 0;

    for (let i = droppable.length - 1; i >= 0; i--) {
      const turn = droppable[i]!;
      if (usedTokens + turn.tokenCount <= remaining) {
        kept.unshift(turn);
        usedTokens += turn.tokenCount;
      }
    }

    const droppedCount = droppable.length - kept.length;
    const summaryText = droppedCount > 0
      ? `[Truncated: ${droppedCount} earlier turn(s) dropped to fit token budget]`
      : [...pinned, ...kept].map((t) => t.content).join(' ');

    const summaryTokens = droppedCount > 0
      ? approxTokens(summaryText)
      : usedTokens + pinnedTokens;

    return {
      summary: makeSummaryTurn(summaryText, summaryTokens, droppedCount),
      droppedCount,
    };
  }
}

function makeSummaryTurn(content: string, tokenCount: number, droppedCount: number): WorkingTurn {
  return {
    id: generateId(),
    type: 'working',
    projectId: 'system',
    status: 'compressed',
    createdAt: Date.now(),
    role: 'assistant',
    content: content || `[Truncated: ${droppedCount} turn(s) dropped]`,
    tokenCount,
  };
}
