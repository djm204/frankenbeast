import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ISecretStore, SecretStoreDetection } from '../../../src/network/secret-store.js';
import type { OrchestratorConfig } from '../../../src/config/orchestrator-config.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { resolveBeastOperatorToken } from '../../../src/cli/run.js';

function createInMemoryStore(secrets: Record<string, string>): ISecretStore {
  const data = new Map(Object.entries(secrets));
  return {
    id: 'test',
    detect: async (): Promise<SecretStoreDetection> => ({ available: true }),
    store: async (key, value) => { data.set(key, value); },
    resolve: async (key) => data.get(key),
    delete: async (key) => { data.delete(key); },
    keys: async () => [...data.keys()],
  };
}

describe('resolveBeastOperatorToken', () => {
  const tempDirs: string[] = [];
  const envKeysToClean = [
    'FRANKENBEAST_BEAST_OPERATOR_TOKEN',
    'VITE_BEAST_OPERATOR_TOKEN',
  ];

  beforeEach(() => {
    for (const key of envKeysToClean) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeysToClean) {
      delete process.env[key];
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns the secret from the store when operatorTokenRef is configured', async () => {
    const store = createInMemoryStore({ 'beast-operator-key': 'secret-from-store' });
    const config = defaultConfig();
    config.network.operatorTokenRef = 'beast-operator-key';

    const token = await resolveBeastOperatorToken('/tmp/test-root', { secretStore: store, config });
    expect(token).toBe('secret-from-store');
  });

  it('returns undefined from store when key is not in store, then falls through to env var', async () => {
    process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN = 'env-fallback-token';
    const store = createInMemoryStore({}); // empty store
    const config = defaultConfig();
    config.network.operatorTokenRef = 'missing-key';

    const token = await resolveBeastOperatorToken('/tmp/test-root', { secretStore: store, config });
    expect(token).toBe('env-fallback-token');
  });

  it('skips secret store lookup when no operatorTokenRef is configured, uses env var', async () => {
    process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN = 'env-direct-token';
    const store = createInMemoryStore({ 'some-key': 'store-value' });
    const config = defaultConfig();
    // no operatorTokenRef set

    const token = await resolveBeastOperatorToken('/tmp/test-root', { secretStore: store, config });
    expect(token).toBe('env-direct-token');
  });

  it('falls back to env var when no secret store provided', async () => {
    process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN = 'env-only-token';

    const token = await resolveBeastOperatorToken('/tmp/test-root');
    expect(token).toBe('env-only-token');
  });

  it('is backward compatible: uses existing env var logic when no options given', async () => {
    process.env.VITE_BEAST_OPERATOR_TOKEN = 'vite-token';

    const token = await resolveBeastOperatorToken('/tmp/test-root');
    expect(token).toBe('vite-token');
  });

  it('falls back to root .env file when no env var and no secret store', async () => {
    const root = join(tmpdir(), `resolve-token-test-${Date.now()}`);
    tempDirs.push(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, '.env'), 'FRANKENBEAST_BEAST_OPERATOR_TOKEN=root-env-file-token\n');

    const token = await resolveBeastOperatorToken(root);
    expect(token).toBe('root-env-file-token');
  });

  it('falls back to franken-web .env.local when root .env has no token and no secret store', async () => {
    const root = join(tmpdir(), `resolve-token-test-${Date.now()}-web`);
    tempDirs.push(root);
    mkdirSync(join(root, 'packages', 'franken-web'), { recursive: true });
    writeFileSync(join(root, '.env'), 'SOME_OTHER_VAR=value\n');
    writeFileSync(
      join(root, 'packages', 'franken-web', '.env.local'),
      'VITE_BEAST_OPERATOR_TOKEN=web-file-token\n',
    );

    const token = await resolveBeastOperatorToken(root);
    expect(token).toBe('web-file-token');
  });

  it('secret store takes precedence over env vars', async () => {
    process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN = 'env-token-should-be-skipped';
    const store = createInMemoryStore({ 'my-op-ref': 'store-wins' });
    const config = defaultConfig();
    config.network.operatorTokenRef = 'my-op-ref';

    const token = await resolveBeastOperatorToken('/tmp/test-root', { secretStore: store, config });
    expect(token).toBe('store-wins');
  });

  it('returns undefined when nothing is configured', async () => {
    const root = join(tmpdir(), `resolve-token-test-${Date.now()}-empty`);
    tempDirs.push(root);
    mkdirSync(root, { recursive: true });

    const token = await resolveBeastOperatorToken(root);
    expect(token).toBeUndefined();
  });
});
