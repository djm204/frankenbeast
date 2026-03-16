import { describe, it, expect } from 'vitest';
import { estimateTokens, getContextHealth } from './token-estimator';

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 characters', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('getContextHealth', () => {
  it('returns good for small content', () => {
    expect(getContextHealth(1000)).toBe('good');
  });

  it('returns warning for medium content', () => {
    expect(getContextHealth(8000)).toBe('warning');
  });

  it('returns critical for large content', () => {
    expect(getContextHealth(20000)).toBe('critical');
  });
});
