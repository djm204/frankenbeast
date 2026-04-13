import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { martinLoopDefinition } from '../../../src/beasts/definitions/martin-loop-definition.js';
import { ProcessBeastExecutor } from '../../../src/beasts/execution/process-beast-executor.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import type { ProcessCallbacks } from '../../../src/beasts/execution/process-supervisor.js';

function createTestRun(repo: SQLiteBeastRepository) {
  return repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: {
      provider: 'claude',
      objective: 'Test objective',
      chunkDirectory: '/tmp/chunks',
    },
    dispatchedBy: 'cli',
    dispatchedByUser: 'pfk',
    createdAt: '2026-03-10T00:00:00.000Z',
  });
}

function createSupervisorMock() {
  return {
    spawn: vi.fn(async (_spec: unknown, _callbacks: unknown) => ({ pid: 4242 })),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };
}

describe('ProcessBeastExecutor', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('starts a tracked attempt and records a lifecycle event', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);
    const run = createTestRun(repo);

    const attempt = await executor.start(run, martinLoopDefinition);

    expect(attempt.status).toBe('running');
    expect(attempt.pid).toBe(4242);
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'running',
      currentAttemptId: attempt.id,
      attemptCount: 1,
    });
    expect(repo.listEvents(run.id)).toEqual([
      expect.objectContaining({
        attemptId: attempt.id,
        type: 'attempt.started',
      }),
    ]);
  });

  it('stops the current attempt without deleting the run row', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = {
      spawn: vi.fn(async (_spec: unknown, _callbacks: unknown) => ({ pid: 777 })),
      stop: vi.fn(async () => {}),
      kill: vi.fn(async () => {}),
    };
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, { defaultStopTimeoutMs: 100 });
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        provider: 'claude',
        objective: 'Implement the stop button',
        chunkDirectory: '/tmp/chunks',
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    const attempt = await executor.start(run, martinLoopDefinition);
    await executor.stop(run.id, attempt.id);

    expect(supervisor.stop).toHaveBeenCalledWith(777);
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'stopped',
      currentAttemptId: attempt.id,
      attemptCount: 1,
    });
    expect(repo.listAttempts(run.id)[0]).toMatchObject({
      id: attempt.id,
      status: 'stopped',
      stopReason: 'operator_stop',
    });
  });

  describe('onRunStatusChange callback', () => {
    it('accepts optional onRunStatusChange as 4th constructor argument', () => {
      const repo = {} as SQLiteBeastRepository;
      const logs = {} as BeastLogStore;
      const supervisor = createSupervisorMock();
      const onRunStatusChange = vi.fn();

      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      expect(executor).toBeInstanceOf(ProcessBeastExecutor);
    });

    it('works without onRunStatusChange (backward compat)', () => {
      const repo = {} as SQLiteBeastRepository;
      const logs = {} as BeastLogStore;
      const supervisor = createSupervisorMock();

      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      expect(executor).toBeInstanceOf(ProcessBeastExecutor);
    });
  });

  describe('ProcessCallbacks wiring', () => {
    it('passes ProcessCallbacks to supervisor.spawn()', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      await executor.start(run, martinLoopDefinition);

      expect(supervisor.spawn).toHaveBeenCalledTimes(1);
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      expect(callbacks).toBeDefined();
      expect(typeof (callbacks as ProcessCallbacks).onStdout).toBe('function');
      expect(typeof (callbacks as ProcessCallbacks).onStderr).toBe('function');
      expect(typeof (callbacks as ProcessCallbacks).onExit).toBe('function');
    });

    it('logs stdout lines via logs.append()', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const appendSpy = vi.spyOn(logs, 'append');
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      // Get the callbacks passed to spawn
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;

      // Simulate stdout output after attempt is created
      cb.onStdout('hello world');

      // Wait for any microtasks
      await new Promise((r) => setTimeout(r, 10));

      expect(appendSpy).toHaveBeenCalledWith(
        run.id,
        attempt.id,
        'stdout',
        'hello world',
      );
    });

    it('logs stderr lines via logs.append()', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const appendSpy = vi.spyOn(logs, 'append');
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;

      cb.onStderr('something went wrong');

      await new Promise((r) => setTimeout(r, 10));

      expect(appendSpy).toHaveBeenCalledWith(
        run.id,
        attempt.id,
        'stderr',
        'something went wrong',
      );
    });

    it('publishes early buffered lines to eventBus after attempt creation', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      let capturedCallbacks: ProcessCallbacks | undefined;

      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, callbacks: unknown) => {
          capturedCallbacks = callbacks as ProcessCallbacks;
          capturedCallbacks.onStdout('early stdout');
          capturedCallbacks.onStderr('early stderr');
          return { pid: 4242 };
        }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };

      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      const logEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'run.log');
      const stdoutEvents = logEvents.filter(([e]) => e.data.stream === 'stdout' && e.data.line === 'early stdout');
      const stderrEvents = logEvents.filter(([e]) => e.data.stream === 'stderr' && e.data.line === 'early stderr');

      expect(stdoutEvents).toHaveLength(1);
      expect(stdoutEvents[0][0].data).toMatchObject({
        runId: run.id,
        attemptId: attempt.id,
        stream: 'stdout',
        line: 'early stdout',
      });
      expect(stderrEvents).toHaveLength(1);
      expect(stderrEvents[0][0].data).toMatchObject({
        runId: run.id,
        attemptId: attempt.id,
        stream: 'stderr',
        line: 'early stderr',
      });
    });

    it('buffers early stdout lines received before attempt creation', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const appendSpy = vi.spyOn(logs, 'append');
      let capturedCallbacks: ProcessCallbacks | undefined;

      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, callbacks: unknown) => {
          capturedCallbacks = callbacks as ProcessCallbacks;
          // Simulate stdout arriving during spawn (before attempt is created)
          capturedCallbacks.onStdout('early line 1');
          capturedCallbacks.onStdout('early line 2');
          return { pid: 4242 };
        }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };

      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      await new Promise((r) => setTimeout(r, 10));

      // Early lines should have been flushed after attempt creation
      expect(appendSpy).toHaveBeenCalledWith(run.id, attempt.id, 'stdout', 'early line 1');
      expect(appendSpy).toHaveBeenCalledWith(run.id, attempt.id, 'stdout', 'early line 2');
    });
  });

  describe('handleProcessExit', () => {
    it('marks attempt as completed on exit code 0', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const onRunStatusChange = vi.fn();
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      // Trigger onExit via captured callbacks
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(0, null);

      const updatedAttempt = repo.getAttempt(attempt.id);
      expect(updatedAttempt).toMatchObject({
        status: 'completed',
        exitCode: 0,
      });
      expect(updatedAttempt!.finishedAt).toBeDefined();

      const updatedRun = repo.getRun(run.id);
      expect(updatedRun).toMatchObject({
        status: 'completed',
        latestExitCode: 0,
      });
      expect(updatedRun!.finishedAt).toBeDefined();

      // Event should be recorded
      const events = repo.listEvents(run.id);
      const finishEvent = events.find((e) => e.type === 'attempt.finished');
      expect(finishEvent).toBeDefined();
      expect(finishEvent!.payload).toMatchObject({ exitCode: 0 });
    });

    it('marks attempt as failed on non-zero exit code', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const onRunStatusChange = vi.fn();
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      // Send some stderr before exit
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onStderr('Error: something broke');
      cb.onExit(1, null);

      const updatedAttempt = repo.getAttempt(attempt.id);
      expect(updatedAttempt).toMatchObject({
        status: 'failed',
        exitCode: 1,
        stopReason: 'exit_code_1',
      });

      const updatedRun = repo.getRun(run.id);
      expect(updatedRun).toMatchObject({
        status: 'failed',
        latestExitCode: 1,
        stopReason: 'exit_code_1',
      });

      // Event should include last stderr lines
      const events = repo.listEvents(run.id);
      const failEvent = events.find((e) => e.type === 'attempt.failed');
      expect(failEvent).toBeDefined();
      expect(failEvent!.payload).toMatchObject({
        exitCode: 1,
        lastStderrLines: ['Error: something broke'],
        summary: 'Process exited with code 1',
      });
    });

    it('marks attempt as failed on signal kill', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(null, 'SIGKILL');

      const updatedAttempt = repo.getAttempt(attempt.id);
      expect(updatedAttempt).toMatchObject({
        status: 'failed',
        stopReason: 'signal_SIGKILL',
      });
    });

    it('calls onRunStatusChange after DB update', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const onRunStatusChange = vi.fn();
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      const run = createTestRun(repo);

      await executor.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(0, null);

      expect(onRunStatusChange).toHaveBeenCalledWith(run.id);
    });

    it('handles process exit before attemptId is set (early exit)', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const onRunStatusChange = vi.fn();

      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, callbacks: unknown) => {
          const cb = callbacks as ProcessCallbacks;
          // Simulate immediate crash: stderr + exit during spawn
          cb.onStderr('command not found');
          cb.onExit(127, null);
          return { pid: 4242 };
        }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };

      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      // Exit should have been flushed after attempt creation
      const updatedAttempt = repo.getAttempt(attempt.id);
      expect(updatedAttempt).toMatchObject({
        status: 'failed',
        exitCode: 127,
        stopReason: 'exit_code_127',
      });

      const updatedRun = repo.getRun(run.id);
      expect(updatedRun).toMatchObject({
        status: 'failed',
        latestExitCode: 127,
      });

      expect(onRunStatusChange).toHaveBeenCalledWith(run.id);
    });

    it('handles exit with null code and null signal', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(null, null);

      const updatedAttempt = repo.getAttempt(attempt.id);
      expect(updatedAttempt).toMatchObject({
        status: 'failed',
        stopReason: 'unknown_exit',
      });
    });

    it('publishes run.status event via eventBus on process exit', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = createTestRun(repo);

      await executor.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(0, null);

      const statusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'run.status');
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'completed',
      });
    });

    it('publishes run.status event via eventBus on operator stop (finishAttempt)', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus, defaultStopTimeoutMs: 100 });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);
      await executor.stop(run.id, attempt.id);

      const statusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'run.status');
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'stopped',
      });
    });

    it('publishes run.status event via eventBus on operator kill (finishAttempt)', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);
      await executor.kill(run.id, attempt.id);

      const statusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'run.status');
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'stopped',
      });
    });

    it('publishes run.status event via eventBus on spawn failure', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = {
        spawn: vi.fn(async () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = createTestRun(repo);

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow('spawn ENOENT');

      const statusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'run.status');
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'failed',
      });
    });

    it('does not overwrite operator_stop status when SIGKILL exit fires after finishAttempt', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus, defaultStopTimeoutMs: 100 });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      // stop() will timeout and call finishAttempt with 'stopped'/'operator_stop'
      await executor.stop(run.id, attempt.id);

      // Verify finishAttempt wrote the correct status
      expect(repo.getRun(run.id)).toMatchObject({ status: 'stopped', stopReason: 'operator_stop' });

      // Simulate the delayed SIGKILL exit callback firing
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;
      cb.onExit(null, 'SIGKILL');

      // handleProcessExit should NOT overwrite the terminal status
      const finalRun = repo.getRun(run.id);
      expect(finalRun).toMatchObject({ status: 'stopped', stopReason: 'operator_stop' });
    });
  });

  describe('spawn failure handling', () => {
    it('sets run to failed with spawn_failed stop reason', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = {
        spawn: vi.fn(async () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow('spawn ENOENT');

      const updatedRun = repo.getRun(run.id);
      expect(updatedRun).toMatchObject({
        status: 'failed',
        stopReason: 'spawn_failed',
      });
      expect(updatedRun!.finishedAt).toBeDefined();
    });

    it('appends run.spawn_failed event with error details', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = {
        spawn: vi.fn(async () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow();

      const events = repo.listEvents(run.id);
      const spawnEvent = events.find((e) => e.type === 'run.spawn_failed');
      expect(spawnEvent).toBeDefined();
      expect(spawnEvent!.payload).toMatchObject({
        error: 'spawn ENOENT',
        code: 'ENOENT',
      });
      expect(spawnEvent!.payload.command).toBeDefined();
      expect(spawnEvent!.payload.args).toBeDefined();
    });

    it('calls onRunStatusChange on spawn failure', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const onRunStatusChange = vi.fn();
      const supervisor = {
        spawn: vi.fn(async () => { throw new Error('spawn failed'); }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange });
      const run = createTestRun(repo);

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow();

      expect(onRunStatusChange).toHaveBeenCalledWith(run.id);
    });

    it('cleans up config file on spawn failure', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const { existsSync } = await import('node:fs');
      const supervisor = {
        spawn: vi.fn(async () => { throw new Error('spawn failed'); }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow();

      // Config file should have been cleaned up
      const configDir = join(process.cwd(), '.fbeast', '.build', 'run-configs');
      const configPath = join(configDir, `${run.id}.json`);
      expect(existsSync(configPath)).toBe(false);
    });
  });

  describe('stderr buffer', () => {
    it('maintains circular stderr buffer limited to 50 lines', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      const run = createTestRun(repo);

      await executor.start(run, martinLoopDefinition);

      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;

      // Send 60 stderr lines
      for (let i = 0; i < 60; i++) {
        cb.onStderr(`line ${i}`);
      }
      cb.onExit(1, null);

      const events = repo.listEvents(run.id);
      const failEvent = events.find((e) => e.type === 'attempt.failed');
      const stderrLines = failEvent!.payload.lastStderrLines as string[];
      expect(stderrLines).toHaveLength(50);
      // Should contain lines 10-59 (the last 50)
      expect(stderrLines[0]).toBe('line 10');
      expect(stderrLines[49]).toBe('line 59');
    });
  });
});
