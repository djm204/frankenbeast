import { describe, it, expect, vi } from 'vitest';
import { CritiqueLoop } from '../../../../src/critique/loop/critique-loop.js';
import { CritiquePipeline } from '../../../../src/critique/pipeline/critique-pipeline.js';
import type { Evaluator, EvaluationInput } from '../../../../src/critique/types/evaluation.js';
import type { CircuitBreaker, LoopConfig, CircuitBreakerResult, LoopState } from '../../../../src/critique/types/loop.js';

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

function createFailingPipeline(findings = [{ message: 'issue found', severity: 'warning' as const }]): CritiquePipeline {
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
    check: vi.fn().mockReturnValue(result),
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
      check: vi.fn().mockImplementation((_state: LoopState) => {
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
