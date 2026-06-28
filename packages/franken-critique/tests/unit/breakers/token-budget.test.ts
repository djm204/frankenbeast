import { describe, it, expect, vi } from 'vitest';
import { TokenBudgetBreaker } from '../../../src/breakers/token-budget.js';
import type { ObservabilityPort } from '../../../src/types/contracts.js';
import type { LoopState, LoopConfig } from '../../../src/types/loop.js';

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
    const result = await breaker.check(createState(1), createConfig(10000));
    expect(result.tripped).toBe(false);
  });

  it('trips when over budget', async () => {
    const port = createMockObservabilityPort(15000);
    const breaker = new TokenBudgetBreaker(port);
    const result = await breaker.check(createState(1), createConfig(10000));
    expect(result.tripped).toBe(true);
    if (result.tripped) {
      expect(result.action).toBe('halt');
      expect(result.reason).toContain('Token budget');
    }
  });

  it('trips when exactly at budget', async () => {
    const port = createMockObservabilityPort(10000);
    const breaker = new TokenBudgetBreaker(port);
    const result = await breaker.check(createState(1), createConfig(10000));
    expect(result.tripped).toBe(true);
  });

  it('calls getTokenSpend with correct sessionId', async () => {
    const port = createMockObservabilityPort(0);
    const breaker = new TokenBudgetBreaker(port);
    await breaker.check(createState(0), createConfig(10000));
    expect(port.getTokenSpend).toHaveBeenCalledWith('test-session');
  });

  it('check() enforces the budget instead of being a no-op (regression for #60)', async () => {
    // Previously check() unconditionally returned { tripped: false } and the
    // real logic lived in an unreachable checkAsync().
    const breaker = new TokenBudgetBreaker(createMockObservabilityPort(15000));
    const result = await breaker.check(createState(1), createConfig(10000));
    expect(result.tripped).toBe(true);
  });

  it('runs in both the pre and post iteration phases', () => {
    // Spend accrues during an iteration, so the breaker must re-check after work.
    const breaker = new TokenBudgetBreaker(createMockObservabilityPort(0));
    expect(breaker.phase).toBe('both');
  });

  describe('cost budget (USD)', () => {
    it('trips on estimatedCostUsd, not token count, when costBudgetUsd is set', async () => {
      // 1,500,000 tokens at $0.00001/token = $15.00 estimated cost, over the $10 budget.
      const breaker = new TokenBudgetBreaker(createMockObservabilityPort(1_500_000));
      const result = await breaker.check(createState(1), {
        ...createConfig(Number.POSITIVE_INFINITY),
        costBudgetUsd: 10,
      });
      expect(result.tripped).toBe(true);
      if (result.tripped) {
        expect(result.action).toBe('halt');
        expect(result.reason).toContain('Cost budget');
      }
    });

    it('does not trip when spend exactly equals the budget (matches observer CircuitBreaker `>`)', async () => {
      // 1,000,000 tokens at $0.00001/token = exactly $10.00. The observer cost
      // breaker treats equality as within budget; the critique breaker must too.
      const breaker = new TokenBudgetBreaker(createMockObservabilityPort(1_000_000));
      const result = await breaker.check(createState(1), {
        ...createConfig(Number.POSITIVE_INFINITY),
        costBudgetUsd: 10,
      });
      expect(result.tripped).toBe(false);
    });

    it('does not halt a zero-dollar budget before any spend', async () => {
      // Regression for the P3: with `>=`, a $0 budget halted at $0 spend before
      // any critique work could run.
      const breaker = new TokenBudgetBreaker(createMockObservabilityPort(0));
      const result = await breaker.check(createState(1), {
        ...createConfig(Number.POSITIVE_INFINITY),
        costBudgetUsd: 0,
      });
      expect(result.tripped).toBe(false);
    });

    it('does not trip a small token count even when the budget is a dollar value (regression: CLI $ budget vs tokens)', async () => {
      // Regression for the P1: with the CLI `--budget 10` ($10) the loop used to
      // halt after just 10 tokens. With cost-based enforcement, 50 tokens
      // (~$0.0005) is far under $10 and must not trip.
      const breaker = new TokenBudgetBreaker(createMockObservabilityPort(50));
      const result = await breaker.check(createState(1), {
        ...createConfig(Number.POSITIVE_INFINITY),
        costBudgetUsd: 10,
      });
      expect(result.tripped).toBe(false);
    });
  });
});
