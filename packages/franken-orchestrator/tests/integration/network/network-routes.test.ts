import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
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
});
