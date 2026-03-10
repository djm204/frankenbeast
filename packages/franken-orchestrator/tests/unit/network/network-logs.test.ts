import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NetworkLogStore } from '../../../src/network/network-logs.js';
import type { NetworkOperatorState } from '../../../src/network/network-state-store.js';

describe('NetworkLogStore', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('registers deterministic log files per service', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-logs-'));
    const logs = new NetworkLogStore(workDir);

    await expect(logs.register('chat-server')).resolves.toBe(join(workDir, 'chat-server.log'));
  });

  it('resolves log sources for a single service or all services', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-logs-'));
    const logs = new NetworkLogStore(workDir);
    const state: NetworkOperatorState = {
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 101,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          logFile: join(workDir, 'chat-server.log'),
        },
        {
          id: 'dashboard-web',
          pid: 102,
          dependsOn: ['chat-server'],
          startedAt: '2026-03-09T00:00:00.000Z',
          logFile: join(workDir, 'dashboard-web.log'),
        },
      ],
    };

    expect(logs.resolve(state, 'chat-server')).toEqual([join(workDir, 'chat-server.log')]);
    expect(logs.resolve(state, 'all')).toEqual([
      join(workDir, 'chat-server.log'),
      join(workDir, 'dashboard-web.log'),
    ]);
  });
});
