import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startNetworkService } from '../../../src/network/network-supervisor-runtime.js';
import type { ResolvedNetworkService } from '../../../src/network/network-registry.js';
import { createChatApp } from '../../../src/http/chat-app.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

vi.mock('../../../src/network/network-supervisor-runtime.js', () => ({
  startNetworkService: vi.fn(async () => ({ pid: 12345 })),
  stopNetworkService: vi.fn(async () => undefined),
  healthcheckNetworkService: vi.fn(async () => true),
  preflightNetworkService: vi.fn(async () => ({ action: 'start' })),
}));

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/network-routes');

describe('network routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
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

  it('passes the effective operator token into dashboard launches', async () => {
    mkdirSync(TMP, { recursive: true });
    const config = defaultConfig();
    const app = createChatApp({
      sessionStoreDir: join(TMP, 'chat'),
      llm: { complete: vi.fn().mockResolvedValue('hello') },
      projectName: 'network-project',
      operatorToken: 'effective-token',
      networkControl: {
        root: TMP,
        frankenbeastDir: TMP,
        configFile: join(TMP, 'config.json'),
        getConfig: () => config,
        setConfig: vi.fn(),
      },
    });

    const response = await app.request('/v1/network/start', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer effective-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: 'dashboard-web' }),
    });

    expect(response.status).toBe(200);
    const startedServices = vi.mocked(startNetworkService).mock.calls
      .map(([service]) => service as ResolvedNetworkService);
    const dashboard = startedServices.find((service) => service.id === 'dashboard-web');
    expect(dashboard?.runtimeConfig.process?.env?.FRANKENBEAST_BEAST_OPERATOR_TOKEN)
      .toBe('effective-token');
  });
});
