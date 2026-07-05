import { describe, expect, it, vi } from 'vitest';
import {
  assertNoBundledOperatorTokenEnv,
  loadServerSideOperatorToken,
  shouldAttachOperatorAuth,
  type EnvLoader,
} from '../vite-env';

const ROOT = '/repo';
const PKG = '/repo/packages/franken-web';

function loaderFor(byDir: Record<string, Record<string, string>>): EnvLoader {
  return vi.fn((_mode: string, dir: string) => byDir[dir] ?? {});
}

describe('assertNoBundledOperatorTokenEnv', () => {
  it('allows non-browser operator token env because it is not VITE-prefixed', () => {
    expect(() => assertNoBundledOperatorTokenEnv({
      FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'server-side-token',
    })).not.toThrow();
  });

  it('rejects VITE_BEAST_OPERATOR_TOKEN because Vite bundles VITE-prefixed env', () => {
    expect(() => assertNoBundledOperatorTokenEnv({
      VITE_BEAST_OPERATOR_TOKEN: 'browser-token',
    })).toThrow(/VITE_\* variables are bundled into browser code/);
  });

  it('ignores empty VITE_BEAST_OPERATOR_TOKEN values', () => {
    expect(() => assertNoBundledOperatorTokenEnv({
      VITE_BEAST_OPERATOR_TOKEN: '   ',
    })).not.toThrow();
  });
});

describe('loadServerSideOperatorToken', () => {
  it('reads FRANKENBEAST_BEAST_OPERATOR_TOKEN from the repo-root env file', () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: {},
    });
    expect(loadServerSideOperatorToken(load, 'production', ROOT, PKG)).toBe('root-token');
  });

  it('allows package-level server-side overrides without accepting VITE tokens', () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'package-token' },
    });
    expect(loadServerSideOperatorToken(load, 'production', ROOT, PKG)).toBe('package-token');
  });

  it('does not use VITE_BEAST_OPERATOR_TOKEN as a fallback source', () => {
    const load = loaderFor({
      [ROOT]: {},
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'browser-token' },
    });
    expect(loadServerSideOperatorToken(load, 'production', ROOT, PKG)).toBe('');
  });
});

describe('shouldAttachOperatorAuth', () => {
  it('allows same-origin browser requests', () => {
    expect(shouldAttachOperatorAuth({
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      'sec-fetch-site': 'same-origin',
    })).toBe(true);
  });

  it('rejects cross-site browser requests before injecting auth', () => {
    expect(shouldAttachOperatorAuth({
      host: '127.0.0.1:5173',
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
    })).toBe(false);
  });

  it('rejects unverifiable non-browser proxy traffic without Origin or Fetch Metadata', () => {
    expect(shouldAttachOperatorAuth({ host: '127.0.0.1:5173' })).toBe(false);
  });
});
