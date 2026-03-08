import { describe, it, expect } from 'vitest';
import { checkInjection } from '../../../src/breakers/injection-breaker.js';
import { checkBudget, BudgetExceededError } from '../../../src/breakers/budget-breaker.js';
import { checkCritiqueSpiral } from '../../../src/breakers/critique-spiral-breaker.js';

describe('injection-breaker', () => {
  it('does not halt on clean input', () => {
    const result = checkInjection({
      sanitizedText: 'hello',
      violations: [],
      blocked: false,
    });
    expect(result.halt).toBe(false);
  });

  it('halts on blocked input', () => {
    const result = checkInjection({
      sanitizedText: '',
      violations: [{ rule: 'injection', severity: 'block', detail: 'prompt injection' }],
      blocked: true,
    });
    expect(result.halt).toBe(true);
    expect(result.reason).toContain('prompt injection');
  });

  it('includes all violation details in reason', () => {
    const result = checkInjection({
      sanitizedText: '',
      violations: [
        { rule: 'injection', severity: 'block', detail: 'first' },
        { rule: 'pii', severity: 'block', detail: 'second' },
      ],
      blocked: true,
    });
    expect(result.reason).toContain('first');
    expect(result.reason).toContain('second');
  });
});

describe('budget-breaker', () => {
  it('does not halt under budget', () => {
    const result = checkBudget(
      { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01 },
      100_000,
    );
    expect(result.halt).toBe(false);
  });

  it('halts when over budget', () => {
    const result = checkBudget(
      { inputTokens: 60_000, outputTokens: 50_000, totalTokens: 110_000, estimatedCostUsd: 5.0 },
      100_000,
    );
    expect(result.halt).toBe(true);
    expect(result.reason).toContain('110000');
    expect(result.reason).toContain('100000');
  });

  it('does not halt at exact limit', () => {
    const result = checkBudget(
      { inputTokens: 50_000, outputTokens: 50_000, totalTokens: 100_000, estimatedCostUsd: 2.0 },
      100_000,
    );
    expect(result.halt).toBe(false);
  });

  it('BudgetExceededError stores spent and limit', () => {
    const err = new BudgetExceededError(150_000, 100_000);
    expect(err.spent).toBe(150_000);
    expect(err.limit).toBe(100_000);
    expect(err.name).toBe('BudgetExceededError');
  });
});

describe('critique-spiral-breaker', () => {
  it('does not halt before max iterations', () => {
    const result = checkCritiqueSpiral(1, 3, 0.5);
    expect(result.halt).toBe(false);
  });

  it('halts at max iterations', () => {
    const result = checkCritiqueSpiral(3, 3, 0.4);
    expect(result.halt).toBe(true);
    expect(result.reason).toContain('3 iterations');
    expect(result.reason).toContain('0.4');
  });

  it('halts beyond max iterations', () => {
    const result = checkCritiqueSpiral(5, 3, 0.2);
    expect(result.halt).toBe(true);
  });
});
