import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from '../src/app';

describe('resolveBaseUrl', () => {
  it('prefers an explicit API URL when provided', () => {
    expect(resolveBaseUrl('http://127.0.0.1:4242', 'http://localhost:4173')).toBe('http://127.0.0.1:4242');
  });

  it('ignores a blank explicit API URL and falls back to same-origin proxying', () => {
    expect(resolveBaseUrl('   ', 'http://localhost:4173')).toBe('http://localhost:4173');
  });

  it('falls back to the current origin for same-origin proxying', () => {
    expect(resolveBaseUrl(undefined, 'http://localhost:4173')).toBe('http://localhost:4173');
  });
});
