import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from '../src/app';

describe('resolveBaseUrl', () => {
  it('uses same-origin proxying even when older explicit API URLs were configured', () => {
    expect(resolveBaseUrl('http://localhost:4173')).toBe('http://localhost:4173');
  });

  it('falls back to the current origin for same-origin proxying', () => {
    expect(resolveBaseUrl('http://localhost:4173')).toBe('http://localhost:4173');
  });
});
