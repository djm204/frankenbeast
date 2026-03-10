import { describe, it, expect } from 'vitest';
import { TokenBudget } from '../../../src/types/token-budget.js';

describe('TokenBudget', () => {
  it('remaining() returns budget minus used', () => {
    const b = new TokenBudget(1000, 300);
    expect(b.remaining()).toBe(700);
  });

  it('remaining() is 0 when used equals budget', () => {
    const b = new TokenBudget(500, 500);
    expect(b.remaining()).toBe(0);
  });

  it('isExhausted() returns false when used < budget', () => {
    const b = new TokenBudget(1000, 999);
    expect(b.isExhausted()).toBe(false);
  });

  it('isExhausted() returns true when used >= budget', () => {
    expect(new TokenBudget(100, 100).isExhausted()).toBe(true);
    expect(new TokenBudget(100, 150).isExhausted()).toBe(true);
  });

  it('isPressured() returns true when used > 85% of budget', () => {
    expect(new TokenBudget(1000, 851).isPressured()).toBe(true);
    expect(new TokenBudget(1000, 850).isPressured()).toBe(false);
  });

  it('add() returns a new TokenBudget with increased used count', () => {
    const b = new TokenBudget(1000, 200);
    const b2 = b.add(100);
    expect(b2.remaining()).toBe(700);
    expect(b.remaining()).toBe(800); // original unchanged
  });

  it('throws when budget is not a positive integer', () => {
    expect(() => new TokenBudget(0, 0)).toThrow();
    expect(() => new TokenBudget(-1, 0)).toThrow();
  });

  it('throws when used is negative', () => {
    expect(() => new TokenBudget(100, -1)).toThrow();
  });
});
