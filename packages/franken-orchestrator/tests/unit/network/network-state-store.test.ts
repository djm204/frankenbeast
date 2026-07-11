import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
          detached: true,
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

  it('uses atomic temp-file replacement without leaving partial write artifacts', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-atomic-'));
    const statePath = join(workDir, 'network-state.json');
    const store = new NetworkStateStore(statePath);

    await writeFile(statePath, '{"mode":"old"}', 'utf-8');
    await store.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: false,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [],
    });

    const entries = await readdir(workDir);
    expect(entries).toEqual(['network-state.json']);
    await expect(readFile(statePath, 'utf-8')).resolves.toContain('"mode": "secure"');
  });

  it('quarantines truncated state JSON and degrades to absent state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-corrupt-'));
    const statePath = join(workDir, 'network-state.json');
    const store = new NetworkStateStore(statePath);
    await writeFile(statePath, '{"mode":"secure","services":[', 'utf-8');

    await expect(store.load()).resolves.toBeUndefined();

    const entries = await readdir(workDir);
    expect(entries.some((entry) => entry === 'network-state.json')).toBe(false);
    const quarantined = entries.filter((entry) => entry.startsWith('network-state.json.corrupt.'));
    expect(quarantined).toHaveLength(1);
    await expect(readFile(join(workDir, quarantined[0]!), 'utf-8')).resolves.toBe(
      '{"mode":"secure","services":[',
    );
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
