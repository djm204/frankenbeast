import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  getContextHealth,
  GOOD_CONTEXT_TOKEN_LIMIT,
  TOKEN_ESTIMATION_CHARS_PER_TOKEN,
  WARNING_CONTEXT_TOKEN_LIMIT,
} from './token-estimator';

const EXACT_ESTIMATE_TOKEN_COUNT = 100;
const ESTIMATED_TEXT_LENGTH = EXACT_ESTIMATE_TOKEN_COUNT * TOKEN_ESTIMATION_CHARS_PER_TOKEN;
const GOOD_CONTEXT_SAMPLE_TOKENS = GOOD_CONTEXT_TOKEN_LIMIT / 4;
const WARNING_CONTEXT_SAMPLE_TOKENS = WARNING_CONTEXT_TOKEN_LIMIT / 2;
const CRITICAL_CONTEXT_SAMPLE_TOKENS = WARNING_CONTEXT_TOKEN_LIMIT + GOOD_CONTEXT_TOKEN_LIMIT;

describe('estimateTokens', () => {
  it('estimates text using the configured characters-per-token ratio', () => {
    const text = 'a'.repeat(ESTIMATED_TEXT_LENGTH);
    expect(estimateTokens(text)).toBe(EXACT_ESTIMATE_TOKEN_COUNT);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('getContextHealth', () => {
  it('returns good for content below the good limit', () => {
    expect(getContextHealth(GOOD_CONTEXT_SAMPLE_TOKENS)).toBe('good');
  });

  it('returns warning for content below the warning limit', () => {
    expect(getContextHealth(WARNING_CONTEXT_SAMPLE_TOKENS)).toBe('warning');
  });

  it('returns critical for content at or above the warning limit', () => {
    expect(getContextHealth(CRITICAL_CONTEXT_SAMPLE_TOKENS)).toBe('critical');
  });
});
