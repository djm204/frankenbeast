import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BrainHealthScorer,
  DEFAULT_BRAIN_HEALTH_WEIGHTS,
  calculateBrainHealthScore,
  type BrainHealthSignals,
} from './brain-health.js';
import { SQLiteAdapter } from './adapters/sqlite/SQLiteAdapter.js';

const HEALTHY_SIGNALS: BrainHealthSignals = {
  taskSuccessRate: 1,
  cacheHitRatio: 1,
  compactionPressure: 0,
  churnRatio: 0,
  resourcePressure: 0,
  budgetBurnRatio: 0,
};

describe('calculateBrainHealthScore', () => {
  it('returns the documented 0–100 endpoints for healthy and degraded signals', () => {
    expect(calculateBrainHealthScore(HEALTHY_SIGNALS)).toBe(100);
    expect(calculateBrainHealthScore({
      taskSuccessRate: 0,
      cacheHitRatio: 0,
      compactionPressure: 1,
      churnRatio: 1,
      resourcePressure: 1,
      budgetBurnRatio: 1,
    })).toBe(0);
  });

  it.each([
    ['task success', { taskSuccessRate: 0 }],
    ['cache efficiency', { cacheHitRatio: 0 }],
    ['compaction pressure', { compactionPressure: 1 }],
    ['lifecycle churn', { churnRatio: 1 }],
    ['resource pressure', { resourcePressure: 1 }],
    ['budget burn', { budgetBurnRatio: 1 }],
  ] as const)('moves lower when only %s degrades', (_name, degraded) => {
    expect(calculateBrainHealthScore({ ...HEALTHY_SIGNALS, ...degraded }))
      .toBeLessThan(calculateBrainHealthScore(HEALTHY_SIGNALS));
  });

  it('uses replaceable weights that must be finite, non-negative, and sum to one', () => {
    expect(calculateBrainHealthScore(
      { ...HEALTHY_SIGNALS, taskSuccessRate: 0 },
      {
        taskSuccessRate: 0.5,
        cacheHitRatio: 0.1,
        compactionPressure: 0.1,
        churnRatio: 0.1,
        resourcePressure: 0.05,
        budgetBurnRatio: 0.15,
      },
    )).toBe(50);

    expect(() => calculateBrainHealthScore(HEALTHY_SIGNALS, {
      ...DEFAULT_BRAIN_HEALTH_WEIGHTS,
      taskSuccessRate: 0.31,
    })).toThrow('sum to 1');
  });

  it('rejects signal values outside the normalized range', () => {
    expect(() => calculateBrainHealthScore({ ...HEALTHY_SIGNALS, churnRatio: 1.01 }))
      .toThrow('churnRatio must be between 0 and 1');
  });
});

describe('BrainHealthScorer', () => {
  it('computes on demand and persists latest and ranged history by brain id', async () => {
    const adapter = new SQLiteAdapter(':memory:', { useWorkerThread: false });
    const scorer = new BrainHealthScorer(adapter);

    const healthy = await scorer.computeAndPersist('brain-a', HEALTHY_SIGNALS, 1_000);
    const degradedSignals = { ...HEALTHY_SIGNALS, churnRatio: 1 };
    const degraded = await scorer.computeAndPersist('brain-a', degradedSignals, 2_000);
    await scorer.computeAndPersist('brain-b', HEALTHY_SIGNALS, 1_500);

    expect(healthy.score).toBe(100);
    expect(degraded.score).toBeLessThan(healthy.score);
    await expect(scorer.getHealthScore('brain-a')).resolves.toEqual(degraded);
    await expect(scorer.getHealthHistory('brain-a', { since: 1_000, before: 2_000 }))
      .resolves.toEqual([degraded, healthy]);
    await expect(scorer.getHealthHistory('brain-a', { since: 1_001, before: 1_999 }))
      .resolves.toEqual([]);

    const widerWindow = { brainId: 'brain-b', since: 0 };
    await expect(scorer.getHealthHistory('brain-a', widerWindow))
      .resolves.toEqual([degraded, healthy]);

    await adapter.close();
  });

  it('supports explicit retention pruning without deleting recent health scores', async () => {
    const adapter = new SQLiteAdapter(':memory:', { useWorkerThread: false });
    const scorer = new BrainHealthScorer(adapter);
    await scorer.computeAndPersist('brain-a', HEALTHY_SIGNALS, 1_000);
    await scorer.computeAndPersist('brain-a', HEALTHY_SIGNALS, 2_000);

    await expect(adapter.deleteHealthScoresBefore(1_500)).resolves.toBe(1);
    await expect(scorer.getHealthHistory('brain-a')).resolves.toEqual([
      expect.objectContaining({ timestamp: 2_000 }),
    ]);

    await adapter.close();
  });

  it('survives adapter restart through the worker-backed SQLite path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brain-health-'));
    const dbPath = join(dir, 'observer.db');
    try {
      const writer = new SQLiteAdapter(dbPath);
      const recorded = await new BrainHealthScorer(writer)
        .computeAndPersist('definition-42', HEALTHY_SIGNALS, 3_000);
      await writer.close();

      const reader = new SQLiteAdapter(dbPath);
      await expect(new BrainHealthScorer(reader).getHealthScore('definition-42'))
        .resolves.toEqual(recorded);
      await expect(new BrainHealthScorer(reader).getHealthScore('missing'))
        .resolves.toBeNull();
      await reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
