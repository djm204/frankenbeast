import { describe, it, expect, vi } from 'vitest';
import { CritiquePipeline } from '../../../src/pipeline/critique-pipeline.js';
import type { Evaluator, EvaluationInput, EvaluationResult } from '../../../src/types/evaluation.js';

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

function createThrowingEvaluator(
  name: string,
  category: 'deterministic' | 'heuristic',
  error: unknown,
): Evaluator {
  return {
    name,
    category,
    evaluate: vi.fn().mockRejectedValue(error),
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

  it('returns warn when evaluators only report non-critical warnings', async () => {
    const passing = createMockEvaluator('passing', 'deterministic');
    const warning = createMockEvaluator('warning', 'heuristic', {
      verdict: 'warn',
      score: 0.5,
      findings: [{ message: 'review this', severity: 'warning' }],
    });
    const pipeline = new CritiquePipeline([passing, warning]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('warn');
    expect(result.overallScore).toBe(0.75);
    expect(result.results).toHaveLength(2);
  });

  it('returns warn when a passing evaluator reports warning findings', async () => {
    const warning = createMockEvaluator('warning-rule', 'deterministic', {
      verdict: 'pass',
      score: 0.8,
      findings: [{ message: 'review this', severity: 'warning' }],
    });
    const pipeline = new CritiquePipeline([warning]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('warn');
    expect(result.overallScore).toBe(0.8);
  });

  it('keeps passing evaluator info findings informational', async () => {
    const informational = createMockEvaluator('reflection', 'heuristic', {
      verdict: 'pass',
      score: 0.9,
      findings: [{ message: 'on track', severity: 'info' }],
    });
    const pipeline = new CritiquePipeline([informational]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('pass');
    expect(result.overallScore).toBe(0.9);
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
    const unsafeDynamicCallName = 'executeUntrustedCode';

    const safety = createMockEvaluator('safety', 'deterministic', {
      verdict: 'fail',
      score: 0,
      findings: [{ message: 'security violation', severity: 'critical' }],
    });
    const other = createMockEvaluator('other', 'heuristic');

    const pipeline = new CritiquePipeline([safety, other]);
    const result = await pipeline.run(createInput(`${unsafeDynamicCallName}("hack")`));

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

  it('isolates evaluator exceptions as structured failures and continues later evaluators', async () => {
    const passing = createMockEvaluator('passing', 'deterministic', { score: 0.8 });
    const throwing = createThrowingEvaluator(
      'flaky-adr-check',
      'heuristic',
      new Error('memory backend unavailable'),
    );
    const later = createMockEvaluator('later', 'heuristic', { score: 0.6 });

    const pipeline = new CritiquePipeline([passing, throwing, later]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('fail');
    expect(result.shortCircuited).toBe(false);
    expect(result.overallScore).toBeCloseTo((0.8 + 0 + 0.6) / 3);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({ evaluatorName: 'passing', verdict: 'pass' });
    expect(result.results[1]).toMatchObject({
      evaluatorName: 'flaky-adr-check',
      verdict: 'fail',
      score: 0,
      findings: [
        {
          severity: 'critical',
          message: expect.stringContaining('flaky-adr-check'),
          suggestion: expect.stringContaining('evaluator'),
        },
      ],
    });
    expect(result.results[1]?.findings[0]?.message).toContain('memory backend unavailable');
    expect(result.results[2]).toMatchObject({ evaluatorName: 'later', verdict: 'pass' });
    expect(later.evaluate).toHaveBeenCalledTimes(1);
  });

  it('short-circuits after converting a safety evaluator exception into a structured failure', async () => {
    const safety = createThrowingEvaluator('safety', 'deterministic', new Error('guardrails unavailable'));
    const other = createMockEvaluator('other', 'heuristic');

    const pipeline = new CritiquePipeline([safety, other]);
    const result = await pipeline.run(createInput('code'));

    expect(result.verdict).toBe('fail');
    expect(result.shortCircuited).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      evaluatorName: 'safety',
      verdict: 'fail',
      score: 0,
      findings: [
        {
          severity: 'critical',
          message: expect.stringContaining('guardrails unavailable'),
        },
      ],
    });
    expect(other.evaluate).not.toHaveBeenCalled();
  });

  it('calculates average score across all evaluators', async () => {
    const a = createMockEvaluator('a', 'deterministic', { score: 0.8 });
    const b = createMockEvaluator('b', 'heuristic', { score: 0.6 });

    const pipeline = new CritiquePipeline([a, b]);
    const result = await pipeline.run(createInput('code'));

    expect(result.overallScore).toBe(0.7);
  });
});
