import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from '../src/app';

describe('resolveBaseUrl', () => {
  it('uses the current origin for same-origin backend/proxy requests', () => {
    expect(resolveBaseUrl('http://localhost:4173')).toBe('http://localhost:4173');
  });

  it('uses window.location.origin by default in browser tests', () => {
    expect(resolveBaseUrl()).toBe(window.location.origin);
  });
});
