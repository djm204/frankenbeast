import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLifecycleMetrics } from '../../../src/beasts/telemetry/beast-lifecycle-metrics.js';
import { ProcessSupervisor } from '../../../src/beasts/execution/process-supervisor.js';
import type { BeastRunStatus } from '../../../src/beasts/types.js';

describe('BeastLifecycleMetrics', () => {
  let workDir: string | undefined;
  let repository: SQLiteBeastRepository | undefined;

  afterEach(async () => {
    repository?.close();
    repository = undefined;
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it('aggregates real run records by definition and creation window', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-lifecycle-metrics-'));
    repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-25T00:05:00.000Z',
      status: 'completed',
      startedAt: '2026-07-25T00:05:01.000Z',
      finishedAt: '2026-07-25T00:05:02.000Z',
    });
    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-25T00:10:00.000Z',
      status: 'completed',
      startedAt: '2026-07-25T00:10:01.000Z',
      finishedAt: '2026-07-25T00:10:06.000Z',
      priorAttempts: [{
        status: 'failed',
        startedAt: '2026-07-25T00:08:00.000Z',
        finishedAt: '2026-07-25T00:08:03.000Z',
      }],
    });
    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-25T00:15:00.000Z',
      status: 'failed',
      startedAt: '2026-07-25T00:15:01.000Z',
      finishedAt: '2026-07-25T00:15:04.000Z',
    });
    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-25T00:20:00.000Z',
      status: 'stopped',
      startedAt: '2026-07-25T00:20:01.000Z',
      finishedAt: '2026-07-25T00:20:03.000Z',
    });
    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-25T00:25:00.000Z',
      status: 'running',
      startedAt: '2026-07-25T00:25:01.000Z',
    });
    createRun(repository, {
      definitionId: 'beta',
      createdAt: '2026-07-25T00:30:00.000Z',
      status: 'completed',
      startedAt: '2026-07-25T00:30:01.000Z',
      finishedAt: '2026-07-25T00:30:10.000Z',
    });
    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-24T23:59:00.000Z',
      status: 'completed',
      startedAt: '2026-07-24T23:59:01.000Z',
      finishedAt: '2026-07-24T23:59:02.000Z',
    });
    createRun(repository, {
      definitionId: 'alpha',
      createdAt: '2026-07-25T00:40:00.000Z',
      status: 'queued',
    });

    const metrics = new BeastLifecycleMetrics(window => repository!.listLifecycleAttempts(window));
    const result = metrics.query({
      from: '2026-07-25T00:00:00.000Z',
      to: '2026-07-25T01:00:00.000Z',
    });

    expect(result.definitions).toEqual([
      {
        definitionId: 'alpha',
        spawnCount: 6,
        spawnRatePerMinute: 6 / 60,
        completionCount: 2,
        failureCount: 2,
        stopCount: 1,
        activeCount: 1,
        completionRate: 2 / 6,
        failureRate: 2 / 6,
        stopRate: 1 / 6,
        runDurationMs: {
          count: 5,
          min: 1_000,
          p50: 3_000,
          p95: 5_000,
          max: 5_000,
        },
      },
      {
        definitionId: 'beta',
        spawnCount: 1,
        spawnRatePerMinute: 1 / 60,
        completionCount: 1,
        failureCount: 0,
        stopCount: 0,
        activeCount: 0,
        completionRate: 1,
        failureRate: 0,
        stopRate: 0,
        runDurationMs: {
          count: 1,
          min: 9_000,
          p50: 9_000,
          p95: 9_000,
          max: 9_000,
        },
      },
    ]);

    expect(metrics.query({
      from: '2026-07-25T00:05:01Z',
      to: '2026-07-25T00:05:02Z',
    }).definitions[0]?.spawnCount).toBe(1);
    expect(result.orphanedProcessCount).toBe(0);
  });

  it('rejects invalid or reversed query windows', () => {
    const metrics = new BeastLifecycleMetrics(() => []);

    expect(() => metrics.query({ from: 'not-a-date', to: '2026-07-25T01:00:00.000Z' }))
      .toThrow(/valid ISO timestamps/i);
    expect(() => metrics.query({ from: '07/25/2026', to: '2026-07-25T01:00:00.000Z' }))
      .toThrow(/valid ISO timestamps/i);
    expect(() => metrics.query({
      from: '2026-07-25T01:00:00.000Z',
      to: '2026-07-25T00:00:00.000Z',
    })).toThrow(/from must be before to/i);
  });

  it('increments the orphan counter only when a process group is actually swept', () => {
    const metrics = new BeastLifecycleMetrics(() => [], {
      now: () => '2026-07-25T00:30:00.000Z',
    });
    const noProcessGroup = Object.assign(new Error('no process group'), { code: 'ESRCH' });
    const supervisor = new ProcessSupervisor({
      orphanSweeper: {
        killProcess: vi.fn((pid: number) => {
          if (pid === -23456) throw noProcessGroup;
          return true as const;
        }),
      },
      onOrphanProcessSwept: () => metrics.recordOrphanProcessSwept(),
    });

    supervisor.sweepOrphanProcessGroup(12345);
    supervisor.sweepOrphanProcessGroup(23456);

    expect(metrics.query({
      from: '2026-07-25T00:00:00.000Z',
      to: '2026-07-25T01:00:00.000Z',
    }).orphanedProcessCount).toBe(1);
  });

  it('does not silently discard orphan sweeps from a selected window', () => {
    const metrics = new BeastLifecycleMetrics(() => [], {
      now: () => '2026-07-25T00:31:00.000Z',
    });
    for (let index = 0; index < 10_001; index += 1) {
      metrics.recordOrphanProcessSwept('2026-07-25T00:30:00.000Z');
    }

    expect(metrics.query({
      from: '2026-07-25T00:00:00.000Z',
      to: '2026-07-25T01:00:00.000Z',
    }).orphanedProcessCount).toBe(10_001);
  });

  it('evicts orphan sweep timestamps outside the configured retention window', () => {
    const metrics = new BeastLifecycleMetrics(() => [], {
      now: () => '2026-07-26T00:00:00.000Z',
      orphanRetentionMs: 60 * 60 * 1_000,
    });
    metrics.recordOrphanProcessSwept('2026-07-25T23:30:00.000Z');
    metrics.recordOrphanProcessSwept('2026-07-25T22:00:00.000Z');

    expect(metrics.query({
      from: '2026-07-25T00:00:00.000Z',
      to: '2026-07-26T00:00:01.000Z',
    }).orphanedProcessCount).toBe(1);
  });
});

function createRun(
  repository: SQLiteBeastRepository,
  input: {
    definitionId: string;
    createdAt: string;
    status: BeastRunStatus;
    startedAt?: string;
    finishedAt?: string;
    priorAttempts?: Array<{
      status: BeastRunStatus;
      startedAt: string;
      finishedAt: string;
    }>;
  },
): void {
  const run = repository.createRun({
    definitionId: input.definitionId,
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: {},
    dispatchedBy: 'api',
    dispatchedByUser: 'test',
    createdAt: input.createdAt,
  });
  for (const prior of input.priorAttempts ?? []) {
    const attempt = repository.createAttempt(run.id, {
      status: 'running',
      startedAt: prior.startedAt,
    });
    repository.updateAttempt(attempt.id, {
      status: prior.status,
      finishedAt: prior.finishedAt,
    });
  }
  if (input.startedAt) {
    const attempt = repository.createAttempt(run.id, {
      status: input.status,
      startedAt: input.startedAt,
    });
    if (input.finishedAt) {
      repository.updateAttempt(attempt.id, {
        status: input.status,
        finishedAt: input.finishedAt,
      });
    }
  }
}
