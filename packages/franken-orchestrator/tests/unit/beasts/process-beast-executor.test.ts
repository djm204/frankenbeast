import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { martinLoopDefinition } from '../../../src/beasts/definitions/martin-loop-definition.js';
import { ProcessBeastExecutor } from '../../../src/beasts/execution/process-beast-executor.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';

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
    const supervisor = {
      spawn: vi.fn(async () => ({ pid: 4242 })),
      stop: vi.fn(async () => {}),
      kill: vi.fn(async () => {}),
    };
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        provider: 'claude',
        objective: 'Implement the run detail page',
      },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

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
      spawn: vi.fn(async () => ({ pid: 777 })),
      stop: vi.fn(async () => {}),
      kill: vi.fn(async () => {}),
    };
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        provider: 'claude',
        objective: 'Implement the stop button',
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
});
