import { describe, it, expect, vi } from 'vitest';
import { CritiquePipeline } from '../../../../src/critique/pipeline/critique-pipeline.js';
import type { Evaluator, EvaluationInput, EvaluationResult } from '../../../../src/critique/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

function createMockEvaluator(
  name: string,
  category: 'deterministic' | 'heuristic',
  result: Partial<EvaluationResult> = {},
): Evaluator {
  return {
    name,
    category,
    evaluate: vi.fn().mockResolvedValue({
      evaluatorName: name,
      verdict: 'pass',
      score: 1,
      findings: [],
      ...result,
    }),
  };
}

describe('CritiquePipeline', () => {
  it('returns pass with empty evaluator list', async () => {
    const pipeline = new CritiquePipeline([]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('pass');
    expect(result.overallScore).toBe(1);
    expect(result.results).toHaveLength(0);
    expect(result.shortCircuited).toBe(false);
  });

  it('runs a single passing evaluator', async () => {
    const evaluator = createMockEvaluator('test', 'deterministic');
    const pipeline = new CritiquePipeline([evaluator]);
    const result = await pipeline.run(createInput('clean code'));

    expect(result.verdict).toBe('pass');
    expect(result.overallScore).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
  });

  it('returns fail when any evaluator fails', async () => {
    const passing = createMockEvaluator('passing', 'deterministic');
    const failing = createMockEvaluator('failing', 'heuristic', {
      verdict: 'fail',
      score: 0.3,
      findings: [{ message: 'issue', severity: 'warning' }],
    });
    const pipeline = new CritiquePipeline([passing, failing]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('fail');
    expect(result.overallScore).toBeLessThan(1);
    expect(result.results).toHaveLength(2);
  });

  it('runs deterministic evaluators before heuristic', async () => {
    const callOrder: string[] = [];
    const heuristic: Evaluator = {
      name: 'heuristic-1',
      category: 'heuristic',
      evaluate: vi.fn().mockImplementation(async () => {
        callOrder.push('heuristic-1');
        return { evaluatorName: 'heuristic-1', verdict: 'pass', score: 1, findings: [] };
      }),
    };
    const deterministic: Evaluator = {
      name: 'deterministic-1',
      category: 'deterministic',
      evaluate: vi.fn().mockImplementation(async () => {
        callOrder.push('deterministic-1');
        return { evaluatorName: 'deterministic-1', verdict: 'pass', score: 1, findings: [] };
      }),
    };

    // Pass heuristic first to verify reordering
    const pipeline = new CritiquePipeline([heuristic, deterministic]);
    await pipeline.run(createInput('code'));

    expect(callOrder).toEqual(['deterministic-1', 'heuristic-1']);
  });

  it('short-circuits on safety evaluator failure', async () => {
    const safety = createMockEvaluator('safety', 'deterministic', {
      verdict: 'fail',
      score: 0,
      findings: [{ message: 'security violation', severity: 'critical' }],
    });
    const other = createMockEvaluator('other', 'heuristic');

    const pipeline = new CritiquePipeline([safety, other]);
    const result = await pipeline.run(createInput('eval("hack")'));

    expect(result.verdict).toBe('fail');
    expect(result.shortCircuited).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(other.evaluate).not.toHaveBeenCalled();
  });

  it('does not short-circuit on non-safety failures', async () => {
    const complexity = createMockEvaluator('complexity', 'heuristic', {
      verdict: 'fail',
      score: 0.3,
      findings: [{ message: 'too complex', severity: 'warning' }],
    });
    const other = createMockEvaluator('other', 'heuristic');

    const pipeline = new CritiquePipeline([complexity, other]);
    const result = await pipeline.run(createInput('code'));

    expect(result.shortCircuited).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(other.evaluate).toHaveBeenCalledTimes(1);
  });

  it('calculates average score across all evaluators', async () => {
    const a = createMockEvaluator('a', 'deterministic', { score: 0.8 });
    const b = createMockEvaluator('b', 'heuristic', { score: 0.6 });

    const pipeline = new CritiquePipeline([a, b]);
    const result = await pipeline.run(createInput('code'));

    expect(result.overallScore).toBe(0.7);
  });
});
