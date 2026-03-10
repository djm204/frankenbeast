import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';

describe('BeastDispatchService', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('creates a run with an immutable config snapshot and records metrics', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async () => repo.createAttempt('placeholder', { status: 'running' })),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: {
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
      },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);

    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Implement the dispatch panel',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
    });

    expect(run.dispatchedBy).toBe('dashboard');
    expect(run.configSnapshot).toEqual({
      provider: 'claude',
      objective: 'Implement the dispatch panel',
    });
    expect(metrics.render()).toContain('beast_runs_created_total{definition_id="martin-loop",source="dashboard"} 1');
  });
});
