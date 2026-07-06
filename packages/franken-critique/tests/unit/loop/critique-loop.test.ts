import { describe, it, expect, vi } from 'vitest';
import { MaxIterationBreaker } from '../../../src/breakers/max-iteration.js';
import { CritiqueLoop } from '../../../src/loop/critique-loop.js';
import { CritiquePipeline } from '../../../src/pipeline/critique-pipeline.js';
import type { Evaluator, EvaluationFinding, EvaluationInput } from '../../../src/types/evaluation.js';
import type { CircuitBreaker, LoopConfig, CircuitBreakerResult, LoopState } from '../../../src/types/loop.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

function createConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    maxIterations: 3,
    tokenBudget: 100000,
    consensusThreshold: 3,
    sessionId: 'test-session',
    taskId: 'test-task',
    ...overrides,
  };
}

function createPassingPipeline(): CritiquePipeline {
  const evaluator: Evaluator = {
    name: 'mock',
    category: 'deterministic',
    evaluate: vi.fn().mockResolvedValue({
      evaluatorName: 'mock',
      verdict: 'pass',
      score: 1,
      findings: [],
    }),
  };
  return new CritiquePipeline([evaluator]);
}

function createFailingPipeline(findings: readonly EvaluationFinding[] = [{ message: 'issue found', severity: 'warning' }]): CritiquePipeline {
  const evaluator: Evaluator = {
    name: 'mock',
    category: 'deterministic',
    evaluate: vi.fn().mockResolvedValue({
      evaluatorName: 'mock',
      verdict: 'fail',
      score: 0.3,
      findings,
    }),
  };
  return new CritiquePipeline([evaluator]);
}

function createMockBreaker(
  name: string,
  result: CircuitBreakerResult = { tripped: false },
): CircuitBreaker {
  return {
    name,
    check: vi.fn().mockResolvedValue(result),
  };
}

describe('CritiqueLoop', () => {
  it('returns pass on first iteration when pipeline passes', async () => {
    const loop = new CritiqueLoop(createPassingPipeline(), []);
    const result = await loop.run(createInput('clean code'), createConfig());

    expect(result.verdict).toBe('pass');
    expect(result.iterations).toHaveLength(1);
  });

  it('returns fail with correction when pipeline fails', async () => {
    const loop = new CritiqueLoop(createFailingPipeline(), []);
    const result = await loop.run(createInput('bad code'), createConfig({ maxIterations: 1 }));

    expect(result.verdict).toBe('fail');
    if (result.verdict === 'fail') {
      expect(result.correction.findings).toHaveLength(1);
      expect(result.correction.summary).toBeTruthy();
      expect(result.correction.iterationCount).toBe(1);
    }
  });

  it('runs exactly maxIterations failing iterations before returning correction', async () => {
    const loop = new CritiqueLoop(createFailingPipeline(), [new MaxIterationBreaker()]);
    const result = await loop.run(createInput('bad code'), createConfig({ maxIterations: 2 }));

    expect(result.verdict).toBe('fail');
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations.map((iteration) => iteration.index)).toEqual([0, 1]);
    if (result.verdict === 'fail') {
      expect(result.correction.iterationCount).toBe(2);
    }
  });

  it('returns halted when breaker trips before first iteration', async () => {
    const breaker = createMockBreaker('test-breaker', {
      tripped: true,
      reason: 'test halt',
      action: 'halt',
    });
    const loop = new CritiqueLoop(createPassingPipeline(), [breaker]);
    const result = await loop.run(createInput('code'), createConfig());

    expect(result.verdict).toBe('halted');
    if (result.verdict === 'halted') {
      expect(result.reason).toContain('test halt');
    }
    expect(result.iterations).toHaveLength(0);
  });

  it('returns escalated when breaker signals escalation', async () => {
    const breaker = createMockBreaker('escalate-breaker', {
      tripped: true,
      reason: 'consensus failed',
      action: 'escalate',
    });
    const loop = new CritiqueLoop(createPassingPipeline(), [breaker]);
    const result = await loop.run(createInput('code'), createConfig());

    expect(result.verdict).toBe('escalated');
    if (result.verdict === 'escalated') {
      expect(result.escalation.reason).toContain('consensus failed');
      expect(result.escalation.taskId).toBe('test-task');
      expect(result.escalation.sessionId).toBe('test-session');
    }
  });

  it('tracks iteration history with timestamps', async () => {
    const loop = new CritiqueLoop(createPassingPipeline(), []);
    const result = await loop.run(createInput('code'), createConfig());

    expect(result.iterations[0]!.index).toBe(0);
    expect(result.iterations[0]!.completedAt).toBeTruthy();
    expect(result.iterations[0]!.result.verdict).toBe('pass');
  });

  it('checks breakers before each iteration', async () => {
    let callCount = 0;
    const breaker: CircuitBreaker = {
      name: 'counting-breaker',
      check: vi.fn().mockImplementation(async (_state: LoopState) => {
        callCount++;
        // Trip on second call (before second iteration)
        if (callCount >= 2) {
          return { tripped: true, reason: 'enough', action: 'halt' as const };
        }
        return { tripped: false };
      }),
    };

    const loop = new CritiqueLoop(createFailingPipeline(), [breaker]);
    const result = await loop.run(createInput('code'), createConfig());

    expect(result.verdict).toBe('halted');
    // First call: before iteration 0, passes. Second call: before iteration 1, trips.
    expect(callCount).toBe(2);
    expect(result.iterations).toHaveLength(1);
  });

  it('tracks failure history across iterations without mutating the public readonly contract', async () => {
    const observedFailures: number[] = [];
    const breaker: CircuitBreaker = {
      name: 'failure-history-observer',
      check: vi.fn().mockImplementation(async (state: LoopState) => {
        observedFailures.push(state.failureHistory.get('mock') ?? 0);
        return { tripped: false };
      }),
    };

    const loop = new CritiqueLoop(createFailingPipeline(), [breaker]);
    const result = await loop.run(createInput('bad code'), createConfig({ maxIterations: 2 }));

    expect(result.verdict).toBe('fail');
    expect(observedFailures).toEqual([0, 1]);
  });

  it('re-checks spend breakers after the terminal iteration (post phase)', async () => {
    // A phase:'both' breaker that is under budget before the iteration but trips
    // once the iteration's spend is recorded. Without the post-iteration check a
    // passing terminal iteration would return 'pass' and never see the overage.
    const breaker: CircuitBreaker = {
      name: 'spend-breaker',
      phase: 'both',
      check: vi.fn().mockImplementation(async (state: LoopState) =>
        state.iterations.length >= 1
          ? { tripped: true, reason: 'over budget', action: 'halt' as const }
          : { tripped: false },
      ),
    };
    const loop = new CritiqueLoop(createPassingPipeline(), [breaker]);
    const result = await loop.run(createInput('code'), createConfig());

    expect(result.verdict).toBe('halted');
    if (result.verdict === 'halted') {
      expect(result.reason).toContain('over budget');
    }
    expect(result.iterations).toHaveLength(1);
  });

  it('does not consult a pre-only breaker after the iteration', async () => {
    // Default-phase (pre) breakers must not run in the post phase.
    const check = vi.fn().mockResolvedValue({ tripped: false });
    const breaker: CircuitBreaker = { name: 'pre-only', check };
    const loop = new CritiqueLoop(createPassingPipeline(), [breaker]);
    const result = await loop.run(createInput('code'), createConfig());

    expect(result.verdict).toBe('pass');
    // One pre-check before the single (passing) iteration, none in the post phase.
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('builds correction request from failed evaluation findings', async () => {
    const findings = [
      { message: 'security issue', severity: 'critical' as const },
      { message: 'style issue', severity: 'info' as const },
    ];
    const loop = new CritiqueLoop(createFailingPipeline(findings), []);
    const result = await loop.run(createInput('code'), createConfig({ maxIterations: 1 }));

    expect(result.verdict).toBe('fail');
    if (result.verdict === 'fail') {
      expect(result.correction.findings).toHaveLength(2);
      expect(result.correction.score).toBe(0.3);
    }
  });
});
