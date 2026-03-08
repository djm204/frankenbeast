import { describe, it, expect, vi } from 'vitest';
import { ADRComplianceEvaluator } from '../../../src/evaluators/adr-compliance.js';
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

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('ADRComplianceEvaluator', () => {
  it('implements Evaluator interface', () => {
    const port = createMockMemoryPort();
    const evaluator = new ADRComplianceEvaluator(port);
    expect(evaluator.name).toBe('adr-compliance');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes when no relevant ADRs found', async () => {
    const port = createMockMemoryPort([]);
    const evaluator = new ADRComplianceEvaluator(port);

    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });

  it('reports high-relevance ADRs as review findings', async () => {
    const port = createMockMemoryPort([
      {
        id: 'adr-001',
        title: 'Use strict TypeScript',
        content: 'All code must use strict: true in tsconfig',
        relevanceScore: 0.9,
      },
    ]);
    const evaluator = new ADRComplianceEvaluator(port);

    const result = await evaluator.evaluate(createInput('// @ts-nocheck\nconst x: any = 1;'));

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.message).toContain('adr-001');
  });

  it('ignores low-relevance ADRs', async () => {
    const port = createMockMemoryPort([
      {
        id: 'adr-099',
        title: 'Unrelated ADR',
        content: 'Some unrelated decision',
        relevanceScore: 0.2,
      },
    ]);
    const evaluator = new ADRComplianceEvaluator(port);

    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('queries memory with content-derived query', async () => {
    const port = createMockMemoryPort();
    const evaluator = new ADRComplianceEvaluator(port);

    await evaluator.evaluate(createInput('use redis for caching'));

    expect(port.searchADRs).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
    );
  });
});
