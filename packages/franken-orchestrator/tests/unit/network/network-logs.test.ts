import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
        {
          id: 'comms-gateway',
          pid: 101,
          dependsOn: ['chat-server'],
          startedAt: '2026-03-09T00:00:00.000Z',
          inProcess: true,
          hostServiceId: 'chat-server',
        },
      ],
    };

    await writeFile(join(workDir, 'chat-server.log'), 'chat line 1\nchat line 2\n');
    await writeFile(join(workDir, 'dashboard-web.log'), 'dashboard line 1\n');

    await expect(logs.resolve(state, 'chat-server')).resolves.toEqual(['chat line 1', 'chat line 2']);
    await expect(logs.resolve(state, 'comms-gateway')).resolves.toEqual(['chat line 1', 'chat line 2']);
    await expect(logs.resolve(state, 'all')).resolves.toEqual([
      'chat line 1',
      'chat line 2',
      'dashboard line 1',
    ]);
  });

  it('caps reads to the tail of large service logs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-logs-'));
    const logs = new NetworkLogStore(workDir);
    const logFile = join(workDir, 'chat-server.log');
    await writeFile(logFile, `${'old line\n'.repeat(10_000)}recent line\n`);

    const state: NetworkOperatorState = {
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [{ id: 'chat-server', pid: 101, dependsOn: [], startedAt: '2026-03-09T00:00:00.000Z', logFile }],
    };

    const resolved = await logs.resolve(state, 'chat-server');

    expect(resolved.at(-1)).toBe('recent line');
    expect(resolved.length).toBeLessThan(10_000);
  });
});
