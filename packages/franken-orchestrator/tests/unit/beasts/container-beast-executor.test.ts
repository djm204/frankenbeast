import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe('docker');
    expect(spawned[0].args).toEqual(expect.arrayContaining(['--network', 'none']));
  });
});
