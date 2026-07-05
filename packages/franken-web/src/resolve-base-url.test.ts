import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from './lib/resolve-base-url';

describe('resolveBaseUrl', () => {
  it('uses same-origin dashboard URL by default', () => {
    expect(resolveBaseUrl('http://localhost:5173', '')).toBe('http://localhost:5173');
  });

  it('uses the configured production API URL when building static dashboard assets', () => {
    expect(resolveBaseUrl('http://localhost:5173', 'http://127.0.0.1:3737')).toBe('http://127.0.0.1:3737');
  });

  it('strips trailing slashes from configured API URLs before clients append paths', () => {
    expect(resolveBaseUrl('http://localhost:5173', 'http://127.0.0.1:3737/')).toBe('http://127.0.0.1:3737');
  });
});
