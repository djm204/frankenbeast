import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NetworkStateStore, type NetworkOperatorState } from '../../../src/network/network-state-store.js';

describe('NetworkStateStore', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('saves and loads operator state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-'));
    const store = new NetworkStateStore(join(workDir, 'network-state.json'));
    const state: NetworkOperatorState = {
      mode: 'insecure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 101,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          logFile: '/tmp/chat.log',
          url: 'http://127.0.0.1:3000',
        },
      ],
    };

    await store.save(state);

    await expect(store.load()).resolves.toEqual(state);
  });

  it('clears persisted state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-'));
    const store = new NetworkStateStore(join(workDir, 'network-state.json'));

    await store.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [],
    });
    await store.clear();

    await expect(store.load()).resolves.toBeUndefined();
  });
});
