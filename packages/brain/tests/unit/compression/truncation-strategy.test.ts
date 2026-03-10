import { describe, it, expect } from 'vitest';
import { TruncationStrategy } from '../../../src/compression/truncation-strategy.js';
import type { WorkingTurn } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

function t(tokenCount: number, overrides: Partial<WorkingTurn> = {}): WorkingTurn {
  return {
    id: generateId(),
    type: 'working',
    projectId: 'p',
    status: 'pending',
    createdAt: Date.now(),
    role: 'user',
    content: `turn with ${tokenCount} tokens`,
    tokenCount,
    ...overrides,
  };
}

const strategy = new TruncationStrategy();

describe('TruncationStrategy', () => {
  it('returns all turns when they fit within budget', async () => {
    const turns = [t(10), t(20), t(30)];
    const result = await strategy.compress(turns, 100);
    expect(result.summary.tokenCount).toBeLessThanOrEqual(100);
    expect(result.droppedCount).toBe(0);
  });

  it('drops oldest turns until total fits within budget', async () => {
    // oldest first in array; budget is 30 — only the last turn fits
    const turns = [t(20), t(20), t(20)];
    const result = await strategy.compress(turns, 25);
    expect(result.droppedCount).toBe(2);
    expect(result.summary.tokenCount).toBeLessThanOrEqual(25);
  });

  it('summary turn role is always "assistant"', async () => {
    const result = await strategy.compress([t(50), t(50)], 60);
    expect(result.summary.role).toBe('assistant');
  });

  it('summary content describes how many turns were dropped', async () => {
    const result = await strategy.compress([t(50), t(50), t(10)], 20);
    expect(result.summary.content).toMatch(/2/);
  });

  it('preserves pinned turns even when over budget', async () => {
    const pinned = t(100, { pinned: true });
    const unpinned = t(100);
    const result = await strategy.compress([unpinned, pinned], 50);
    // Pinned turn must appear in the output — summary wraps unpinned content
    expect(result.summary.content).toBeDefined();
    // The strategy drops unpinned content, not pinned
    expect(result.droppedCount).toBeGreaterThan(0);
  });

  it('returns droppedCount 0 and an empty-summary when given zero turns', async () => {
    const result = await strategy.compress([], 100);
    expect(result.droppedCount).toBe(0);
    expect(result.summary.tokenCount).toBe(0);
  });

  it('handles all-pinned candidates (droppable is empty)', async () => {
    const allPinned = [t(40, { pinned: true }), t(40, { pinned: true })];
    const result = await strategy.compress(allPinned, 30);
    // Nothing droppable — dropped count is 0
    expect(result.droppedCount).toBe(0);
  });
});
