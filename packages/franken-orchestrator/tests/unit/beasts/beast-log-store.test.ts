import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'franken-beast-log-store-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('BeastLogStore', () => {
  it('appends line-oriented stream records and reads them back', async () => {
    await withTempDir(async (dir) => {
      const store = new BeastLogStore(dir);

      await store.append('run-1', 'attempt-1', 'stdout', 'hello');
      await store.append('run-1', 'attempt-1', 'stderr', 'boom');

      await expect(store.read('run-1', 'attempt-1')).resolves.toEqual([
        expect.stringContaining('"stream":"stdout"'),
        expect.stringContaining('"stream":"stderr"'),
      ]);
    });
  });

  it('returns an empty log when the attempt has not written anything yet', async () => {
    await withTempDir(async (dir) => {
      const store = new BeastLogStore(dir);

      await expect(store.read('run-1', 'attempt-404')).resolves.toEqual([]);
    });
  });

  it('rotates run output logs before appending past the configured active size cap', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 180, maxRotatedLogFiles: 2 });
      await logs.append('run-1', 'attempt-1', 'stdout', 'first'.repeat(12), '2026-03-11T00:00:00.000Z');
      await logs.append('run-1', 'attempt-1', 'stderr', 'second'.repeat(12), '2026-03-11T00:00:01.000Z');

      const activePath = join(dir, 'run-1', 'attempt-1.log');
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
      await logs.append('run-rotated', 'attempt-1', 'stdout', 'first'.repeat(12), '2026-03-11T00:00:00.000Z');
      await logs.append('run-rotated', 'attempt-1', 'stdout', 'second'.repeat(12), '2026-03-11T00:00:01.000Z');
      await logs.append('run-rotated', 'attempt-1', 'stdout', 'third'.repeat(12), '2026-03-11T00:00:02.000Z');

      const records = await logs.read('run-rotated', 'attempt-1');
      expect(records).toHaveLength(3);
      expect(records[0]).toContain('firstfirst');
      expect(records[1]).toContain('secondsecond');
      expect(records[2]).toContain('thirdthird');
    });
  });

  it('truncates oversized process-output messages so one noisy line cannot break the cap', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 260, maxRotatedLogFiles: 1 });
      await logs.append('run-2', 'attempt-1', 'stdout', 'x'.repeat(5_000), '2026-03-11T00:00:00.000Z');

      const activePath = join(dir, 'run-2', 'attempt-1.log');
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
      await logs.append('run-escaped', 'attempt-1', 'stderr', '\\'.repeat(20_000), '2026-03-11T00:00:00.000Z');

      const activePath = join(dir, 'run-escaped', 'attempt-1.log');
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
      await logs.append('run-minimum', 'attempt-1', 'stderr', '\u0000'.repeat(10_000), '2026-03-11T00:00:00.000Z');

      const activePath = join(dir, 'run-minimum', 'attempt-1.log');
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
            'run-concurrent',
            'attempt-1',
            'stdout',
            `message-${i}-${'x'.repeat(80)}`,
            `2026-03-11T00:00:${String(i).padStart(2, '0')}.000Z`,
          ),
        ),
      );

      const activePath = join(dir, 'run-concurrent', 'attempt-1.log');
      expect((await stat(activePath)).size).toBeLessThanOrEqual(260);
    });
  });

  it('keeps only the configured number of rotated files', async () => {
    await withTempDir(async (dir) => {
      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 1 });
      for (let i = 0; i < 5; i += 1) {
        await logs.append('run-3', 'attempt-1', 'stdout', `message-${i}-${'z'.repeat(60)}`, `2026-03-11T00:00:0${i}.000Z`);
      }

      const activePath = join(dir, 'run-3', 'attempt-1.log');
      expect(existsSync(`${activePath}.1`)).toBe(true);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(160);
    });
  });

  it('removes stale rotations above a lowered retention count', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, 'run-stale', 'attempt-1.log');
      await mkdir(join(dir, 'run-stale'), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.1`, 'old-1\n');
      await writeFile(`${activePath}.2`, 'old-2\n');
      await writeFile(`${activePath}.3`, 'old-3\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 1 });
      await logs.append('run-stale', 'attempt-1', 'stdout', `new-${'z'.repeat(80)}`, '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(true);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect(existsSync(`${activePath}.3`)).toBe(false);
    });
  });

  it('removes stale rotations when retention is disabled', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, 'run-no-retention', 'attempt-1.log');
      await mkdir(join(dir, 'run-no-retention'), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.1`, 'old-1\n');
      await writeFile(`${activePath}.2`, 'old-2\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 0 });
      await logs.append('run-no-retention', 'attempt-1', 'stdout', `new-${'z'.repeat(80)}`, '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(false);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(160);
    });
  });

  it('truncates an already oversized active log instead of rotating it into retained evidence', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, 'run-oversized-existing', 'attempt-1.log');
      await mkdir(join(dir, 'run-oversized-existing'), { recursive: true });
      await writeFile(activePath, 'legacy-unbounded-log\n'.repeat(50));

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: 2 });
      await logs.append('run-oversized-existing', 'attempt-1', 'stdout', 'new-small-record', '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(false);
      expect(await readFile(activePath, 'utf-8')).toContain('new-small-record');
      expect((await stat(activePath)).size).toBeLessThanOrEqual(160);
    });
  });

  it('prunes stale rotations even when the active log stays below the size cap', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, 'run-prune-without-rotation', 'attempt-1.log');
      await mkdir(join(dir, 'run-prune-without-rotation'), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active', createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.1`, 'old-1\n');
      await writeFile(`${activePath}.2`, 'old-2\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 1_000, maxRotatedLogFiles: 0 });
      await logs.append('run-prune-without-rotation', 'attempt-1', 'stdout', 'small', '2026-03-11T00:00:01.000Z');

      expect(existsSync(`${activePath}.1`)).toBe(false);
      expect(existsSync(`${activePath}.2`)).toBe(false);
      expect((await stat(activePath)).size).toBeLessThanOrEqual(1_000);
    });
  });

  it('caps configured rotated-file retention to avoid unbounded rotation loops', async () => {
    await withTempDir(async (dir) => {
      const activePath = join(dir, 'run-capped-retention', 'attempt-1.log');
      await mkdir(join(dir, 'run-capped-retention'), { recursive: true });
      await writeFile(activePath, `${JSON.stringify({ stream: 'stdout', message: 'active'.repeat(8), createdAt: '2026-03-11T00:00:00.000Z' })}\n`);
      await writeFile(`${activePath}.99`, 'old-99\n');
      await writeFile(`${activePath}.100`, 'old-100\n');
      await writeFile(`${activePath}.101`, 'old-101\n');

      const logs = new BeastLogStore(dir, { maxLogFileBytes: 160, maxRotatedLogFiles: Number.MAX_SAFE_INTEGER });
      await logs.append('run-capped-retention', 'attempt-1', 'stdout', 'new'.repeat(30), '2026-03-11T00:00:01.000Z');

      expect(await readFile(`${activePath}.100`, 'utf-8')).toBe('old-99\n');
      expect(existsSync(`${activePath}.101`)).toBe(false);
    });
  });
});
