import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../../src/beasts/events/beast-log-store.js';
import { BeastRunService } from '../../../../src/beasts/services/beast-run-service.js';
import { BeastCatalogService } from '../../../../src/beasts/services/beast-catalog-service.js';
import { SQLiteBeastRepository } from '../../../../src/beasts/repository/sqlite-beast-repository.js';
import { ProcessBeastExecutor } from '../../../../src/beasts/execution/process-beast-executor.js';
import { martinLoopDefinition } from '../../../../src/beasts/definitions/martin-loop-definition.js';
import type { ProcessCallbacks } from '../../../../src/beasts/execution/process-supervisor.js';
import type { BeastExecutors } from '../../../../src/beasts/services/beast-dispatch-service.js';
import type { BeastMetrics } from '../../../../src/beasts/telemetry/beast-metrics.js';

function createSupervisorMock() {
  return {
    spawn: vi.fn(async (_spec: unknown, _callbacks: unknown) => ({ pid: 4242 })),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };
}

describe('Error Reporting to Dashboard', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  describe('syncTrackedAgent appends agent-level events', () => {
    it('appends agent.run.failed event when process exits non-zero and run has trackedAgentId', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-error-report-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const catalog = new BeastCatalogService();
      const supervisor = createSupervisorMock();

      // Create tracked agent
      const now = new Date().toISOString();
      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        status: 'dispatching',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' } },
        initConfig: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' },
        createdAt: now,
        updatedAt: now,
      });

      // Create run linked to tracked agent
      const run = repo.createRun({
        trackedAgentId: agent.id,
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        createdAt: now,
      });

      // Wire up the executor with onRunStatusChange that calls service.notifyRunStatusChange
      const mockMetrics = {
        recordRunStarted: vi.fn(),
        recordRunCompleted: vi.fn(),
        recordRunFailed: vi.fn(),
        recordRunStopped: vi.fn(),
      } as unknown as BeastMetrics;

      const processExecutor = new ProcessBeastExecutor(repo, logs, supervisor);
      const mockExecutors = {
        process: processExecutor,
        container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
      } as unknown as BeastExecutors;
      const service = new BeastRunService(repo, catalog, mockExecutors, mockMetrics, logs);

      // Wire up the executor with a fresh one that has notifyRunStatusChange
      const executorWithNotify = new ProcessBeastExecutor(
        repo, logs, supervisor,
        { onRunStatusChange: (runId: string) => service.notifyRunStatusChange(runId) },
      );
      (mockExecutors as Record<string, unknown>).process = executorWithNotify;

      // Start the run
      await executorWithNotify.start(run, martinLoopDefinition);

      // Simulate stderr + exit(1)
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onStderr('Error: something broke');
      cb.onStderr('at module.js:42');
      cb.onExit(1, null);

      // Verify agent-level event was appended
      const agentEvents = repo.listTrackedAgentEvents(agent.id);
      const failEvent = agentEvents.find((e) => e.type === 'agent.run.failed');
      expect(failEvent).toBeDefined();
      expect(failEvent!.level).toBe('error');
      expect(failEvent!.message).toContain(run.id);
      expect(failEvent!.message).toContain('failed');
      expect(failEvent!.payload).toMatchObject({
        runId: run.id,
        exitCode: 1,
      });
    });

    it('appends agent.run.completed event when process exits 0 with trackedAgentId', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-error-report-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const catalog = new BeastCatalogService();
      const supervisor = createSupervisorMock();

      const now = new Date().toISOString();
      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        status: 'dispatching',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' } },
        initConfig: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' },
        createdAt: now,
        updatedAt: now,
      });

      const run = repo.createRun({
        trackedAgentId: agent.id,
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        createdAt: now,
      });

      const mockMetrics = { recordRunStopped: vi.fn() } as unknown as BeastMetrics;
      const service = new BeastRunService(
        repo, catalog,
        { process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() }, container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() } } as unknown as BeastExecutors,
        mockMetrics, logs,
      );

      const executorWithNotify = new ProcessBeastExecutor(
        repo, logs, supervisor,
        { onRunStatusChange: (runId: string) => service.notifyRunStatusChange(runId) },
      );

      await executorWithNotify.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(0, null);

      const agentEvents = repo.listTrackedAgentEvents(agent.id);
      const completedEvent = agentEvents.find((e) => e.type === 'agent.run.completed');
      expect(completedEvent).toBeDefined();
      expect(completedEvent!.level).toBe('info');
      expect(completedEvent!.message).toContain('completed successfully');
    });

    it('appends agent.run.stopped event when run is stopped with trackedAgentId', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-error-report-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const catalog = new BeastCatalogService();
      const supervisor = createSupervisorMock();

      const now = new Date().toISOString();
      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        status: 'running',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' } },
        initConfig: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp' },
        createdAt: now,
        updatedAt: now,
      });

      const run = repo.createRun({
        trackedAgentId: agent.id,
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        createdAt: now,
      });

      const mockMetrics = { recordRunStopped: vi.fn() } as unknown as BeastMetrics;
      const mockExecutors = {
        process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
        container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
      } as unknown as BeastExecutors;
      const service = new BeastRunService(repo, catalog, mockExecutors, mockMetrics, logs);

      // Stop a queued run (no attempt) — this goes through the no-attempt path
      const stopped = await service.stop(run.id, 'operator');
      expect(stopped.status).toBe('stopped');

      const agentEvents = repo.listTrackedAgentEvents(agent.id);
      const stoppedEvent = agentEvents.find((e) => e.type === 'agent.run.stopped');
      expect(stoppedEvent).toBeDefined();
      expect(stoppedEvent!.level).toBe('info');
      expect(stoppedEvent!.message).toContain('stopped');
    });

    it('does not append events for runs without trackedAgentId', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-error-report-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = createSupervisorMock();

      const run = repo.createRun({
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'cli',
        dispatchedByUser: 'pfk',
        createdAt: new Date().toISOString(),
      });

      const mockMetrics = { recordRunStopped: vi.fn() } as unknown as BeastMetrics;
      const catalog = new BeastCatalogService();
      const service = new BeastRunService(
        repo, catalog,
        { process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() }, container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() } } as unknown as BeastExecutors,
        mockMetrics, logs,
      );

      const executorWithNotify = new ProcessBeastExecutor(
        repo, logs, supervisor,
        { onRunStatusChange: (runId: string) => service.notifyRunStatusChange(runId) },
      );

      await executorWithNotify.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(1, null);

      // No tracked agent events should be created (no agent was created)
      // This should just not throw
      const updatedRun = repo.getRun(run.id);
      expect(updatedRun!.status).toBe('failed');
    });
  });

  describe('spawn failure handling', () => {
    it('catches spawn ENOENT, records run.spawn_failed event, and sets run status to failed', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-spawn-fail-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const onRunStatusChange = vi.fn();

      const spawnError = new Error('spawn ENOENT') as NodeJS.ErrnoException;
      spawnError.code = 'ENOENT';
      const supervisor = {
        spawn: vi.fn(async () => { throw spawnError; }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };

      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      const run = repo.createRun({
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'cli',
        dispatchedByUser: 'pfk',
        createdAt: new Date().toISOString(),
      });

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow('spawn ENOENT');

      // Run should be marked as failed
      const updatedRun = repo.getRun(run.id);
      expect(updatedRun!.status).toBe('failed');

      // run.spawn_failed event should exist
      const events = repo.listEvents(run.id);
      const spawnFailedEvent = events.find((e) => e.type === 'run.spawn_failed');
      expect(spawnFailedEvent).toBeDefined();
      expect(spawnFailedEvent!.payload).toMatchObject({
        error: 'spawn ENOENT',
        code: 'ENOENT',
      });

      // onRunStatusChange should have been called
      expect(onRunStatusChange).toHaveBeenCalledWith(run.id);
    });
  });

  describe('SIGTERM timeout escalation to SIGKILL', () => {
    it('escalates to kill() when stop does not trigger onExit within timeout', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-sigterm-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, _callbacks: unknown) => ({ pid: 5555 })),
        stop: vi.fn(async () => {
          // stop() returns but does NOT trigger onExit — process is stuck
        }),
        kill: vi.fn(async () => {}),
      };

      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = repo.createRun({
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'cli',
        dispatchedByUser: 'pfk',
        createdAt: new Date().toISOString(),
      });

      const attempt = await executor.start(run, martinLoopDefinition);

      // Stop with a short timeout
      await executor.stop(run.id, attempt.id, { timeoutMs: 100 });

      // Wait for the timeout to fire
      await new Promise((r) => setTimeout(r, 200));

      // supervisor.kill should have been called as escalation
      expect(supervisor.kill).toHaveBeenCalledWith(5555);
    });

    it('does not escalate to kill when process exits before timeout', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-sigterm-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      let capturedCallbacks: ProcessCallbacks | undefined;
      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, callbacks: unknown) => {
          capturedCallbacks = callbacks as ProcessCallbacks;
          return { pid: 6666 };
        }),
        stop: vi.fn(async () => {
          // Simulate: SIGTERM triggers a clean exit shortly after
          setTimeout(() => capturedCallbacks!.onExit(0, 'SIGTERM'), 20);
        }),
        kill: vi.fn(async () => {}),
      };

      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = repo.createRun({
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: '/tmp/chunks' },
        dispatchedBy: 'cli',
        dispatchedByUser: 'pfk',
        createdAt: new Date().toISOString(),
      });

      const attempt = await executor.start(run, martinLoopDefinition);

      await executor.stop(run.id, attempt.id, { timeoutMs: 500 });

      // Wait a bit for cleanup
      await new Promise((r) => setTimeout(r, 100));

      // kill should NOT have been called
      expect(supervisor.kill).not.toHaveBeenCalled();
    });
  });
});
