import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../../src/beasts/events/beast-log-store.js';
import { BeastRunService } from '../../../../src/beasts/services/beast-run-service.js';
import { BeastCatalogService } from '../../../../src/beasts/services/beast-catalog-service.js';
import { SQLiteBeastRepository } from '../../../../src/beasts/repository/sqlite-beast-repository.js';
import type { BeastExecutors } from '../../../../src/beasts/services/beast-dispatch-service.js';
import type { BeastMetrics } from '../../../../src/beasts/telemetry/beast-metrics.js';

describe('BeastRunService.notifyRunStatusChange', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('exposes notifyRunStatusChange as a public method', () => {
    const service = Object.create(BeastRunService.prototype);
    expect(typeof service.notifyRunStatusChange).toBe('function');
  });

  it('syncs tracked agent status when run has trackedAgentId', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-run-svc-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const catalog = new BeastCatalogService();
    const mockExecutors = {
      process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    } as unknown as BeastExecutors;
    const mockMetrics = {
      recordRunStopped: vi.fn(),
    } as unknown as BeastMetrics;

    const service = new BeastRunService(repo, catalog, mockExecutors, mockMetrics, logs);

    // Create a tracked agent and a run linked to it
    const now = new Date().toISOString();
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'cli',
      status: 'running',
      createdByUser: 'pfk',
      initAction: { kind: 'dispatch', definitionId: 'martin-loop' },
      initConfig: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' },
      createdAt: now,
      updatedAt: now,
    });

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: new Date().toISOString(),
      trackedAgentId: agent.id,
    });

    // Simulate that the run has completed
    repo.updateRun(run.id, { status: 'completed', finishedAt: new Date().toISOString() });

    // Call notifyRunStatusChange
    service.notifyRunStatusChange(run.id);

    // The tracked agent status should now be synced
    const updatedAgent = repo.getTrackedAgent(agent.id);
    expect(updatedAgent!.status).toBe('completed');
  });

  it('does nothing for unknown runId', () => {
    const service = Object.create(BeastRunService.prototype);
    // Should not throw for unknown run
    const repo = { getRun: vi.fn(() => undefined) };
    Object.assign(service, { repository: repo });
    expect(() => service.notifyRunStatusChange('unknown-id')).not.toThrow();
  });
});
