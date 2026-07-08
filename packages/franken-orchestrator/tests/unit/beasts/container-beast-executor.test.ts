import { afterEach, describe, expect, it, vi } from 'vitest';
import { statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContainerBeastExecutor } from '../../../src/beasts/execution/container-beast-executor.js';
import { DEFAULT_SANDBOX_POLICY } from '../../../src/beasts/execution/sandbox-policy.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import type { BeastProcessSpec } from '../../../src/beasts/types.js';
import type { ProcessCallbacks, ProcessSupervisorLike } from '../../../src/beasts/execution/process-supervisor.js';

describe('ContainerBeastExecutor', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it('spawns the docker-transformed spec and reports a running attempt', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-container-executor-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logStore = new BeastLogStore(join(workDir, 'logs'));
    const eventBus = new BeastEventBus();
    const spawned: BeastProcessSpec[] = [];
    const fakeSupervisor: ProcessSupervisorLike = {
      spawn: vi.fn(async (spec: BeastProcessSpec, _callbacks: ProcessCallbacks) => {
        spawned.push(spec);
        return { pid: 4242 };
      }),
      stop: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    };
    const executor = new ContainerBeastExecutor({
      repository,
      logStore,
      eventBus,
      supervisorFactory: () => fakeSupervisor,
      policy: { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:test', workspaceHostPath: workDir },
    });
    const run = repository.createRun({
      definitionId: 'test-beast',
      definitionVersion: 1,
      executionMode: 'container',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const definition = {
      id: 'test-beast',
      version: 1,
      label: 'Test Beast',
      description: 'Test beast',
      executionModeDefault: 'container' as const,
      configSchema: { parse: (value: unknown) => value },
      interviewPrompts: [],
      telemetryLabels: {},
      buildProcessSpec: () => ({ command: 'node', args: ['agent.js'], cwd: workDir, env: { FRANKENBEAST_RUN_CONFIG: '/workspace/config.json' } }),
    };

    const attempt = await executor.start(run, definition);

    expect(attempt.pid).toBe(4242);
    expect(attempt.executorMetadata).toMatchObject({
      backend: 'container',
      containerRuntime: 'docker',
      containerId: `${run.id.replace(/^/, 'fbeast-')}-attempt-1`,
      containerName: `${run.id.replace(/^/, 'fbeast-')}-attempt-1`,
      image: 'fbeast/sandbox:test',
      containerImage: 'fbeast/sandbox:test',
      containerNetwork: 'none',
      resourceSnapshot: { memory: DEFAULT_SANDBOX_POLICY.resourceLimits.memory },
      workspaceHostPath: workDir,
      workspaceContainerPath: '/workspace',
      dockerCommand: 'docker',
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe('docker');
    expect(spawned[0].args).toEqual(expect.arrayContaining(['--name', `fbeast-${run.id}-attempt-1`]));
    expect(spawned[0].args).toEqual(expect.arrayContaining(['--network', 'none']));

    const userFlag = spawned[0].args.indexOf('--user');
    const containerUser = spawned[0].args[userFlag + 1]!;
    const [expectedUid, expectedGid] = containerUser.split(':').map((part) => Number.parseInt(part, 10));
    const configDir = join(workDir, '.fbeast', '.build', 'run-configs');
    const configPath = join(configDir, `${run.id}.json`);
    for (const dir of [join(workDir, '.fbeast'), join(workDir, '.fbeast', '.build'), configDir]) {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(statSync(dir).uid).toBe(expectedUid);
      expect(statSync(dir).gid).toBe(expectedGid);
    }
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(statSync(configPath).uid).toBe(expectedUid);
    expect(statSync(configPath).gid).toBe(expectedGid);
  });

  it('uses a distinct Docker container name for each retry attempt', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-container-executor-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logStore = new BeastLogStore(join(workDir, 'logs'));
    const eventBus = new BeastEventBus();
    const spawned: BeastProcessSpec[] = [];
    const fakeSupervisor: ProcessSupervisorLike = {
      spawn: vi.fn(async (spec: BeastProcessSpec, _callbacks: ProcessCallbacks) => {
        spawned.push(spec);
        return { pid: 4242 + spawned.length };
      }),
      stop: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    };
    const executor = new ContainerBeastExecutor({
      repository,
      logStore,
      eventBus,
      supervisorFactory: () => fakeSupervisor,
      policy: { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:test', workspaceHostPath: workDir },
    });
    const run = repository.createRun({
      definitionId: 'test-beast',
      definitionVersion: 1,
      executionMode: 'container',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const definition = {
      id: 'test-beast',
      version: 1,
      label: 'Test Beast',
      description: 'Test beast',
      executionModeDefault: 'container' as const,
      configSchema: { parse: (value: unknown) => value },
      interviewPrompts: [],
      telemetryLabels: {},
      buildProcessSpec: () => ({ command: 'node', args: ['agent.js'], cwd: workDir, env: {} }),
    };

    const first = await executor.start(run, definition);
    repository.updateAttempt(first.id, { status: 'stopped', finishedAt: '2026-03-10T00:02:00.000Z' });
    repository.updateRun(run.id, { status: 'stopped', currentAttemptId: undefined });
    const second = await executor.start(repository.getRun(run.id)!, definition);

    expect(first.executorMetadata?.containerName).toBe(`fbeast-${run.id}-attempt-1`);
    expect(second.executorMetadata?.containerName).toBe(`fbeast-${run.id}-attempt-2`);
    expect(spawned[0].args).toEqual(expect.arrayContaining(['--name', `fbeast-${run.id}-attempt-1`]));
    expect(spawned[1].args).toEqual(expect.arrayContaining(['--name', `fbeast-${run.id}-attempt-2`]));
  });
});
