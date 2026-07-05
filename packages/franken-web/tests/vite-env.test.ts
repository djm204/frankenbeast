import { describe, expect, it, vi } from 'vitest';
import { loadProxyOperatorToken, type EnvLoader } from '../vite-env';

const ROOT = '/repo';
const PKG = '/repo/packages/franken-web';

/** Build a loader that returns a different env map per directory. */
function loaderFor(byDir: Record<string, Record<string, string>>): EnvLoader {
  return vi.fn((_mode: string, dir: string) => byDir[dir] ?? {});
}

describe('loadProxyOperatorToken', () => {
  it('reads FRANKENBEAST_BEAST_OPERATOR_TOKEN from the repo-root env file for the server proxy', () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: {},
    });
    expect(loadProxyOperatorToken(load, 'production', ROOT, PKG)).toBe('root-token');
  });

  it('fails closed when browser-exposed VITE_BEAST_OPERATOR_TOKEN is set', () => {
    const load = loaderFor({
      [ROOT]: {},
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'web-token' },
    });
    expect(() => loadProxyOperatorToken(load, 'production', ROOT, PKG)).toThrow(/must not be set/);
  });

  it('rejects stale VITE tokens even when the server-side token is present', () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'web-token' },
    });
    expect(() => loadProxyOperatorToken(load, 'production', ROOT, PKG)).toThrow(/must not be set/);
  });

  it('returns an empty string when no server-side token is configured', () => {
    const load = loaderFor({ [ROOT]: {}, [PKG]: {} });
    expect(loadProxyOperatorToken(load, 'production', ROOT, PKG)).toBe('');
  });
});
