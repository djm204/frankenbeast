import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('publishes agent.status SSE event on startNow failure with tracked agent', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-dispatch-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const metrics = new PrometheusBeastMetrics();
    const eventBus = new BeastEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');
    const agents = new AgentService(repo, () => '2026-03-17T00:00:00.000Z');
    const executors = {
      process: {
        start: vi.fn(async () => { throw new Error('spawn failed'); }),
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
      initConfig: { provider: 'claude', objective: 'SSE fail test', chunkDirectory: '.' },
    });

    const run = await dispatch.createRun({
      definitionId: 'martin-loop',
      trackedAgentId: agent.id,
      config: { provider: 'claude', objective: 'SSE fail test', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      executionMode: 'process',
      startNow: true,
    });

    expect(run.status).toBe('failed');
    const agentStatusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'agent.status');
    expect(agentStatusEvents).toHaveLength(1);
    expect(agentStatusEvents[0][0].data).toMatchObject({
      agentId: agent.id,
      status: 'failed',
    });
  });
});
