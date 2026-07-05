import { describe, expect, it, vi } from 'vitest';
import { assertSecureProxyTarget, loadProxyOperatorToken, type EnvLoader } from '../vite-env';

const ROOT = '/repo';
const PKG = '/repo/packages/franken-web';

/** Build a loader that returns a different env map per directory. */
function loaderFor(byDir: Record<string, Record<string, string>>): EnvLoader {
  return vi.fn((_mode: string, dir: string) => byDir[dir] ?? {});
}

const noSecretStoreToken = async () => '';

describe('assertSecureProxyTarget', () => {
  it('allows HTTPS proxy targets', () => {
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'https://api.example.com')).not.toThrow();
  });

  it('allows loopback HTTP targets for local development only', () => {
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'http://127.0.0.1:3737')).not.toThrow();
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'http://localhost:3737')).not.toThrow();
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'http://[::1]:3737')).not.toThrow();
  });

  it('rejects non-loopback plain HTTP proxy targets', () => {
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'http://internal-service')).toThrow(/https:\/\//);
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'http://127.attacker.example:3737')).toThrow(/https:\/\//);
    expect(() => assertSecureProxyTarget('VITE_API_PROXY_TARGET', 'http://0.0.0.0:3737')).toThrow(/https:\/\//);
  });
});

describe('loadProxyOperatorToken', () => {
  it('reads FRANKENBEAST_BEAST_OPERATOR_TOKEN from the repo-root env file for the server proxy', async () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: {},
    });
    await expect(loadProxyOperatorToken(load, 'production', ROOT, PKG, noSecretStoreToken)).resolves.toBe('root-token');
  });

  it('prefers the configured secret-store token when present', async () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: {},
    });
    await expect(
      loadProxyOperatorToken(load, 'production', ROOT, PKG, async () => 'secret-store-token'),
    ).resolves.toBe('secret-store-token');
  });

  it('passes the active config path to the secret-store resolver', async () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_CONFIG_FILE: '/tmp/custom-frankenbeast.json' },
      [PKG]: {},
    });
    const resolveFromSecretStore = vi.fn(async () => 'secret-store-token');

    await expect(
      loadProxyOperatorToken(load, 'production', ROOT, PKG, resolveFromSecretStore),
    ).resolves.toBe('secret-store-token');
    expect(resolveFromSecretStore).toHaveBeenCalledWith(ROOT, '/tmp/custom-frankenbeast.json');
  });

  it('fails closed when browser-exposed VITE_BEAST_OPERATOR_TOKEN is set in package env', async () => {
    const load = loaderFor({
      [ROOT]: {},
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'web-token' },
    });
    await expect(loadProxyOperatorToken(load, 'production', ROOT, PKG, noSecretStoreToken)).rejects.toThrow(/must not be set/);
  });

  it('fails closed when browser-exposed VITE_BEAST_OPERATOR_TOKEN is set in repo-root env', async () => {
    const load = loaderFor({
      [ROOT]: { VITE_BEAST_OPERATOR_TOKEN: 'root-web-token' },
      [PKG]: {},
    });
    await expect(loadProxyOperatorToken(load, 'production', ROOT, PKG, noSecretStoreToken)).rejects.toThrow(/must not be set/);
  });

  it('rejects stale VITE tokens even when the server-side token is present', async () => {
    const load = loaderFor({
      [ROOT]: { FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'root-token' },
      [PKG]: { VITE_BEAST_OPERATOR_TOKEN: 'web-token' },
    });
    await expect(loadProxyOperatorToken(load, 'production', ROOT, PKG, noSecretStoreToken)).rejects.toThrow(/must not be set/);
  });

  it('returns an empty string when no server-side token is configured', async () => {
    const load = loaderFor({ [ROOT]: {}, [PKG]: {} });
    await expect(loadProxyOperatorToken(load, 'production', ROOT, PKG, noSecretStoreToken)).resolves.toBe('');
  });
});
