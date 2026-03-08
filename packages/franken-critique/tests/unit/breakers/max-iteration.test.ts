import { describe, it, expect } from 'vitest';
import { MaxIterationBreaker } from '../../../src/breakers/max-iteration.js';
import { ConfigurationError } from '../../../src/errors/index.js';
import type { LoopState, LoopConfig } from '../../../src/types/loop.js';

function createState(iterationCount: number): LoopState {
  return { iterationCount, iterations: [], failureHistory: new Map() };
}

function createConfig(maxIterations: number): LoopConfig {
  return {
    maxIterations,
    tokenBudget: 100000,
    consensusThreshold: 3,
    sessionId: 'test-session',
    taskId: 'test-task',
  };
}

describe('MaxIterationBreaker', () => {
  it('implements CircuitBreaker interface', () => {
    const breaker = new MaxIterationBreaker();
    expect(breaker.name).toBe('max-iteration');
    expect(typeof breaker.check).toBe('function');
  });

  it('does not trip when below limit', () => {
    const breaker = new MaxIterationBreaker();
    const result = breaker.check(createState(1), createConfig(3));
    expect(result.tripped).toBe(false);
  });

  it('trips when at limit', () => {
    const breaker = new MaxIterationBreaker();
    const result = breaker.check(createState(3), createConfig(3));
    expect(result.tripped).toBe(true);
    if (result.tripped) {
      expect(result.action).toBe('halt');
      expect(result.reason).toContain('3');
    }
  });

  it('trips when above limit', () => {
    const breaker = new MaxIterationBreaker();
    const result = breaker.check(createState(5), createConfig(3));
    expect(result.tripped).toBe(true);
  });

  it('does not trip at zero iterations', () => {
    const breaker = new MaxIterationBreaker();
    const result = breaker.check(createState(0), createConfig(3));
    expect(result.tripped).toBe(false);
  });

  it('throws ConfigurationError when maxIterations < 1', () => {
    const breaker = new MaxIterationBreaker();
    expect(() => breaker.check(createState(0), createConfig(0))).toThrow(
      ConfigurationError,
    );
  });

  it('throws ConfigurationError when maxIterations > 5', () => {
    const breaker = new MaxIterationBreaker();
    expect(() => breaker.check(createState(0), createConfig(6))).toThrow(
      ConfigurationError,
    );
  });
});
