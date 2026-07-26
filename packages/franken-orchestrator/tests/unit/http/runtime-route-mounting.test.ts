import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatApp } from '../../../src/http/chat-app.js';
import { createDefaultRuntimeAdapterRegistry } from '../../../src/runtime/index.js';

const dirs: string[] = [];

afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('smart-swarm route composition', () => {
  it('mounts the default runtime registry behind operator authentication', async () => {
    const sessionStoreDir = mkdtempSync(join(tmpdir(), 'runtime-route-mount-'));
    dirs.push(sessionStoreDir);
    const app = createChatApp({
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'runtime-route-test',
      operatorToken: 'operator-secret',
      runtimeRegistry: createDefaultRuntimeAdapterRegistry({ env: {} }),
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
      ],
    });
  });
});
