import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';

describe('BeastLogStore', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('appends line-oriented stream records and reads them back', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-logs-'));
    const store = new BeastLogStore(join(workDir, 'logs'));

    await store.append('run-1', 'attempt-1', 'stdout', 'hello');
    await store.append('run-1', 'attempt-1', 'stderr', 'boom');

    await expect(store.read('run-1', 'attempt-1')).resolves.toEqual([
      expect.stringContaining('"stream":"stdout"'),
      expect.stringContaining('"stream":"stderr"'),
    ]);
  });

  it('returns an empty log when the attempt has not written anything yet', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-logs-'));
    const store = new BeastLogStore(join(workDir, 'logs'));

    await expect(store.read('run-1', 'attempt-404')).resolves.toEqual([]);
  });
});
