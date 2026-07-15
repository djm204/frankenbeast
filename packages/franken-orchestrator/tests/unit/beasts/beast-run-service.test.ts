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
import { CapacityReservationPolicy } from '../../../src/beasts/services/capacity-reservation-policy.js';

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

  it('rejects running tracked-agent restarts before stopping the active attempt when capacity is reserved', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const agents = new AgentService(repo, () => '2026-03-11T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => repo.createAttempt(run.id, {
          status: 'running',
          pid: 2001,
          startedAt: '2026-03-10T00:03:00.000Z',
        })),
        stop: vi.fn(async (runId: string, attemptId: string) => {
          repo.updateAttempt(attemptId, { status: 'stopped' });
          return repo.updateRun(runId, { status: 'stopped', stopReason: 'operator_stop' });
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
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs, {
      capacityPolicy: new CapacityReservationPolicy({
        totalSlots: 1,
        reservations: [{ id: 'security-urgent', slots: 1, labels: ['security'] }],
      }),
    });
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { labels: ['feature'] },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Restart safely',
        chunkDirectory: 'docs/chunks',
        labels: ['feature'],
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    await expect(runs.restart(run.id, 'operator')).rejects.toMatchObject({
      name: 'CapacityReservationError',
    });

    expect(executors.process.stop).not.toHaveBeenCalled();
    expect(repo.getRun(run.id)).toMatchObject({ id: run.id, status: 'running' });
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({ status: 'running', dispatchRunId: run.id });
  });

  it('starts queued linked runs using reservation metadata from the run config snapshot', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const agents = new AgentService(repo, () => '2026-03-11T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => repo.createAttempt(run.id, { status: 'running' })),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: {
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
      },
    };
    const capacityPolicy = new CapacityReservationPolicy({
      totalSlots: 2,
      reservations: [{ id: 'security-urgent', slots: 1, labels: ['security'] }],
    });
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, { capacityPolicy });
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs, { capacityPolicy });
    agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { labels: ['feature'] },
    });
    const urgentAgent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: {},
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: urgentAgent.id,
      config: {
        provider: 'claude',
        objective: 'Resume urgent security work',
        chunkDirectory: 'docs/chunks',
        labels: ['security'],
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      startNow: false,
    });

    const started = await runs.start(run.id, 'operator');

    expect(started.status).toBe('running');
    expect(executors.process.start).toHaveBeenCalledOnce();
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
    await expect(runs.readLogs(run.id)).resolves.toContainEqual(expect.stringContaining('start_failed: spawn ENOENT'));
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
      type: 'run.status',
      data: expect.objectContaining({ runId: run.id, status: 'failed' }),
    }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'run.event',
      data: expect.objectContaining({
        runId: run.id,
        event: expect.objectContaining({ type: 'run.start_failed' }),
      }),
    }));
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

  it('records a new start failure when a run with a prior attempt fails before creating another attempt', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async () => {
          throw new Error('config invalid');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Retry failed work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });
    repo.createAttempt(run.id, {
      status: 'failed',
      startedAt: '2026-03-10T00:00:00.000Z',
    });
    repo.updateRun(run.id, {
      status: 'failed',
      finishedAt: '2026-03-10T00:01:00.000Z',
      stopReason: 'exit_1',
      latestExitCode: 1,
    });

    const failed = await runs.start(run.id, 'operator');

    expect(failed).toMatchObject({
      status: 'failed',
      stopReason: 'start_failed',
      attemptCount: 1,
    });
    expect(failed.currentAttemptId).toBeUndefined();
    expect(failed.latestExitCode).toBeUndefined();
    expect(failed.startedAt).toBeUndefined();
    await expect(runs.readLogs(run.id)).resolves.toContainEqual(expect.stringContaining('start_failed: config invalid'));
    expect(repo.listEvents(run.id).at(-1)).toMatchObject({
      type: 'run.start_failed',
      payload: { error: 'config invalid' },
    });
  });

  it('preserves executor-recorded spawn failures instead of rewriting them', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publish = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-10T00:02:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          const failedAt = '2026-03-10T00:02:00.000Z';
          repo.updateRun(run.id, {
            status: 'failed',
            finishedAt: failedAt,
            stopReason: 'spawn_failed',
          });
          repo.appendEvent(run.id, {
            type: 'run.spawn_failed',
            payload: { error: 'spawn ENOENT' },
            createdAt: failedAt,
          });
          throw new Error('spawn ENOENT');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
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
          objective: 'Spawn work',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Spawn work',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Spawn work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });

    const failed = await runs.start(run.id, 'operator');

    expect(failed).toMatchObject({
      status: 'failed',
      stopReason: 'spawn_failed',
    });
    await expect(runs.readLogs(run.id)).resolves.toContainEqual(expect.stringContaining('start_failed: spawn ENOENT'));
    expect(repo.listEvents(run.id).map((event) => event.type)).toEqual(['run.created', 'run.spawn_failed']);
    expect(repo.listTrackedAgentEvents(agent.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'error',
        type: 'agent.dispatch.failed',
        message: `Failed to start Beast run ${run.id}`,
        payload: { runId: run.id, error: 'spawn ENOENT' },
      }),
    ]));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent.event',
      data: expect.objectContaining({
        agentId: agent.id,
        event: expect.objectContaining({ type: 'agent.dispatch.failed' }),
      }),
    }));
  });

  it('does not duplicate tracked-agent failure notifications already emitted by the executor callback', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publish = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-10T00:02:00.000Z');
    let notifyRunStatusChange = (_runId: string): void => {};
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          const failedAt = '2026-03-10T00:02:00.000Z';
          repo.updateRun(run.id, {
            status: 'failed',
            finishedAt: failedAt,
            stopReason: 'spawn_failed',
          });
          repo.appendEvent(run.id, {
            type: 'run.spawn_failed',
            payload: { error: 'spawn ENOENT' },
            createdAt: failedAt,
          });
          notifyRunStatusChange(run.id);
          throw new Error('spawn ENOENT');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
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
    notifyRunStatusChange = (runId: string) => runs.notifyRunStatusChange(runId);
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Spawn work',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Spawn work',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Spawn work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });

    const failed = await runs.start(run.id, 'operator');

    expect(failed.status).toBe('failed');
    expect(repo.getTrackedAgent(agent.id)?.status).toBe('failed');
    expect(repo.listTrackedAgentEvents(agent.id).filter((event) => event.level === 'error')).toHaveLength(1);
    expect(repo.listTrackedAgentEvents(agent.id).filter((event) => event.type === 'agent.dispatch.failed')).toHaveLength(0);
    expect(publish.mock.calls.filter(([event]) => event.type === 'agent.status')).toHaveLength(1);
    expect(publish.mock.calls.filter(([event]) => event.type === 'agent.event')).toHaveLength(1);
  });

  it('clears stale attempt metadata when preserving executor-recorded retry failures', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          const failedAt = '2026-03-10T00:03:00.000Z';
          repo.updateRun(run.id, {
            status: 'failed',
            finishedAt: failedAt,
            stopReason: 'spawn_failed',
          });
          repo.appendEvent(run.id, {
            type: 'run.spawn_failed',
            payload: { error: 'spawn ENOENT' },
            createdAt: failedAt,
          });
          throw new Error('spawn ENOENT');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Retry failed work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });
    const previousAttempt = repo.createAttempt(run.id, {
      status: 'failed',
      startedAt: '2026-03-10T00:00:00.000Z',
      finishedAt: '2026-03-10T00:01:00.000Z',
      stopReason: 'exit_1',
      exitCode: 1,
    });
    repo.updateRun(run.id, {
      status: 'failed',
      startedAt: previousAttempt.startedAt,
      finishedAt: previousAttempt.finishedAt,
      stopReason: 'exit_1',
      latestExitCode: 1,
    });

    const failed = await runs.start(run.id, 'operator');

    expect(failed).toMatchObject({
      status: 'failed',
      stopReason: 'spawn_failed',
      attemptCount: 1,
    });
    expect(failed.currentAttemptId).toBeUndefined();
    expect(failed.latestExitCode).toBeUndefined();
    expect(failed.startedAt).toBeUndefined();
    await expect(runs.readLogs(run.id)).resolves.toContainEqual(expect.stringContaining('start_failed: spawn ENOENT'));

    executors.process.start.mockImplementationOnce(async (retryRun: { id: string }) => {
      repo.createAttempt(retryRun.id, {
        status: 'running',
        pid: 444,
        startedAt: '2026-03-10T00:04:00.000Z',
        executorMetadata: { backend: 'process' },
      });
    });

    const retried = await runs.start(run.id, 'operator');

    expect(retried).toMatchObject({
      status: 'running',
      attemptCount: 2,
    });
    expect(retried.finishedAt).toBeUndefined();
    expect(retried.latestExitCode).toBeUndefined();
    expect(retried.stopReason).toBeUndefined();
  });

  it('does not overwrite a live run when an executor-recorded duplicate start failure occurs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          repo.updateRun(run.id, {
            status: 'failed',
            finishedAt: '2026-03-10T00:06:00.000Z',
            stopReason: 'spawn_failed',
          });
          throw new Error('duplicate start failed');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Already running work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'running',
      pid: 31337,
      startedAt: '2026-03-10T00:03:00.000Z',
      executorMetadata: { backend: 'process' },
    });
    repo.updateRun(run.id, {
      status: 'running',
      startedAt: attempt.startedAt,
    });

    await expect(runs.start(run.id, 'operator')).rejects.toThrow('duplicate start failed');

    expect(repo.getRun(run.id)).toMatchObject({
      id: run.id,
      currentAttemptId: attempt.id,
      attemptCount: 1,
    });
    expect(repo.getAttempt(attempt.id)).toMatchObject({ status: 'running' });
  });

  it('does not overwrite a run that already started when a later start step throws', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          repo.createAttempt(run.id, {
            status: 'running',
            pid: 777,
            startedAt: '2026-03-10T00:05:00.000Z',
            executorMetadata: { backend: 'process' },
          });
          throw new Error('post-start tracking failed');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
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

    await expect(runs.start(run.id, 'operator')).rejects.toThrow('post-start tracking failed');

    expect(repo.getRun(run.id)).toMatchObject({
      id: run.id,
      status: 'running',
      attemptCount: 1,
    });
    expect(repo.listEvents(run.id).some((event) => event.type === 'run.start_failed')).toBe(false);
  });

  it('keeps a newly created running attempt current when an older running attempt also exists', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          repo.createAttempt(run.id, {
            status: 'running',
            pid: 888,
            startedAt: '2026-03-10T00:06:00.000Z',
            executorMetadata: { backend: 'process' },
          });
          throw new Error('post-start tracking failed');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
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
    const priorAttempt = repo.createAttempt(run.id, {
      status: 'running',
      pid: 777,
      startedAt: '2026-03-10T00:05:00.000Z',
      executorMetadata: { backend: 'process' },
    });

    await expect(runs.start(run.id, 'operator')).rejects.toThrow('post-start tracking failed');

    const attempts = repo.listAttempts(run.id);
    expect(attempts).toHaveLength(2);
    expect(repo.getRun(run.id)).toMatchObject({
      id: run.id,
      status: 'running',
      currentAttemptId: attempts[1].id,
      attemptCount: 2,
    });
    expect(repo.getRun(run.id)?.currentAttemptId).not.toBe(priorAttempt.id);
    expect(repo.listEvents(run.id).some((event) => event.type === 'run.start_failed')).toBe(false);
  });

  it('preserves an existing live attempt when a duplicate start fails before creating a new attempt', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-run-service-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async () => {
          throw new Error('transient config write failed');
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const runs = new BeastRunService(repo, new BeastCatalogService(), executors, metrics, logs);
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Already running work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'running',
      pid: 31337,
      startedAt: '2026-03-10T00:03:00.000Z',
      executorMetadata: { backend: 'process' },
    });
    repo.updateRun(run.id, {
      status: 'running',
      startedAt: attempt.startedAt,
    });

    await expect(runs.start(run.id, 'operator')).rejects.toThrow('transient config write failed');

    expect(repo.getRun(run.id)).toMatchObject({
      id: run.id,
      status: 'running',
      currentAttemptId: attempt.id,
      attemptCount: 1,
    });
    expect(repo.listEvents(run.id).some((event) => event.type === 'run.start_failed')).toBe(false);
  });

  it('does not resurrect soft-deleted tracked agents when queued start fails', async () => {
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
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
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
          objective: 'Start deleted linked work',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Start deleted linked work',
        chunkDirectory: 'docs/chunks',
      },
    });
    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Start deleted linked work',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    });
    repo.updateTrackedAgent(agent.id, {
      status: 'deleted',
      dispatchRunId: run.id,
      updatedAt: '2026-03-11T00:00:01.000Z',
    });

    const failed = await runs.start(run.id, 'operator');

    expect(failed.status).toBe('failed');
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'deleted',
      dispatchRunId: run.id,
    });
    expect(repo.listTrackedAgentEvents(agent.id).some((event) => event.type === 'agent.dispatch.failed')).toBe(false);
    expect(publish).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent.status',
      data: expect.objectContaining({ agentId: agent.id }),
    }));
    expect(publish).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent.event',
      data: expect.objectContaining({ agentId: agent.id }),
    }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'run.status',
      data: expect.objectContaining({ runId: run.id, status: 'failed' }),
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
