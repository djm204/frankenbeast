import { describe, expect, it, vi } from 'vitest';
import { loadBeastOperatorToken, type EnvLoader } from '../vite-env';

const ROOT = '/repo';
const PKG = '/repo/packages/franken-web';

/** Build a loader that returns a different env map per directory. */
function loaderFor(byDir: Record<string, Record<string, string>>): EnvLoader {
  return vi.fn((_mode: string, dir: string) => byDir[dir] ?? {});
}

describe('loadBeastOperatorToken', () => {
  it('reads FRANKENBEAST_BEAST_OPERATOR_TOKEN from the repo-root env file', () => {
    // Regression: the package-dir-only load missed the documented root .env.
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: {},
    });
    expect(loadBeastOperatorToken(load, 'production', ROOT, PKG)).toBe('root-token');
  });

  it('falls back to a package-level VITE_BEAST_OPERATOR_TOKEN override', () => {
    const load = loaderFor({
      [ROOT]: {},
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'web-token' },
    });
    expect(loadBeastOperatorToken(load, 'production', ROOT, PKG)).toBe('web-token');
  });

  it('prefers the root FRANKENBEAST token when both are present', () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'web-token' },
    });
    expect(loadBeastOperatorToken(load, 'production', ROOT, PKG)).toBe('root-token');
  });

  it('returns an empty string when no token is configured anywhere', () => {
    const load = loaderFor({ [ROOT]: {}, [PKG]: {} });
    expect(loadBeastOperatorToken(load, 'production', ROOT, PKG)).toBe('');
  });
});
