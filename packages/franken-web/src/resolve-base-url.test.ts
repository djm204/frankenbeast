import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from './lib/resolve-base-url';

describe('resolveBaseUrl', () => {
  it('uses same-origin dashboard URL by default', () => {
    expect(resolveBaseUrl('http://localhost:5173', '')).toBe('http://localhost:5173');
  });

  it('ignores configured production API URLs so static builds use the same-origin proxy', () => {
    expect(resolveBaseUrl('http://localhost:5173', 'http://127.0.0.1:3737')).toBe('http://localhost:5173');
  });

  it('keeps same-origin behavior even when configured API URLs have trailing slashes', () => {
    expect(resolveBaseUrl('http://localhost:5173', 'http://127.0.0.1:3737/')).toBe('http://localhost:5173');
  });
});
