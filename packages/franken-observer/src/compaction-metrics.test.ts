import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteAdapter } from './adapters/sqlite/SQLiteAdapter.js';
import { CompactionMetrics } from './compaction-metrics.js';
import { TraceContext } from './core/TraceContext.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('CompactionMetrics', () => {
  it('persists and queries a session compaction record through SQLite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'compaction-metrics-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'), { useWorkerThread: false });
    const metrics = new CompactionMetrics(adapter);

    await metrics.record({
      sessionId: 'chunk-session-1',
      runId: 'run-1',
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 900,
      tokensAfter: 120,
      timestamp: 1_750_000_000_000,
    });

    await expect(metrics.query('chunk-session-1')).resolves.toEqual([
      {
        sessionId: 'chunk-session-1',
        runId: 'run-1',
        generation: 1,
        triggerReason: 'threshold',
        tokensBefore: 900,
        tokensAfter: 120,
        timestamp: 1_750_000_000_000,
      },
    ]);

    await adapter.close();
  });

  it('keeps identically numbered generations from separate runs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'compaction-run-identity-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'), { useWorkerThread: false });
    const metrics = new CompactionMetrics(adapter);

    for (const [runId, timestamp] of [['run-1', 100], ['run-2', 200]] as const) {
      await metrics.record({
        sessionId: 'seeded-session',
        runId,
        generation: 1,
        triggerReason: 'threshold',
        tokensBefore: 900,
        tokensAfter: 120,
        timestamp,
      });
    }

    await expect(metrics.query('seeded-session')).resolves.toEqual([
      expect.objectContaining({ runId: 'run-2', generation: 1 }),
      expect.objectContaining({ runId: 'run-1', generation: 1 }),
    ]);
    await adapter.close();
  });

  it('prunes expired compaction events even when they have no retained trace row', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'compaction-orphan-retention-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'), { useWorkerThread: false });
    const metrics = new CompactionMetrics(adapter);
    const now = 1_750_000_000_000;
    const retentionMs = 24 * 60 * 60 * 1_000;

    await metrics.record({
      sessionId: 'orphaned-session',
      runId: 'orphaned-run',
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 900,
      tokensAfter: 120,
      timestamp: now - retentionMs - 1,
    });
    await metrics.record({
      sessionId: 'active-session',
      runId: 'active-run',
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 900,
      tokensAfter: 120,
      timestamp: now,
    });

    await expect(metrics.query('orphaned-session')).resolves.toEqual([]);
    await adapter.close();
  });

  it('calculates a windowed compaction rate without hydrating event payloads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'compaction-rate-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'), { useWorkerThread: false });
    const metrics = new CompactionMetrics(adapter);
    const now = 1_750_000_000_000;

    for (const [generation, timestamp] of [[1, now - 3_600_001], [2, now - 1_000], [3, now], [4, now + 1]] as const) {
      await metrics.record({
        sessionId: 'chunk-session-rate',
        runId: 'run-rate',
        generation,
        triggerReason: 'threshold',
        tokensBefore: 900,
        tokensAfter: 120,
        timestamp,
      });
    }

    await expect(metrics.compactionRate('chunk-session-rate', 3_600_000, now)).resolves.toEqual({
      count: 2,
      windowMs: 3_600_000,
      perHour: 2,
      latestAt: now,
    });

    await adapter.close();
  });

  it('removes compaction telemetry when its retained trace run is deleted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'compaction-retention-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'), { useWorkerThread: false });
    const metrics = new CompactionMetrics(adapter);
    const trace = TraceContext.createTrace('retained run');
    await adapter.flush(trace);
    await metrics.record({
      sessionId: 'chunk-session-retention',
      runId: trace.id,
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 900,
      tokensAfter: 120,
      timestamp: 1_750_000_000_000,
    });

    await adapter.deleteTrace(trace.id);

    await expect(metrics.query('chunk-session-retention')).resolves.toEqual([]);
    await adapter.close();
  });
});
