import { describe, it, expect, vi } from 'vitest';
import { FactualityEvaluator } from '../../../src/evaluators/factuality.js';
import type { MemoryPort } from '../../../src/types/contracts.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createMockMemoryPort(
  adrs: Awaited<ReturnType<MemoryPort['searchADRs']>> = [],
): MemoryPort {
  return {
    searchADRs: vi.fn().mockResolvedValue(adrs),
    searchEpisodic: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function createInput(content: string, metadata: Record<string, unknown> = {}): EvaluationInput {
  return { content, metadata };
}

describe('FactualityEvaluator', () => {
  it('implements Evaluator interface', () => {
    const port = createMockMemoryPort();
    const evaluator = new FactualityEvaluator(port);
    expect(evaluator.name).toBe('factuality');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes when no ADRs are relevant', async () => {
    const port = createMockMemoryPort([]);
    const evaluator = new FactualityEvaluator(port);

    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });

  it('passes when content references matching ADR topics', async () => {
    const port = createMockMemoryPort([
      { id: 'adr-001', title: 'Use TypeScript', content: 'All code must be TypeScript', relevanceScore: 0.9 },
    ]);
    const evaluator = new FactualityEvaluator(port);

    const result = await evaluator.evaluate(createInput('const x: number = 1;'));

    expect(result.verdict).toBe('pass');
  });

  it('calls searchADRs with content-derived query', async () => {
    const port = createMockMemoryPort();
    const evaluator = new FactualityEvaluator(port);

    await evaluator.evaluate(createInput('implement authentication with JWT'));

    expect(port.searchADRs).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
    );
  });

  it('reports findings when high-relevance ADRs exist', async () => {
    const port = createMockMemoryPort([
      {
        id: 'adr-002',
        title: 'No CommonJS',
        content: 'All modules must use ESM imports, never require()',
        relevanceScore: 0.95,
      },
    ]);
    const evaluator = new FactualityEvaluator(port);

    const result = await evaluator.evaluate(
      createInput('const fs = require("fs");'),
    );

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.message).toContain('ADR');
  });
});
