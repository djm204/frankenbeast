import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';

describe('BeastRunService', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('stops a running beast and preserves the durable run row', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          const attempt = repo.createAttempt(run.id, {
            status: 'running',
            pid: 999,
            startedAt: '2026-03-10T00:01:00.000Z',
            executorMetadata: { backend: 'process' },
          });
          repo.appendEvent(run.id, {
            attemptId: attempt.id,
            type: 'attempt.started',
            payload: { pid: 999 },
            createdAt: '2026-03-10T00:01:00.000Z',
          });
          return attempt;
        }),
        stop: vi.fn(async (runId: string, attemptId: string) => {
          const updatedAttempt = repo.updateAttempt(attemptId, {
            status: 'stopped',
            finishedAt: '2026-03-10T00:02:00.000Z',
            stopReason: 'operator_stop',
          });
          repo.updateRun(runId, {
            status: 'stopped',
            finishedAt: '2026-03-10T00:02:00.000Z',
            stopReason: 'operator_stop',
          });
          return updatedAttempt;
        }),
        kill: vi.fn(),
      },
      container: {
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
      },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Implement the stop control',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
      startNow: true,
    });

    const stopped = await runs.stop(run.id, 'pfk');

    expect(stopped.status).toBe('stopped');
    expect(runs.getRun(run.id)).toMatchObject({ id: run.id, status: 'stopped' });
    expect(metrics.render()).toContain('beast_run_stops_total{definition_id="martin-loop"} 1');
  });
});
