import { describe, it, expect } from 'vitest';
import { makeTokenSpend } from './token.js';

describe('makeTokenSpend (issue #58)', () => {
  it('computes totalTokens from the parts rather than trusting a supplied total', () => {
    const spend = makeTokenSpend(100, 50, 0.01);
    expect(spend).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCostUsd: 0.01,
    });
  });

  it('accepts zero tokens and zero cost', () => {
    expect(() => makeTokenSpend(0, 0, 0)).not.toThrow();
  });

  it('throws on negative inputTokens', () => {
    expect(() => makeTokenSpend(-1, 0, 0)).toThrow(RangeError);
  });

  it('throws on negative outputTokens', () => {
    expect(() => makeTokenSpend(0, -5, 0)).toThrow(RangeError);
  });

  it('throws on non-integer token counts', () => {
    expect(() => makeTokenSpend(1.5, 0, 0)).toThrow(RangeError);
  });

  it('throws on negative cost', () => {
    expect(() => makeTokenSpend(1, 1, -0.01)).toThrow(RangeError);
  });

  it('throws on non-finite cost (NaN / Infinity)', () => {
    expect(() => makeTokenSpend(1, 1, Number.NaN)).toThrow(RangeError);
    expect(() => makeTokenSpend(1, 1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('throws when inputTokens + outputTokens would exceed the safe-integer range', () => {
    expect(() => makeTokenSpend(Number.MAX_SAFE_INTEGER, 1, 0)).toThrow(RangeError);
  });
});
