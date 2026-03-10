import { describe, it, expect } from 'vitest';
import { ConsensusFailureBreaker } from '../../../../src/critique/breakers/consensus-failure.js';
import type { LoopState, LoopConfig } from '../../../../src/critique/types/loop.js';

function createConfig(consensusThreshold: number): LoopConfig {
  return {
    maxIterations: 5,
    tokenBudget: 100000,
    consensusThreshold,
    sessionId: 'test-session',
    taskId: 'test-task',
  };
}

function createState(
  iterationCount: number,
  failureHistory: Record<string, number>,
): LoopState {
  return {
    iterationCount,
    iterations: [],
    failureHistory: new Map(Object.entries(failureHistory)),
  };
}

describe('ConsensusFailureBreaker', () => {
  it('implements CircuitBreaker interface', () => {
    const breaker = new ConsensusFailureBreaker();
    expect(breaker.name).toBe('consensus-failure');
    expect(typeof breaker.check).toBe('function');
  });

  it('does not trip when no failures', () => {
    const breaker = new ConsensusFailureBreaker();
    const result = breaker.check(createState(0, {}), createConfig(3));
    expect(result.tripped).toBe(false);
  });

  it('does not trip when failures are below threshold', () => {
    const breaker = new ConsensusFailureBreaker();
    const result = breaker.check(
      createState(2, { safety: 2 }),
      createConfig(3),
    );
    expect(result.tripped).toBe(false);
  });

  it('trips when a category reaches the threshold', () => {
    const breaker = new ConsensusFailureBreaker();
    const result = breaker.check(
      createState(3, { safety: 3 }),
      createConfig(3),
    );
    expect(result.tripped).toBe(true);
    if (result.tripped) {
      expect(result.action).toBe('escalate');
      expect(result.reason).toContain('safety');
    }
  });

  it('trips when any one category exceeds threshold', () => {
    const breaker = new ConsensusFailureBreaker();
    const result = breaker.check(
      createState(4, { safety: 1, complexity: 4 }),
      createConfig(3),
    );
    expect(result.tripped).toBe(true);
    if (result.tripped) {
      expect(result.reason).toContain('complexity');
    }
  });

  it('does not trip when multiple categories are below threshold', () => {
    const breaker = new ConsensusFailureBreaker();
    const result = breaker.check(
      createState(3, { safety: 1, complexity: 2, factuality: 1 }),
      createConfig(3),
    );
    expect(result.tripped).toBe(false);
  });
});
