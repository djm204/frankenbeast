import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';

describe('SQLiteBeastRepository', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('creates, loads, and lists durable beast runs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { provider: 'claude' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    expect(run.id).toMatch(/^run_/);
    expect(repo.getRun(run.id)).toEqual(run);
    expect(repo.listRuns()).toEqual([run]);
  });

  it('creates attempts and keeps run state in sync', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const run = repo.createRun({
      definitionId: 'chunk-plan',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { chunkSize: 3 },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    const attempt1 = repo.createAttempt(run.id, {
      status: 'running',
      pid: 101,
      startedAt: '2026-03-10T00:01:00.000Z',
      executorMetadata: { backend: 'process' },
    });
    const attempt2 = repo.restartAttempt(run.id, {
      status: 'running',
      pid: 202,
      startedAt: '2026-03-10T00:02:00.000Z',
      executorMetadata: { backend: 'process' },
    });

    expect(attempt1.attemptNumber).toBe(1);
    expect(attempt2.attemptNumber).toBe(2);
    expect(repo.listAttempts(run.id)).toEqual([attempt1, attempt2]);
    expect(repo.getRun(run.id)).toMatchObject({
      currentAttemptId: attempt2.id,
      attemptCount: 2,
    });
  });

  it('appends ordered run events and updates terminal status', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const run = repo.createRun({
      definitionId: 'design-interview',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { goal: 'Design the beasts section' },
      dispatchedBy: 'chat',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'running',
      startedAt: '2026-03-10T00:01:00.000Z',
      executorMetadata: { backend: 'process' },
    });

    const event1 = repo.appendEvent(run.id, {
      attemptId: attempt.id,
      type: 'attempt.started',
      payload: { pid: 333 },
      createdAt: '2026-03-10T00:01:00.000Z',
    });
    const event2 = repo.appendEvent(run.id, {
      attemptId: attempt.id,
      type: 'attempt.stdout',
      payload: { line: 'hello beast' },
      createdAt: '2026-03-10T00:01:01.000Z',
    });

    repo.updateAttempt(attempt.id, {
      status: 'stopped',
      finishedAt: '2026-03-10T00:02:00.000Z',
      exitCode: 137,
      stopReason: 'operator_kill',
    });
    repo.updateRun(run.id, {
      status: 'stopped',
      finishedAt: '2026-03-10T00:02:00.000Z',
      latestExitCode: 137,
      stopReason: 'operator_kill',
    });

    expect(event1.sequence).toBe(1);
    expect(event2.sequence).toBe(2);
    expect(repo.listEvents(run.id)).toEqual([event1, event2]);
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'stopped',
      latestExitCode: 137,
      stopReason: 'operator_kill',
    });
  });
});
