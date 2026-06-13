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

  it('does not trip when below limit', async () => {
    const breaker = new MaxIterationBreaker();
    const result = await breaker.check(createState(1), createConfig(3));
    expect(result.tripped).toBe(false);
  });

  it('trips when at limit', async () => {
    const breaker = new MaxIterationBreaker();
    const result = await breaker.check(createState(3), createConfig(3));
    expect(result.tripped).toBe(true);
    if (result.tripped) {
      expect(result.action).toBe('halt');
      expect(result.reason).toContain('3');
    }
  });

  it('trips when above limit', async () => {
    const breaker = new MaxIterationBreaker();
    const result = await breaker.check(createState(5), createConfig(3));
    expect(result.tripped).toBe(true);
  });

  it('does not trip at zero iterations', async () => {
    const breaker = new MaxIterationBreaker();
    const result = await breaker.check(createState(0), createConfig(3));
    expect(result.tripped).toBe(false);
  });

  it('rejects with ConfigurationError when maxIterations < 1', async () => {
    const breaker = new MaxIterationBreaker();
    await expect(breaker.check(createState(0), createConfig(0))).rejects.toThrow(
      ConfigurationError,
    );
  });

  it('rejects with ConfigurationError when maxIterations > 5', async () => {
    const breaker = new MaxIterationBreaker();
    await expect(breaker.check(createState(0), createConfig(6))).rejects.toThrow(
      ConfigurationError,
    );
  });
});
