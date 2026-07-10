import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatApp } from '../../../src/http/chat-app.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/network-routes');

describe('network routes', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('serves status and persists config updates', async () => {
    mkdirSync(TMP, { recursive: true });
    let config = defaultConfig();
    const app = createChatApp({
      sessionStoreDir: join(TMP, 'chat'),
      llm: { complete: vi.fn().mockResolvedValue('hello') },
      projectName: 'network-project',
      networkControl: {
        root: TMP,
        frankenbeastDir: TMP,
        configFile: join(TMP, 'config.json'),
        getConfig: () => config,
        setConfig: (nextConfig) => {
          config = nextConfig;
        },
      },
    });

    const status = await app.request('/v1/network/status');
    expect(status.status).toBe(200);

    const update = await app.request('/v1/network/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: ['network.mode=insecure'] }),
    });
    expect(update.status).toBe(200);

    const configResponse = await app.request('/v1/network/config');
    const body = await configResponse.json() as { data: { network: { mode: string } } };
    expect(body.data.network.mode).toBe('insecure');
  });

  it.each(['start', 'stop', 'restart'] as const)(
    'returns 400 for unknown network service target on %s',
    async (action) => {
      mkdirSync(TMP, { recursive: true });
      let config = defaultConfig();
      const app = createChatApp({
        sessionStoreDir: join(TMP, 'chat'),
        llm: { complete: vi.fn().mockResolvedValue('hello') },
        projectName: 'network-project',
        networkControl: {
          root: TMP,
          frankenbeastDir: TMP,
          configFile: join(TMP, 'config.json'),
          getConfig: () => config,
          setConfig: (nextConfig) => {
            config = nextConfig;
          },
        },
      });

      const response = await app.request(`/v1/network/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'not-a-service' }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'UNKNOWN_NETWORK_SERVICE_TARGET',
          message: 'Unknown network service target: not-a-service',
        },
      });
    },
  );

  it('preserves already-approved provider command overrides when persisting config updates', async () => {
    mkdirSync(TMP, { recursive: true });
    const configFile = join(TMP, 'config.json');
    let config = defaultConfig();
    config = {
      ...config,
      providers: {
        ...config.providers,
        overrides: {
          trusted: {
            command: '/usr/local/bin/trusted-provider',
            trustCommandOverride: true,
            trustedCommandPaths: ['/usr/local/bin'],
          },
        },
      },
    };

    const app = createChatApp({
      sessionStoreDir: join(TMP, 'chat'),
      llm: { complete: vi.fn().mockResolvedValue('hello') },
      projectName: 'network-project',
      networkControl: {
        root: TMP,
        frankenbeastDir: TMP,
        configFile,
        getConfig: () => config,
        setConfig: (nextConfig) => {
          config = nextConfig;
        },
      },
    });

    const update = await app.request('/v1/network/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: ['network.mode=insecure'] }),
    });
    expect(update.status).toBe(200);
    expect(config.network.mode).toBe('insecure');
    expect(config.providers.overrides['trusted']).toMatchObject({
      command: '/usr/local/bin/trusted-provider',
      trustCommandOverride: true,
      trustedCommandPaths: ['/usr/local/bin'],
    });
    const persisted = JSON.parse(readFileSync(configFile, 'utf8')) as typeof config;
    expect(persisted.providers.overrides['trusted']).toMatchObject({
      command: '/usr/local/bin/trusted-provider',
      trustCommandOverride: true,
      trustedCommandPaths: ['/usr/local/bin'],
    });
  });
});
