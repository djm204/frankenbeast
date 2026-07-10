import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';

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
        chunkDirectory: 'docs/chunks',
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

  it('keeps tracked agent lifecycle in sync with the linked run', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const agents = new AgentService(repo, () => '2026-03-11T00:00:00.000Z');
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
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Keep lifecycle in sync',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Keep lifecycle in sync',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Keep lifecycle in sync',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    expect(repo.getTrackedAgent(agent.id)?.status).toBe('running');

    await runs.stop(run.id, 'operator');

    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'stopped',
      dispatchRunId: run.id,
    });
  });

  it('stops queued linked runs even when no attempt has started yet', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const agents = new AgentService(repo, () => '2026-03-11T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(),
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
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Stop queued work',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Stop queued work',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Stop queued work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });

    const stopped = await runs.stop(run.id, 'operator');

    expect(stopped.status).toBe('stopped');
    expect(stopped.currentAttemptId).toBeUndefined();
    expect(repo.getTrackedAgent(agent.id)?.status).toBe('stopped');
    expect(metrics.render()).toContain('beast_run_stops_total{definition_id="martin-loop"} 1');
  });

  it('resumes a stopped linked run as a new attempt and syncs the tracked agent back to running', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const agents = new AgentService(repo, () => '2026-03-11T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          const attempt = repo.createAttempt(run.id, {
            status: 'running',
            pid: 1000 + (repo.getRun(run.id)?.attemptCount ?? 0),
            startedAt: '2026-03-10T00:03:00.000Z',
            executorMetadata: { backend: 'process' },
          });
          repo.appendEvent(run.id, {
            attemptId: attempt.id,
            type: 'attempt.started',
            payload: { pid: attempt.pid },
            createdAt: '2026-03-10T00:03:00.000Z',
          });
          return attempt;
        }),
        stop: vi.fn(async (runId: string, attemptId: string) => {
          const updatedAttempt = repo.updateAttempt(attemptId, {
            status: 'stopped',
            finishedAt: '2026-03-10T00:04:00.000Z',
            stopReason: 'operator_stop',
          });
          repo.updateRun(runId, {
            status: 'stopped',
            finishedAt: '2026-03-10T00:04:00.000Z',
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
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Resume the stopped run',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Resume the stopped run',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Resume the stopped run',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    await runs.stop(run.id, 'operator');
    const resumed = await runs.start(run.id, 'operator');

    expect(resumed.status).toBe('running');
    expect(resumed.attemptCount).toBe(2);
    expect(repo.listAttempts(run.id).map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'running',
      dispatchRunId: run.id,
    });
  });

  it('marks queued tracked runs failed when executor start throws', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publish = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-11T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async () => {
          throw new Error('spawn ENOENT');
        }),
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
    const runs = new BeastRunService(
      repo,
      new BeastCatalogService(),
      executors,
      metrics,
      logs,
      { eventBus },
    );
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Start queued work',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Start queued work',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Start queued work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });

    const failed = await runs.start(run.id, 'operator');

    expect(failed).toMatchObject({
      id: run.id,
      status: 'failed',
      stopReason: 'start_failed',
    });
    expect(repo.listEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'run.start_failed',
        payload: { error: 'spawn ENOENT' },
      }),
    ]));
    await expect(logs.read(run.id, 'system')).resolves.toContainEqual(expect.stringContaining('start_failed: spawn ENOENT'));
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'failed',
      dispatchRunId: run.id,
    });
    expect(repo.listTrackedAgentEvents(agent.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'error',
        type: 'agent.dispatch.failed',
        message: `Failed to start Beast run ${run.id}`,
        payload: { runId: run.id, error: 'spawn ENOENT' },
      }),
    ]));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent.status',
      data: expect.objectContaining({ agentId: agent.id, status: 'failed' }),
    }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent.event',
      data: expect.objectContaining({
        agentId: agent.id,
        event: expect.objectContaining({ type: 'agent.dispatch.failed' }),
      }),
    }));
  });

  it('rolls back tracked-agent status sync when persisting its terminal event fails', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publish = vi.spyOn(eventBus, 'publish');
    const runs = new BeastRunService(
      repo,
      new BeastCatalogService(),
      {
        process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
        container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
      },
      metrics,
      logs,
      { eventBus },
    );
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      status: 'initializing',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Finish atomically',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Finish atomically',
        chunkDirectory: 'docs/chunks',
      },
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        provider: 'claude',
        objective: 'Finish atomically',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-11T00:00:01.000Z',
    });
    repo.updateRun(run.id, {
      status: 'completed',
      finishedAt: '2026-03-11T00:00:02.000Z',
      latestExitCode: 0,
    });
    const originalAppendTrackedAgentEvent = repo.appendTrackedAgentEvent.bind(repo);
    repo.appendTrackedAgentEvent = (() => {
      throw new Error('simulated tracked-agent event failure');
    }) as SQLiteBeastRepository['appendTrackedAgentEvent'];

    expect(() => runs.notifyRunStatusChange(run.id)).toThrow('simulated tracked-agent event failure');

    repo.appendTrackedAgentEvent = originalAppendTrackedAgentEvent;
    const storedAgent = repo.getTrackedAgent(agent.id);
    expect(storedAgent).toMatchObject({
      status: 'initializing',
    });
    expect(storedAgent).not.toHaveProperty('dispatchRunId');
    expect(repo.listTrackedAgentEvents(agent.id)).toEqual([]);
    expect(publish).not.toHaveBeenCalled();
  });
});
