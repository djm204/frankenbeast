import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NetworkStateStore, type NetworkOperatorState } from '../../../src/network/network-state-store.js';

const corruptFixtureUrl = (name: string): URL => new URL(`./fixtures/corrupt-state/${name}`, import.meta.url);

async function readCorruptFixture(name: string): Promise<string> {
  return readFile(corruptFixtureUrl(name), 'utf-8');
}

describe('NetworkStateStore', () => {
  let workDir: string | undefined;

  const validState = (): NetworkOperatorState => ({
    mode: 'secure',
    secureBackend: 'local-encrypted',
    detached: false,
    startedAt: '2026-03-09T00:00:00.000Z',
    services: [
      {
        id: 'chat-server',
        pid: 101,
        detached: true,
        dependsOn: [],
        startedAt: '2026-03-09T00:00:00.000Z',
        status: 'started',
        logFile: '/tmp/chat.log',
        url: 'http://127.0.0.1:3000',
      },
    ],
  });

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('saves and loads operator state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-'));
    const store = new NetworkStateStore(join(workDir, 'network-state.json'));
    const state = validState();

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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const payload = await readCorruptFixture('truncated-json.json');
    await writeFile(statePath, payload, 'utf-8');

    await expect(store.load()).resolves.toBeUndefined();
    expect(store.listCorruptions()).toEqual([
      expect.objectContaining({
        path: statePath,
        reason: expect.stringMatching(/json|unexpected|unterminated/i),
        repairHint: expect.stringContaining('Inspect the quarantined network-state file'),
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('corrupt network state'));

    const entries = await readdir(workDir);
    expect(entries.some((entry) => entry === 'network-state.json')).toBe(false);
    const quarantined = entries.filter((entry) => entry.startsWith('network-state.json.corrupt.'));
    expect(quarantined).toHaveLength(1);
    await expect(readFile(join(workDir, quarantined[0]!), 'utf-8')).resolves.toBe(payload);
    warn.mockRestore();
  });

  it.each([
    ['wrong top-level type', 'wrong-top-level-type.json', /json object/i],
    ['missing required fields', 'missing-required-fields.json', /secureBackend/i],
    ['duplicate service ids', 'duplicate-service-ids.json', /duplicate service id/i],
    ['unknown schema version', 'unknown-schema-version.json', /schemaVersion is unsupported/i],
    ['invalid enum values', 'invalid-enum-values.json', /mode must be/i],
    ['malformed behavioral optional fields', 'malformed-in-process.json', /inProcess must be a boolean/i],
  ])('quarantines corrupt-state fixture: %s', async (_name, fixtureName, reasonPattern) => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-fixture-'));
    const statePath = join(workDir, 'network-state.json');
    const store = new NetworkStateStore(statePath);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const payload = await readCorruptFixture(fixtureName);
    await writeFile(statePath, payload, 'utf-8');

    await expect(store.load()).resolves.toBeUndefined();

    const [diagnostic] = store.listCorruptions();
    expect(diagnostic).toMatchObject({
      path: statePath,
      reason: expect.stringMatching(reasonPattern),
      repairHint: expect.stringContaining('recover any still-running services manually'),
    });
    expect(diagnostic!.quarantinePath).toBeTruthy();
    expect(await readFile(diagnostic!.quarantinePath!, 'utf-8')).toBe(payload);
    await expect(readFile(statePath, 'utf-8')).rejects.toThrow();

    warn.mockRestore();
  });

  it('does not automatically repair corrupt state by writing replacement state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-state-no-repair-'));
    const statePath = join(workDir, 'network-state.json');
    const store = new NetworkStateStore(statePath);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await writeFile(statePath, JSON.stringify({ ...validState(), mode: 'unknown' }), 'utf-8');

    await expect(store.load()).resolves.toBeUndefined();

    const entries = await readdir(workDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^network-state\.json\.corrupt\./);
    expect(store.listCorruptions()[0]!.repairHint).toContain('do not edit live state in place');

    warn.mockRestore();
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
