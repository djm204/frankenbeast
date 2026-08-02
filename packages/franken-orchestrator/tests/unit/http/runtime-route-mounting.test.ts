import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatApp } from '../../../src/http/chat-app.js';
import { createDefaultRuntimeAdapterRegistry } from '../../../src/runtime/index.js';

const dirs: string[] = [];

afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

describe('smart-swarm route composition', () => {
  it('mounts the default read-only runtime registry behind operator authentication', async () => {
    const sessionStoreDir = mkdtempSync(join(tmpdir(), 'runtime-route-mount-'));
    dirs.push(sessionStoreDir);
    const app = createChatApp({
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'runtime-route-test',
      operatorToken: 'operator-secret',
      runtimeRegistry: createDefaultRuntimeAdapterRegistry({ env: { PATH: '' } }),
    });

    expect((await app.request('/v1/smart-swarm/providers')).status).toBe(401);
    const response = await app.request('/v1/smart-swarm/providers', {
      headers: { authorization: 'Bearer operator-secret' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({ id: 'hermes', health: expect.objectContaining({ state: 'unavailable' }) }),
        expect.objectContaining({ id: 'ollama', health: expect.objectContaining({ state: 'unavailable' }) }),
        expect.objectContaining({ id: 'codex', health: expect.objectContaining({ state: 'unavailable' }) }),
      ],
    });
  });

  it('forwards the configured network egress policy to the default Ollama adapter', async () => {
    vi.stubEnv('OLLAMA_HOST', 'https://ollama.invalid');
    const sessionStoreDir = mkdtempSync(join(tmpdir(), 'runtime-route-egress-'));
    dirs.push(sessionStoreDir);
    const app = createChatApp({
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'runtime-route-test',
      operatorToken: 'operator-secret',
      networkControl: {
        root: sessionStoreDir,
        frankenbeastDir: sessionStoreDir,
        configFile: join(sessionStoreDir, 'config.json'),
        getConfig: () => ({ network: { egressPolicy: { enabled: false } } }) as never,
        setConfig: vi.fn(),
      },
    });

    const response = await app.request('/v1/smart-swarm/providers/ollama/snapshot', {
      headers: { authorization: 'Bearer operator-secret' },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: { workspaces: { data: Array<{ metadata: { diagnostic: string } }> } };
    };
    expect(body.data.workspaces.data[0]?.metadata.diagnostic).toBe('Ollama endpoint request failed');
  });

  it('reads the current network egress policy when the default Ollama adapter polls', async () => {
    vi.stubEnv('OLLAMA_HOST', 'https://ollama.invalid');
    const sessionStoreDir = mkdtempSync(join(tmpdir(), 'runtime-route-live-egress-'));
    dirs.push(sessionStoreDir);
    let egressPolicy = { enabled: false };
    const app = createChatApp({
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'runtime-route-test',
      operatorToken: 'operator-secret',
      networkControl: {
        root: sessionStoreDir,
        frankenbeastDir: sessionStoreDir,
        configFile: join(sessionStoreDir, 'config.json'),
        getConfig: () => ({ network: { egressPolicy } }) as never,
        setConfig: vi.fn(),
      },
    });
    egressPolicy = { enabled: true };

    const response = await app.request('/v1/smart-swarm/providers/ollama/snapshot', {
      headers: { authorization: 'Bearer operator-secret' },
    });
    const body = await response.json() as {
      data: { workspaces: { data: Array<{ metadata: { diagnostic: string } }> } };
    };

    expect(body.data.workspaces.data[0]?.metadata.diagnostic).toBe('Ollama endpoint blocked by egress policy');
  });
});
