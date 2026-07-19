import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { CapacityReservationPolicy } from '../../../src/beasts/services/capacity-reservation-policy.js';
import { MaintenanceModeError, MaintenanceModeService } from '../../../src/beasts/services/maintenance-mode-service.js';
import { SAFE_DISPATCH_FAILURE_MESSAGE } from '../../../src/beasts/services/dispatch-failure-message.js';

describe('BeastDispatchService', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('blocks new dispatches while maintenance mode is active', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const maintenance = new MaintenanceModeService(join(workDir, 'maintenance-mode.json'));
    maintenance.activate({ reason: 'database migration', startedAt: '2026-07-16T10:00:00.000Z' });
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
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, { maintenance });

    await expect(dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Implement the dispatch panel',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
    })).rejects.toThrow(MaintenanceModeError);
    expect(executors.process.start).not.toHaveBeenCalled();
    expect(repo.listRuns()).toHaveLength(0);
  });

  it('preserves configured Martin Loop provider aliases for direct runs', async () => {
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
        provider: 'prod-claude',
        objective: 'Implement the dispatch panel',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
    });
    expect(run.configSnapshot.provider).toBe('prod-claude');
    expect(executors.process.start).not.toHaveBeenCalled();
    expect(repo.listRuns()).toHaveLength(1);
  });

  it('fails closed when a persisted maintenance state file is not an object', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const maintenanceStateFile = join(workDir, 'maintenance-mode.json');
    writeFileSync(maintenanceStateFile, 'null\n');
    const maintenance = new MaintenanceModeService(maintenanceStateFile);
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
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, { maintenance });

    expect(maintenance.getState()).toMatchObject({
      enabled: true,
      reason: expect.stringContaining('Maintenance state is unreadable'),
    });
    await expect(dispatch.createRun({
      definitionId: 'martin-loop',
      config: {
        provider: 'claude',
        objective: 'Do not fail open',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
    })).rejects.toThrow(MaintenanceModeError);
    expect(executors.process.start).not.toHaveBeenCalled();
    expect(repo.listRuns()).toHaveLength(0);
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
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
    });

    expect(run.dispatchedBy).toBe('dashboard');
    expect(run.configSnapshot).toEqual({
      provider: 'claude',
      objective: 'Implement the dispatch panel',
      chunkDirectory: 'docs/chunks',
    });
    expect(metrics.render()).toContain('beast_runs_created_total{definition_id="martin-loop",source="dashboard"} 1');
  });

  it('preserves shared runtime config keys when strict definition parsing strips wizard metadata', async () => {
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
        workflow: { workflowType: 'martin-loop' },
        provider: 'claude',
        objective: 'Implement the dispatch panel',
        chunkDirectory: 'docs/chunks',
        skills: ['code-review', 'testing'],
        promptConfig: { text: 'Launch with this context.' },
        gitConfig: { preset: 'feature-branch', baseBranch: 'develop', branchPattern: '', prCreation: true, mergeStrategy: 'squash', commitConvention: 'conventional' },
        llmConfig: { default: { provider: 'openai', model: 'gpt-5.3-codex-spark' } },
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
      moduleConfig: { firewall: true, skills: true, planner: false },
    });

    expect(run.configSnapshot).toEqual({
      provider: 'claude',
      objective: 'Implement the dispatch panel',
      chunkDirectory: 'docs/chunks',
      skills: ['code-review', 'testing'],
      promptConfig: { text: 'Launch with this context.' },
      gitConfig: { preset: 'feature-branch', baseBranch: 'develop', branchPattern: '', prCreation: 'auto', mergeStrategy: 'squash', commitConvention: 'conventional' },
      llmConfig: { default: { provider: 'openai', model: 'gpt-5.3-codex-spark' } },
      modules: { firewall: true, skills: true, planner: false },
    });
  });

  it('drops invalid restored runtime config instead of preserving snapshots the CLI cannot parse', async () => {
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
        workflow: { workflowType: 'martin-loop' },
        provider: 'claude',
        objective: 'Implement the dispatch panel',
        chunkDirectory: 'docs/chunks',
        llmConfig: { default: { provider: 1 } },
        promptConfig: { text: 'Launch with this context.' },
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      executionMode: 'process',
    });

    expect(run.configSnapshot).toEqual({
      provider: 'claude',
      objective: 'Implement the dispatch panel',
      chunkDirectory: 'docs/chunks',
      promptConfig: { text: 'Launch with this context.' },
    });
  });

  it('links tracked agents to dispatch and backfills the run id', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
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
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Implement linkage',
          chunkDirectory: 'docs/chunks',
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Implement linkage',
        chunkDirectory: 'docs/chunks',
      },
    });

    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Implement linkage',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
    });

    expect(run.trackedAgentId).toBe(agent.id);
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'dispatching',
      dispatchRunId: run.id,
    });
  });

  it('counts an existing active run for the same tracked agent when dispatching another run', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
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
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, {
      capacityPolicy: new CapacityReservationPolicy({ totalSlots: 1, reservations: [] }),
    });
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { labels: ['availability'] },
    });
    const firstRun = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'First active run',
        chunkDirectory: 'docs/chunks',
        labels: ['availability'],
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    await expect(dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'Second concurrent run',
        chunkDirectory: 'docs/chunks',
        labels: ['availability'],
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: false,
    })).rejects.toMatchObject({ name: 'CapacityReservationError' });

    expect(repo.listRuns()).toHaveLength(1);
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({ status: 'running', dispatchRunId: firstRun.id });
  });

  it('rejects unknown tracked agents before persisting a run', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
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

    await expect(dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: 'agent-missing',
      config: {
        provider: 'claude',
        objective: 'Reject invalid tracked agent ids',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
    })).rejects.toThrow('Unknown tracked agent: agent-missing');

    expect(repo.listRuns()).toEqual([]);
    expect(metrics.render()).not.toContain('beast_runs_created_total{definition_id="martin-loop",source="dashboard"} 1');
  });

  it('publishes agent.status SSE event when startNow=true with tracked agent', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-17T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => repo.createAttempt(run.id, { status: 'running' })),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, { eventBus });
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: { provider: 'claude', objective: 'SSE test', chunkDirectory: '.' } },
      initConfig: { provider: 'claude', objective: 'SSE test', chunkDirectory: '.' },
    });

    await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: { provider: 'claude', objective: 'SSE test', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    const agentStatusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'agent.status');
    expect(agentStatusEvents).toHaveLength(1);
    expect(agentStatusEvents[0][0].data).toMatchObject({
      agentId: agent.id,
      status: 'running',
    });
  });

  it('preserves awaiting approval status after startNow dispatch pauses for approval', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-17T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => {
          repo.updateRun(run.id, { status: 'pending_approval' });
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, { eventBus });
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: { provider: 'claude', objective: 'Approval test', chunkDirectory: '.' } },
      initConfig: { provider: 'claude', objective: 'Approval test', chunkDirectory: '.' },
    });

    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: { provider: 'claude', objective: 'Approval test', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    expect(run.status).toBe('pending_approval');
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({ status: 'awaiting_approval' });
    const agentStatusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'agent.status');
    expect(agentStatusEvents.at(-1)?.[0].data).toMatchObject({
      agentId: agent.id,
      status: 'awaiting_approval',
    });
  });

  it('redacts executor-recorded spawn failures across startNow telemetry', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-17T00:00:00.000Z');
    const secret = ['dispatch', 'spawn', 'secret'].join('-');
    const executors = {
      process: {
        start: vi.fn(async (startedRun: { id: string }) => {
          const failedAt = '2026-03-17T00:00:00.000Z';
          repo.updateRun(startedRun.id, {
            status: 'failed',
            finishedAt: failedAt,
            stopReason: 'spawn_failed',
          });
          repo.appendEvent(startedRun.id, {
            type: 'run.spawn_failed',
            payload: { error: SAFE_DISPATCH_FAILURE_MESSAGE, code: 'ENOENT' },
            createdAt: failedAt,
          });
          throw new Error(`spawn failed for --token=${secret}`);
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs, { eventBus });
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: { provider: 'claude', objective: 'SSE fail test', chunkDirectory: '.' } },
      initConfig: { identity: { name: 'Interview agent' } },
    });

    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: {
        provider: 'claude',
        objective: 'SSE fail test',
        chunkDirectory: '.',
        identity: { name: secret },
      },
      moduleConfig: { firewall: true, skills: false, planner: true },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    expect(run).toMatchObject({ status: 'failed', stopReason: 'spawn_failed' });
    expect(run.configSnapshot).toEqual({});
    expect(repo.getRun(run.id)?.configSnapshot).toEqual({});
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      initConfig: {
        provider: 'claude',
        objective: 'SSE fail test',
        chunkDirectory: '.',
        identity: { name: 'Interview agent' },
      },
      moduleConfig: { firewall: true, skills: false, planner: true },
    });
    expect(JSON.stringify(repo.getTrackedAgent(agent.id)?.initConfig)).not.toContain(secret);
    const agentStatusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'agent.status');
    expect(agentStatusEvents).toHaveLength(1);
    expect(agentStatusEvents[0][0].data).toMatchObject({
      agentId: agent.id,
      status: 'failed',
    });
    expect(repo.listEvents(run.id).map((event) => event.type)).toEqual([
      'run.created',
      'run.spawn_failed',
    ]);
    expect(repo.listTrackedAgentEvents(agent.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'agent.dispatch.failed',
        payload: { runId: run.id, error: SAFE_DISPATCH_FAILURE_MESSAGE },
      }),
    ]));
    await expect(logs.read(run.id, 'system')).resolves.toContainEqual(
      expect.stringContaining(`start_failed: ${SAFE_DISPATCH_FAILURE_MESSAGE}`),
    );
    const exposedSurfaces = JSON.stringify({
      runEvents: repo.listEvents(run.id),
      agentEvents: repo.listTrackedAgentEvents(agent.id),
      logs: await logs.read(run.id, 'system'),
      publications: publishSpy.mock.calls,
    });
    expect(exposedSurfaces).not.toContain(secret);
    expect(exposedSurfaces).not.toContain('spawn failed');
  });

  it('does not start a run that was stopped by onRunCreated cleanup', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const executors = {
      process: {
        start: vi.fn(async (run: { id: string }) => repo.createAttempt(run.id, { status: 'running' })),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    };
    const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);

    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      config: { provider: 'claude', objective: 'Stop before start', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
      onRunCreated: (createdRun) => {
        repo.updateRun(createdRun.id, {
          status: 'stopped',
          finishedAt: '2026-03-17T00:00:00.000Z',
          stopReason: 'operator_kill',
        });
      },
    });

    expect(run.status).toBe('stopped');
    expect(executors.process.start).not.toHaveBeenCalled();
    expect(repo.getRun(run.id)?.attemptCount).toBe(0);
  });
});
