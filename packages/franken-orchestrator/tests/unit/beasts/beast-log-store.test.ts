import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';

const SAFE_RUN_ID = 'run_123e4567-e89b-42d3-a456-426614174000';
const SAFE_ATTEMPT_ID = 'attempt_123e4567-e89b-42d3-a456-426614174001';
const SAFE_OTHER_ATTEMPT_ID = 'attempt_123e4567-e89b-42d3-a456-426614174002';

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'franken-beast-log-store-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('BeastLogStore', () => {
  it('rejects path traversal identifiers before appending or reading logs', async () => {
    await withTempDir(async (dir) => {
      const logDir = join(dir, 'logs');
      const outsidePath = join(dir, 'outside.log');
      const store = new BeastLogStore(logDir);

      await expect(
        store.append('../outside', '../outside', 'stdout', 'escaped'),
      ).rejects.toThrow('Invalid Beast run identifier');
      await expect(store.read(SAFE_RUN_ID, '../outside')).rejects.toThrow(
        'Invalid Beast attempt identifier',
      );
      expect(existsSync(outsidePath)).toBe(false);
    });
  });

  it('accepts the persisted prefixed UUID identifiers for normal log access', async () => {
    await withTempDir(async (dir) => {
      const store = new BeastLogStore(dir);
      const runId = SAFE_RUN_ID;
      const attemptId = SAFE_ATTEMPT_ID;

      await store.append(runId, attemptId, 'stdout', 'hello');

      await expect(store.read(runId, attemptId)).resolves.toEqual([
        expect.stringContaining('"message":"hello"'),
      ]);
    });
  });

  it('appends line-oriented stream records and reads them back', async () => {
    await withTempDir(async (dir) => {
      const store = new BeastLogStore(dir);

      await store.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'hello');
      await store.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stderr', 'boom');

      await expect(store.read(SAFE_RUN_ID, SAFE_ATTEMPT_ID)).resolves.toEqual([
        expect.stringContaining('"stream":"stdout"'),
        expect.stringContaining('"stream":"stderr"'),
      ]);
    });
  });

  it('returns an empty log when the attempt has not written anything yet', async () => {
    await withTempDir(async (dir) => {
      const store = new BeastLogStore(dir);

      await expect(store.read(SAFE_RUN_ID, SAFE_OTHER_ATTEMPT_ID)).resolves.toEqual([]);
    });
  });

  it('rotates run output logs before appending past the configured active size cap', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 180, maxRotatedLogFiles: 2 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'first'.repeat(12), '2026-03-11T00:00:00.000Z');
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stderr', 'second'.repeat(12), '2026-03-11T00:00:01.000Z');

      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      const rotatedPath = `${activePath}.1`;
      expect(existsSync(rotatedPath)).toBe(true);
      expect(await readFile(rotatedPath, 'utf-8')).toContain('firstfirst');
      expect(await readFile(activePath, 'utf-8')).toContain('secondsecond');
      expect((await stat(activePath)).size).toBeLessThanOrEqual(180);
    });
  });

  it('reads retained rotated logs oldest-first before the active log', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 180, maxRotatedLogFiles: 2 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'first'.repeat(12), '2026-03-11T00:00:00.000Z');
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'second'.repeat(12), '2026-03-11T00:00:01.000Z');
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'third'.repeat(12), '2026-03-11T00:00:02.000Z');

      const records = await logs.read(SAFE_RUN_ID, SAFE_ATTEMPT_ID);
      expect(records).toHaveLength(3);
      expect(records[0]).toContain('firstfirst');
      expect(records[1]).toContain('secondsecond');
      expect(records[2]).toContain('thirdthird');
    });
  });

  it('reads all existing rotations even when the reader uses default retention', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(`${activePath}.4`, 'old-4\n');
      await writeFile(`${activePath}.10`, 'old-10\n');
      await writeFile(activePath, 'active\n');

      await expect(new BeastLogStore(dir).read(SAFE_RUN_ID, SAFE_ATTEMPT_ID)).resolves.toEqual([
        'old-10',
        'old-4',
        'active',
      ]);
    });
  });

  it('truncates oversized process-output messages so one noisy line cannot break the cap', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 260, maxRotatedLogFiles: 1 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'x'.repeat(5_000), '2026-03-11T00:00:00.000Z');

      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      const contents = await readFile(activePath, 'utf-8');
      const parsed = JSON.parse(contents.trim()) as { message: string; truncatedBytes: number };
      expect((await stat(activePath)).size).toBeLessThanOrEqual(260);
      expect(parsed.message).toContain('[truncated');
      expect(parsed.truncatedBytes).toBeGreaterThan(0);
    });
  });

  it('caps escaped oversized messages without an iterative event-loop stall', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 320, maxRotatedLogFiles: 1 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stderr', '\\'.repeat(20_000), '2026-03-11T00:00:00.000Z');

      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      const contents = await readFile(activePath, 'utf-8');
      const parsed = JSON.parse(contents.trim()) as { message: string; truncatedBytes: number };
      expect((await stat(activePath)).size).toBeLessThanOrEqual(320);
      expect(parsed.message).toContain('[truncated');
      expect(parsed.truncatedBytes).toBeGreaterThan(0);
    });
  });

  it('keeps the oversized-record fallback within the minimum cap', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 128, maxRotatedLogFiles: 1 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stderr', '\u0000'.repeat(10_000), '2026-03-11T00:00:00.000Z');

      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      const contents = await readFile(activePath, 'utf-8');
      const parsed = JSON.parse(contents.trim()) as { createdAt?: string; message: string };
      expect((await stat(activePath)).size).toBeLessThanOrEqual(128);
      expect(parsed).toMatchObject({
        createdAt: '2026-03-11T00:00:00.000Z',
        message: expect.stringContaining('[truncated]'),
      });
    });
  });

  it('serializes concurrent appends so active logs stay within the configured cap', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 260, maxRotatedLogFiles: 3 });

      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          logs.append(
            SAFE_RUN_ID,
            SAFE_ATTEMPT_ID,
            'stdout',
            `message-${i}-${'x'.repeat(80)}`,
            `2026-03-11T00:00:${String(i).padStart(2, '0')}.000Z`,
          ),
        ),
      );

      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(260);
    });
  });

  it('keeps only the configured number of rotated files', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 1 });
      for (let i = 0; i < 5; i += 1) {
        await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', `message-${i}-${'z'.repeat(60)}`, `2026-03-11T00:00:0${i}.000Z`);
      }

      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      expect(existsSync(`${activePath}.1`)).toBe(true);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(160);
    });
  });

  it('removes stale rotations above a lowered retention count', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.1`, 'old-1\n');
      await writeFile(`${activePath}.2`, 'old-2\n');
      await writeFile(`${activePath}.3`, 'old-3\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 1 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', `new-${'z'.repeat(80)}`, '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(true);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect(existsSync(`${activePath}.3`)).toBe(false);
    });
  });

  it('removes stale rotations when retention is disabled', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.1`, 'old-1\n');
      await writeFile(`${activePath}.2`, 'old-2\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 0 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', `new-${'z'.repeat(80)}`, '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(false);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(160);
    });
  });

  it('clamps negative rotated-file retention without deleting active or sibling logs', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      const siblingPath = join(dir, SAFE_RUN_ID, `${SAFE_OTHER_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(siblingPath, 'sibling\n');
      await writeFile(`${activePath}.1`, 'old-1\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 1_000, maxRotatedLogFiles: -1 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'small', '2026-03-11T00:00:01.000Z');

      expect(existsSync(activePath)).toBe(true);
      expect(await readFile(activePath, 'utf-8')).toContain('small');
      expect(await readFile(siblingPath, 'utf-8')).toBe('sibling\n');
      expect(existsSync(`${activePath}.1`)).toBe(false);
    });
  });

  it('truncates an already oversized active log instead of rotating it into retained evidence', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, 'legacy-unbounded-log\n'.repeat(50));

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 2 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'new-small-record', '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(false);
      expect(await readFile(activePath, 'utf-8')).toContain('new-small-record');
      expect((await stat(activePath)).size).toBeLessThanOrEqual(160);
    });
  });

  it('prunes stale rotations even when the active log stays below the size cap', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.1`, 'old-1\n');
      await writeFile(`${activePath}.2`, 'old-2\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 1_000, maxRotatedLogFiles: 0 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'small', '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(false);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(1_000);
    });
  });

  it('does not scan and prune stale rotations on every below-cap append', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.2`, 'old-2\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 1_000, maxRotatedLogFiles: 1 });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'first-small', '2026-03-11T00:00:01.000Z');
      expect(existsSync(`${activePath}.2`)).toBe(false);

      await writeFile(`${activePath}.2`, 'externally-recreated-stale-rotation\n');
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'second-small', '2026-03-11T00:00:02.000Z');

      expect(existsSync(`${activePath}.2`)).toBe(true);
    });
  });

  it('pages retained logs by offset across rotations in oldest-to-newest order', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(`${activePath}.2`, 'oldest\nolder\n');
      await writeFile(`${activePath}.1`, 'newer\n');
      await writeFile(activePath, 'newest\n');

      await expect(new BeastLogStore(dir).readPage(SAFE_RUN_ID, SAFE_ATTEMPT_ID, {
        offset: 1,
        limit: 2,
        maxBytes: 1_024,
      })).resolves.toEqual({
        lines: ['older', 'newer'],
        offset: 1,
        nextOffset: 3,
        hasMore: true,
        tail: false,
        bytes: Buffer.byteLength(JSON.stringify(['older', 'newer'])),
      });
    });
  });

  it('returns a bounded newest-first-selected tail in chronological order', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(`${activePath}.1`, 'oldest\nolder\n');
      await writeFile(activePath, 'newer\nnewest\n');

      await expect(new BeastLogStore(dir).readPage(SAFE_RUN_ID, SAFE_ATTEMPT_ID, {
        tail: true,
        limit: 2,
        maxBytes: 1_024,
      })).resolves.toEqual({
        lines: ['newer', 'newest'],
        offset: 0,
        nextOffset: 2,
        hasMore: true,
        tail: true,
        bytes: Buffer.byteLength(JSON.stringify(['newer', 'newest'])),
      });
    });
  });

  it('stops reverse-tail I/O before opening older files once bounds are satisfied', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await mkdir(`${activePath}.1`);
      await writeFile(activePath, 'newest\n');

      const page = await new BeastLogStore(dir).readPage(SAFE_RUN_ID, SAFE_ATTEMPT_ID, {
        tail: true,
        limit: 1,
        maxBytes: 1_024,
      });

      expect(page.lines).toEqual(['newest']);
      expect(page.hasMore).toBe(true);
    });
  });

  it('enforces the serialized logs-array budget', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${'x'.repeat(700)}\n${'y'.repeat(700)}\n`);

      const page = await new BeastLogStore(dir).readPage(SAFE_RUN_ID, SAFE_ATTEMPT_ID, {
        limit: 2,
        maxBytes: 1_024,
      });

      expect(page.lines).toHaveLength(1);
      expect(page.bytes).toBeLessThanOrEqual(1_024);
      expect(page.hasMore).toBe(true);
    });
  });

  it('represents an individually oversized line without stalling offset pagination', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${'x'.repeat(1_500)}\nafter\n`);

      const page = await new BeastLogStore(dir).readPage(SAFE_RUN_ID, SAFE_ATTEMPT_ID, {
        offset: 0,
        limit: 2,
        maxBytes: 1_024,
      });

      expect(page.lines).toEqual([
        '[log line omitted: 1500 bytes exceeds page budget]',
        'after',
      ]);
      expect(page.nextOffset).toBe(2);
      expect(page.bytes).toBeLessThanOrEqual(1_024);
    });
  });

  it('returns stable empty page metadata', async () => {
    await withTempDir(async (dir) => {
      await expect(new BeastLogStore(dir).readPage(SAFE_RUN_ID, SAFE_ATTEMPT_ID, {
        offset: 5,
        limit: 20,
        maxBytes: 1_024,
      })).resolves.toEqual({
        lines: [],
        offset: 5,
        nextOffset: 5,
        hasMore: false,
        tail: false,
        bytes: 2,
      });
    });
  });

  it('caps configured rotated-file retention to avoid unbounded rotation loops', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, SAFE_RUN_ID, `${SAFE_ATTEMPT_ID}.log`);
      await mkdir(join(dir, SAFE_RUN_ID), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active'.repeat(8), createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.99`, 'old-99\n');
      await writeFile(`${activePath}.100`, 'old-100\n');
      await writeFile(`${activePath}.101`, 'old-101\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: Number.MAX_SAFE_INTEGER });
      await logs.append(SAFE_RUN_ID, SAFE_ATTEMPT_ID, 'stdout', 'new'.repeat(30), '2026-03-11T00:00:01.000Z');

      expect(await readFile(`${activePath}.100`, 'utf-8')).toBe('old-99\n');
      expect(existsSync(`${activePath}.101`)).toBe(false);
    });
  });
});
