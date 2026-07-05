import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { martinLoopDefinition } from '../../../src/beasts/definitions/martin-loop-definition.js';
import { ProcessBeastExecutor } from '../../../src/beasts/execution/process-beast-executor.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import type { ProcessCallbacks } from '../../../src/beasts/execution/process-supervisor.js';
import type { BeastDefinition } from '../../../src/beasts/types.js';

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

function createDefinitionWithCwd(cwd: string): BeastDefinition {
  return {
    id: 'test-beast',
    version: 1,
    label: 'Test Beast',
    description: 'Test definition',
    executionModeDefault: 'process',
    configSchema: martinLoopDefinition.configSchema,
    interviewPrompts: [],
    buildProcessSpec: () => ({
      command: 'node',
      args: ['agent.js'],
      cwd,
      env: { EXISTING_ENV: '1' },
    }),
    telemetryLabels: { family: 'test' },
  };
}

const tempDirs = new Set<string>();

async function createTempWorkDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
  tempDirs.add(dir);
  return dir;
}

async function cleanupTempDirs(): Promise<void> {
  const dirs = [...tempDirs].reverse();
  tempDirs.clear();

  const failures: Error[] = [];
  for (const dir of dirs) {
    try {
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 50,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to clean up test temp directories');
  }
}

describe('ProcessBeastExecutor', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    workDir = undefined;
    await cleanupTempDirs();
  });

  it('starts a tracked attempt and records a lifecycle event', async () => {
    workDir = await createTempWorkDir();
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

  it('creates an isolated git worktree and spawns the process inside it when enabled', async () => {
    workDir = await createTempWorkDir();
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const runGit = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true';
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return workDir!;
      return '';
    });
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, {
      worktreeIsolation: {
        enabled: true,
        projectRoot: workDir!,
        runGit,
      },
    });
    const agent = repo.createTrackedAgent({
      definitionId: 'test-beast',
      source: 'dashboard',
      status: 'dispatching',
      createdByUser: 'pfk',
      initAction: { kind: 'martin-loop', command: 'test', config: {} },
      initConfig: {},
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'test-beast',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    const attempt = await executor.start(run, createDefinitionWithCwd(workDir));

    const expectedWorktree = join(workDir, '.frankenbeast', '.worktrees', agent.id);
    const expectedBranch = `beast/${agent.id}`;
    expect(runGit).toHaveBeenCalledWith(['rev-parse', '--is-inside-work-tree'], workDir);
    expect(runGit).toHaveBeenCalledWith(['branch', '--list', expectedBranch], workDir);
    expect(runGit).toHaveBeenCalledWith(['worktree', 'add', '-b', expectedBranch, expectedWorktree], workDir);
    expect(supervisor.spawn).toHaveBeenCalledTimes(1);
    const [spawnedSpec] = supervisor.spawn.mock.calls[0];
    expect(spawnedSpec).toMatchObject({
      cwd: expectedWorktree,
      env: expect.objectContaining({
        EXISTING_ENV: '1',
        FRANKENBEAST_WORKTREE_PATH: expectedWorktree,
        FRANKENBEAST_WORKTREE_BRANCH: expectedBranch,
      }),
    });
    expect(attempt.executorMetadata).toMatchObject({
      worktreeIsolation: true,
      worktreePath: expectedWorktree,
      worktreeBranch: expectedBranch,
      worktreeCreated: true,
      worktreeAgentId: agent.id,
      worktreeExecutionCwd: expectedWorktree,
      worktreeProjectRoot: workDir,
    });
  });

  it('falls back to the original cwd when worktree isolation is enabled outside a git repository', async () => {
    workDir = await createTempWorkDir();
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const runGit = vi.fn((_args: readonly string[]): string => { throw new Error('not a git repository'); });
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, {
      worktreeIsolation: { enabled: true, projectRoot: workDir!, runGit },
    });
    const agent = repo.createTrackedAgent({
      definitionId: 'test-beast',
      source: 'dashboard',
      status: 'dispatching',
      createdByUser: 'pfk',
      initAction: { kind: 'martin-loop', command: 'test', config: {} },
      initConfig: {},
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'test-beast',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    await executor.start(run, createDefinitionWithCwd(workDir));

    const [spawnedSpec] = supervisor.spawn.mock.calls[0];
    expect(spawnedSpec).toMatchObject({ cwd: workDir });
    expect(runGit).toHaveBeenCalledWith(['rev-parse', '--is-inside-work-tree'], workDir);
  });

  it('skips worktree isolation for ad-hoc runs without a tracked agent', async () => {
    workDir = await createTempWorkDir();
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const runGit = vi.fn((_args: readonly string[]) => 'true');
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, {
      worktreeIsolation: { enabled: true, projectRoot: workDir!, runGit },
    });
    const run = createTestRun(repo);

    await executor.start(run, createDefinitionWithCwd(workDir));

    const [spawnedSpec] = supervisor.spawn.mock.calls[0];
    expect(spawnedSpec).toMatchObject({ cwd: workDir });
    expect(runGit).not.toHaveBeenCalled();
  });

  it('preserves subdirectory cwd and materializes ignored runtime paths in the worktree', async () => {
    workDir = await createTempWorkDir();
    const projectCwd = join(workDir, 'packages', 'demo');
    const sourcePlanDir = join(projectCwd, '.fbeast', 'plans', 'plan-1');
    const sourceDesignDoc = join(projectCwd, '.fbeast', 'designs', 'design.md');
    const sourceOutputDir = join(projectCwd, '.fbeast', 'outputs', 'plan-1');
    const originalCliEntrypoint = join(workDir, 'packages', 'franken-orchestrator', 'dist', 'cli', 'run.js');
    mkdirSync(sourcePlanDir, { recursive: true });
    mkdirSync(join(projectCwd, '.fbeast', 'designs'), { recursive: true });
    mkdirSync(sourceOutputDir, { recursive: true });
    writeFileSync(join(sourcePlanDir, 'chunk.md'), 'plan chunk');
    writeFileSync(sourceDesignDoc, 'design doc');
    writeFileSync(join(sourceOutputDir, 'result.md'), 'existing result');
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const runGit = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true';
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return workDir!;
      return '';
    });
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, {
      worktreeIsolation: { enabled: true, projectRoot: workDir!, runGit },
    });
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      status: 'dispatching',
      createdByUser: 'pfk',
      initAction: { kind: 'martin-loop', command: 'test', config: {} },
      initConfig: {},
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        chunkDirectory: '.fbeast/plans/plan-1',
        designDocPath: sourceDesignDoc,
        outputDir: sourceOutputDir,
      },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const definition: BeastDefinition = {
      ...createDefinitionWithCwd(projectCwd),
      buildProcessSpec: () => ({
        command: 'node',
        args: [
          originalCliEntrypoint,
          '--design-doc',
          sourceDesignDoc,
          '--plan-dir',
          '.fbeast/plans/plan-1',
          '--output-dir',
          sourceOutputDir,
        ],
        cwd: projectCwd,
        env: { EXISTING_ENV: '1' },
      }),
    };

    await executor.start(run, definition);

    const expectedWorktree = join(workDir, '.frankenbeast', '.worktrees', agent.id);
    const expectedExecutionCwd = join(expectedWorktree, 'packages', 'demo');
    const expectedDesignDoc = join(expectedExecutionCwd, '.fbeast', 'designs', 'design.md');
    const expectedOutputDir = join(expectedExecutionCwd, '.fbeast', 'outputs', 'plan-1');
    const [spawnedSpec] = supervisor.spawn.mock.calls[0];
    expect(spawnedSpec).toMatchObject({
      cwd: expectedExecutionCwd,
      args: [
        originalCliEntrypoint,
        '--design-doc',
        expectedDesignDoc,
        '--plan-dir',
        '.fbeast/plans/plan-1',
        '--output-dir',
        expectedOutputDir,
      ],
    });
    expect(readFileSync(join(expectedExecutionCwd, '.fbeast', 'plans', 'plan-1', 'chunk.md'), 'utf-8')).toBe('plan chunk');
    expect(readFileSync(expectedDesignDoc, 'utf-8')).toBe('design doc');
    expect(readFileSync(join(expectedOutputDir, 'result.md'), 'utf-8')).toBe('existing result');
    const configPath = (spawnedSpec as { env: Record<string, string> }).env.FRANKENBEAST_RUN_CONFIG;
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toMatchObject({
      chunkDirectory: '.fbeast/plans/plan-1',
      designDocPath: expectedDesignDoc,
      outputDir: expectedOutputDir,
    });
  });

  it('removes a worktree allocation when process spawning fails before attempt creation', async () => {
    workDir = await createTempWorkDir();
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = {
      spawn: vi.fn(async () => { throw new Error('spawn failed'); }),
      stop: vi.fn(async () => {}),
      kill: vi.fn(async () => {}),
    };
    const runGit = vi.fn((args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true';
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return workDir!;
      if (args[0] === 'branch' && args[1] === '--list') return String(args[2] ?? '');
      return '';
    });
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, {
      worktreeIsolation: { enabled: true, projectRoot: workDir!, runGit },
    });
    const agent = repo.createTrackedAgent({
      definitionId: 'test-beast',
      source: 'dashboard',
      status: 'dispatching',
      createdByUser: 'pfk',
      initAction: { kind: 'martin-loop', command: 'test', config: {} },
      initConfig: {},
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'test-beast',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    await expect(executor.start(run, createDefinitionWithCwd(workDir))).rejects.toThrow('spawn failed');

    const expectedWorktree = join(workDir, '.frankenbeast', '.worktrees', agent.id);
    expect(runGit).toHaveBeenCalledWith(['worktree', 'remove', '--force', expectedWorktree], workDir);
    expect(runGit).toHaveBeenCalledWith(['branch', '-D', `beast/${agent.id}`], workDir);
  });

  it('stops the current attempt without deleting the run row', async () => {
    workDir = await createTempWorkDir();
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

    it('works without onRunStatusChange (legacy constructor contract; keep until the next major release)', () => {
      const repo = {} as SQLiteBeastRepository;
      const logs = {} as BeastLogStore;
      const supervisor = createSupervisorMock();

      const executor = new ProcessBeastExecutor(repo, logs, supervisor);
      expect(executor).toBeInstanceOf(ProcessBeastExecutor);
    });
  });

  describe('ProcessCallbacks wiring', () => {
    it('writes run config files to an explicit run-config directory and removes them on exit', async () => {
      workDir = await createTempWorkDir();
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const runConfigDir = join(workDir, 'project-root', '.fbeast', '.build', 'run-configs');
      let capturedCallbacks: ProcessCallbacks | undefined;
      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, callbacks: unknown) => {
          capturedCallbacks = callbacks as ProcessCallbacks;
          return { pid: 4242 };
        }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { runConfigDir });
      const run = createTestRun(repo);

      await executor.start(run, martinLoopDefinition);

      const [spawnedSpec] = supervisor.spawn.mock.calls[0];
      const configPath = join(runConfigDir, `${run.id}.json`);
      expect((spawnedSpec as { env: Record<string, string> }).env.FRANKENBEAST_RUN_CONFIG).toBe(configPath);
      expect(existsSync(configPath)).toBe(true);

      capturedCallbacks!.onExit(0, null);

      expect(existsSync(configPath)).toBe(false);
    });

    it('passes ProcessCallbacks to supervisor.spawn()', async () => {
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
        expect.any(String),
      );
    });

    it('logs stderr lines via logs.append()', async () => {
      workDir = await createTempWorkDir();
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
        expect.any(String),
      );
    });

    it('redacts configured secret values from stdout, stderr, persisted logs, and streamed log events', async () => {
      workDir = await createTempWorkDir();
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const appendSpy = vi.spyOn(logs, 'append');
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = createSupervisorMock();
      const envSecret = 'configured-env-secret-12345';
      const configSecret = 'configured-webhook-secret-67890';
      const camelCaseSecret = 'configured-camel-case-token-24680';
      const multilineSecretLine = 'configured-multiline-secret-line-13579';
      const arraySecret = 'configured-array-token-97531';
      const visibleValue = 'visible-nonsecret-value';
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = repo.createRun({
        definitionId: 'test-beast',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: {
          webhookUrl: configSecret,
          signingSecret: camelCaseSecret,
          apiKey: [`prefix-${arraySecret}`],
          privateKey: `-----BEGIN PRIVATE KEY-----\n${multilineSecretLine}\n-----END PRIVATE KEY-----`,
          normalOutput: visibleValue,
        },
        dispatchedBy: 'cli',
        dispatchedByUser: 'pfk',
        createdAt: '2026-03-10T00:00:00.000Z',
      });
      const definition: BeastDefinition = {
        ...createDefinitionWithCwd(workDir),
        buildProcessSpec: () => ({
          command: 'node',
          args: ['agent.js'],
          cwd: workDir,
          env: { SERVICE_TOKEN: envSecret, NORMAL_OUTPUT: visibleValue },
        }),
      };

      const attempt = await executor.start(run, definition);
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;

      cb.onStdout(`stdout ${envSecret} ${camelCaseSecret} ${multilineSecretLine} ${visibleValue}`);
      cb.onStderr(`stderr ${configSecret} prefix-${arraySecret} ${visibleValue}`);
      cb.onExit(1, null);
      await new Promise((r) => setTimeout(r, 10));

      expect(appendSpy).toHaveBeenCalledWith(
        run.id,
        attempt.id,
        'stdout',
        `stdout [REDACTED] [REDACTED] [REDACTED] ${visibleValue}`,
        expect.any(String),
      );
      expect(appendSpy).toHaveBeenCalledWith(
        run.id,
        attempt.id,
        'stderr',
        `stderr [REDACTED] [REDACTED] ${visibleValue}`,
        expect.any(String),
      );
      const failEvent = repo.listEvents(run.id).find((e) => e.type === 'attempt.failed');
      expect(failEvent!.payload).toMatchObject({
        lastStderrLines: [`stderr [REDACTED] [REDACTED] ${visibleValue}`],
      });
      const publishedLogLines = publishSpy.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === 'run.log')
        .map((event) => event.data.line);
      expect(publishedLogLines).toContain(`stdout [REDACTED] [REDACTED] [REDACTED] ${visibleValue}`);
      expect(publishedLogLines).toContain(`stderr [REDACTED] [REDACTED] ${visibleValue}`);
      const persistedLogLines = (await logs.read(run.id, attempt.id)).join('\n');
      expect(persistedLogLines).toContain(`stdout [REDACTED] [REDACTED] [REDACTED] ${visibleValue}`);
      expect(persistedLogLines).toContain(`stderr [REDACTED] [REDACTED] ${visibleValue}`);
      expect(persistedLogLines).not.toContain(envSecret);
      expect(persistedLogLines).not.toContain(configSecret);
      expect(persistedLogLines).not.toContain(camelCaseSecret);
      expect(persistedLogLines).not.toContain(multilineSecretLine);
      expect(persistedLogLines).not.toContain(arraySecret);

      const serializedPersistedEvents = JSON.stringify(repo.listEvents(run.id));
      expect(serializedPersistedEvents).not.toContain(envSecret);
      expect(serializedPersistedEvents).not.toContain(configSecret);
      expect(serializedPersistedEvents).not.toContain(camelCaseSecret);
      expect(serializedPersistedEvents).not.toContain(multilineSecretLine);
      expect(serializedPersistedEvents).not.toContain(arraySecret);
      expect(serializedPersistedEvents).toContain(visibleValue);
    });

    it('publishes early buffered lines to eventBus after attempt creation', async () => {
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      expect(appendSpy).toHaveBeenCalledWith(run.id, attempt.id, 'stdout', 'early line 1', expect.any(String));
      expect(appendSpy).toHaveBeenCalledWith(run.id, attempt.id, 'stdout', 'early line 2', expect.any(String));
    });
  });

  describe('handleProcessExit', () => {
    it('marks attempt as completed on exit code 0', async () => {
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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

    it('redacts secrets from failed attempt stderr tails in repository events and eventBus publishes', async () => {
      workDir = await createTempWorkDir();
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const appendSpy = vi.spyOn(logs, 'append');
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = createSupervisorMock();
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = createTestRun(repo);

      await executor.start(run, martinLoopDefinition);
      const [, callbacks] = supervisor.spawn.mock.calls[0];
      const cb = callbacks as ProcessCallbacks;

      const standaloneOpenAiKey = `sk-${'standaloneproviderkey1234567890'}`;
      const githubToken = `ghp_${'abcdefghijklmnopqrstuvwxyz123456'}`;
      const slackToken = ['xoxb', '123456789012', '123456789012', 'abcdefghijklmnopqrstuvwxyz'].join('-');
      const geminiToken = `AIza${'abcdefghijklmnopqrstuvwxyz123456789'}`;

      cb.onStderr('api_key=sk-live-secret-value password=hunter2');
      cb.onStderr('OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz CLIENT_SECRET=client-secret-value');
      cb.onStderr('Authorization: Bot discord-bot-token-value');
      cb.onStderr(`Invalid API key: ${standaloneOpenAiKey} and ${githubToken}`);
      cb.onStderr(`Slack token ${slackToken}`);
      cb.onStderr(`Google token ${geminiToken}`);
      cb.onStderr('{"password":"json-password","client_secret":"json-secret","botToken":"camel-token"}');
      cb.onStderr('{"password":"abc\\"def","accessToken":"camel-access-token"}');
      cb.onStderr('redis://:cachepass@localhost:6379/0');
      cb.onStderr('{"Authorization":"Basic basic-token-value"}');
      cb.onStderr("headers: {'Authorization': 'Bot object-token-value'}");
      cb.onStderr('jwt eyJhbG...cret');
      cb.onStderr('posting to https://hooks.slack.com/services/T000/B000/secret-webhook-token');
      cb.onExit(1, null);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const failEvent = repo.listEvents(run.id).find((e) => e.type === 'attempt.failed');
      expect(failEvent).toBeDefined();
      expect(failEvent!.payload).toMatchObject({
        exitCode: 1,
        lastStderrLines: [
          'api_key=[REDACTED] password=[REDACTED]',
          'OPENAI_API_KEY=[REDACTED] CLIENT_SECRET=[REDACTED]',
          'Authorization: Bot [REDACTED]',
          'Invalid API key: [REDACTED] and [REDACTED]',
          'Slack token [REDACTED]',
          'Google token [REDACTED]',
          '{"password":[REDACTED],"client_secret":[REDACTED],"botToken":[REDACTED]}',
          '{"password":[REDACTED],"accessToken":[REDACTED]}',
          'redis://:[REDACTED]@localhost:6379/0',
          '{"Authorization":"Basic [REDACTED]"}',
          "headers: {'Authorization': 'Bot [REDACTED]'}",
          'jwt eyJhbG...cret',
          'posting to [REDACTED]',
        ],
      });
      expect(appendSpy).toHaveBeenCalledWith(
        run.id,
        expect.any(String),
        'stderr',
        'api_key=[REDACTED] password=[REDACTED]',
        expect.any(String),
      );
      const publishedLogLines = publishSpy.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === 'run.log' && event.data.stream === 'stderr')
        .map((event) => event.data.line);
      expect(publishedLogLines).toContain('api_key=[REDACTED] password=[REDACTED]');
      expect(publishedLogLines).toContain('{"password":[REDACTED],"client_secret":[REDACTED],"botToken":[REDACTED]}');
      const serializedPersistedEvent = JSON.stringify(failEvent);
      expect(serializedPersistedEvent).not.toContain('sk-live-secret-value');
      expect(serializedPersistedEvent).not.toContain('hunter2');
      expect(serializedPersistedEvent).not.toContain('client-secret-value');
      expect(serializedPersistedEvent).not.toContain('discord-bot-token-value');
      expect(serializedPersistedEvent).not.toContain(standaloneOpenAiKey);
      expect(serializedPersistedEvent).not.toContain(githubToken);
      expect(serializedPersistedEvent).not.toContain(slackToken);
      expect(serializedPersistedEvent).not.toContain(geminiToken);
      expect(serializedPersistedEvent).not.toContain('json-password');
      expect(serializedPersistedEvent).not.toContain('json-secret');
      expect(serializedPersistedEvent).not.toContain('camel-token');
      expect(serializedPersistedEvent).not.toContain('abc\\"def');
      expect(serializedPersistedEvent).not.toContain('camel-access-token');
      expect(serializedPersistedEvent).not.toContain('cachepass');
      expect(serializedPersistedEvent).not.toContain('basic-token-value');
      expect(serializedPersistedEvent).not.toContain('object-token-value');
      expect(serializedPersistedEvent).not.toContain('abc1234567890secret');
      expect(serializedPersistedEvent).not.toContain('secret-webhook-token');

      const publishedFailure = publishSpy.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === 'run.event')
        .find((event) => ((event.data as { event?: { type?: string } }).event?.type === 'attempt.failed')) as
        | { data: { event: { payload: unknown } } }
        | undefined;
      expect(publishedFailure).toBeDefined();
      expect(publishedFailure!.data.event.payload).toMatchObject(failEvent!.payload);
      const serializedPublishedEvent = JSON.stringify(publishedFailure);
      expect(serializedPublishedEvent).not.toContain('sk-live-secret-value');
      expect(serializedPublishedEvent).not.toContain('hunter2');
      expect(serializedPublishedEvent).not.toContain('client-secret-value');
      expect(serializedPublishedEvent).not.toContain('discord-bot-token-value');
      expect(serializedPublishedEvent).not.toContain(standaloneOpenAiKey);
      expect(serializedPublishedEvent).not.toContain(githubToken);
      expect(serializedPublishedEvent).not.toContain(slackToken);
      expect(serializedPublishedEvent).not.toContain(geminiToken);
      expect(serializedPublishedEvent).not.toContain('json-password');
      expect(serializedPublishedEvent).not.toContain('json-secret');
      expect(serializedPublishedEvent).not.toContain('camel-token');
      expect(serializedPublishedEvent).not.toContain('abc\\"def');
      expect(serializedPublishedEvent).not.toContain('camel-access-token');
      expect(serializedPublishedEvent).not.toContain('cachepass');
      expect(serializedPublishedEvent).not.toContain('basic-token-value');
      expect(serializedPublishedEvent).not.toContain('object-token-value');
      expect(serializedPublishedEvent).not.toContain('abc1234567890secret');
      expect(serializedPublishedEvent).not.toContain('secret-webhook-token');
    });

    it('marks attempt as failed on signal kill', async () => {
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      expect(statusEvents).toHaveLength(2);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'running',
      });
      expect(statusEvents[1][0].data).toMatchObject({
        runId: run.id,
        status: 'completed',
      });
    });

    it('does not publish running after flushing an early process exit', async () => {
      workDir = await createTempWorkDir();
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const eventBus = new BeastEventBus();
      const publishSpy = vi.spyOn(eventBus, 'publish');
      const supervisor = {
        spawn: vi.fn(async (_spec: unknown, callbacks: unknown) => {
          (callbacks as ProcessCallbacks).onExit(0, null);
          return { pid: 5150 };
        }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { eventBus });
      const run = createTestRun(repo);

      const attempt = await executor.start(run, martinLoopDefinition);

      expect(attempt.status).toBe('completed');
      const statusEvents = publishSpy.mock.calls.filter(([e]) => e.type === 'run.status');
      expect(statusEvents.map(([e]) => e.data.status)).toEqual(['completed']);
      expect(repo.getRun(run.id)).toMatchObject({ status: 'completed' });
    });

    it('publishes run.status event via eventBus on operator stop (finishAttempt)', async () => {
      workDir = await createTempWorkDir();
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
      expect(statusEvents).toHaveLength(2);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'running',
      });
      expect(statusEvents[1][0].data).toMatchObject({
        runId: run.id,
        status: 'stopped',
      });
    });

    it('publishes run.status event via eventBus on operator kill (finishAttempt)', async () => {
      workDir = await createTempWorkDir();
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
      expect(statusEvents).toHaveLength(2);
      expect(statusEvents[0][0].data).toMatchObject({
        runId: run.id,
        status: 'running',
      });
      expect(statusEvents[1][0].data).toMatchObject({
        runId: run.id,
        status: 'stopped',
      });
    });

    it('publishes run.status event via eventBus on spawn failure', async () => {
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
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
      workDir = await createTempWorkDir();
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const runConfigDir = join(workDir, 'project-root', '.fbeast', '.build', 'run-configs');
      const supervisor = {
        spawn: vi.fn(async () => { throw new Error('spawn failed'); }),
        stop: vi.fn(async () => {}),
        kill: vi.fn(async () => {}),
      };
      const executor = new ProcessBeastExecutor(repo, logs, supervisor, { runConfigDir });
      const run = createTestRun(repo);

      await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow();

      // Config file should have been cleaned up
      const configPath = join(runConfigDir, `${run.id}.json`);
      expect(existsSync(configPath)).toBe(false);
    });
  });

  describe('stderr buffer', () => {
    it('maintains circular stderr buffer limited to 50 lines', async () => {
      workDir = await createTempWorkDir();
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
