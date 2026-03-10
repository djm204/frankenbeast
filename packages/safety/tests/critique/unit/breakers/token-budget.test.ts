import { describe, it, expect, vi } from 'vitest';
import { TokenBudgetBreaker } from '../../../../src/critique/breakers/token-budget.js';
import type { ObservabilityPort } from '../../../../src/critique/types/contracts.js';
import type { LoopState, LoopConfig } from '../../../../src/critique/types/loop.js';

function createState(iterationCount: number): LoopState {
  return { iterationCount, iterations: [], failureHistory: new Map() };
}

function createConfig(tokenBudget: number): LoopConfig {
  return {
    maxIterations: 3,
    tokenBudget,
    consensusThreshold: 3,
    sessionId: 'test-session',
    taskId: 'test-task',
  };
}

function createMockObservabilityPort(totalTokens: number): ObservabilityPort {
  return {
    getTokenSpend: vi.fn().mockResolvedValue({
      inputTokens: Math.floor(totalTokens * 0.6),
      outputTokens: Math.floor(totalTokens * 0.4),
      totalTokens,
      estimatedCostUsd: totalTokens * 0.00001,
    }),
  };
}

describe('TokenBudgetBreaker', () => {
  it('implements CircuitBreaker interface', () => {
    const port = createMockObservabilityPort(0);
    const breaker = new TokenBudgetBreaker(port);
    expect(breaker.name).toBe('token-budget');
    expect(typeof breaker.check).toBe('function');
  });

  it('does not trip when under budget', async () => {
    const port = createMockObservabilityPort(5000);
    const breaker = new TokenBudgetBreaker(port);
    const result = await breaker.checkAsync(createState(1), createConfig(10000));
    expect(result.tripped).toBe(false);
  });

  it('trips when over budget', async () => {
    const port = createMockObservabilityPort(15000);
    const breaker = new TokenBudgetBreaker(port);
    const result = await breaker.checkAsync(createState(1), createConfig(10000));
    expect(result.tripped).toBe(true);
    if (result.tripped) {
      expect(result.action).toBe('halt');
      expect(result.reason).toContain('Token budget');
    }
  });

  it('trips when exactly at budget', async () => {
    const port = createMockObservabilityPort(10000);
    const breaker = new TokenBudgetBreaker(port);
    const result = await breaker.checkAsync(createState(1), createConfig(10000));
    expect(result.tripped).toBe(true);
  });

  it('calls getTokenSpend with correct sessionId', async () => {
    const port = createMockObservabilityPort(0);
    const breaker = new TokenBudgetBreaker(port);
    await breaker.checkAsync(createState(0), createConfig(10000));
    expect(port.getTokenSpend).toHaveBeenCalledWith('test-session');
  });
});
