import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { reconcileDispatcherQueueAfterRestart } from '../../../src/beasts/services/dispatcher-queue-reconciliation.js';
import type { TrackedAgent } from '../../../src/beasts/types.js';

function createRepo(workDir: string): SQLiteBeastRepository {
  return new SQLiteBeastRepository(join(workDir, 'beasts.db'));
}

function createAgent(repo: SQLiteBeastRepository, name: string): TrackedAgent {
  return repo.createTrackedAgent({
    definitionId: 'martin-loop',
    source: 'dashboard',
    status: 'initializing',
    createdByUser: 'operator',
    initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
    initConfig: { identity: { name }, labels: ['reconciliation'] },
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  });
}

describe('dispatcher queue reconciliation after restart', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it('reconciles queued, running, approval, and terminal runs from persisted records', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir!);
    const liveAgent = createAgent(repo, 'live worker');
    const deadAgent = createAgent(repo, 'dead worker');
    const queuedAgent = createAgent(repo, 'queued worker');
    const approvalAgent = createAgent(repo, 'approval worker');
    const completedAgent = createAgent(repo, 'completed worker');

    const liveRun = repo.createRun({
      trackedAgentId: liveAgent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'live', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    const liveAttempt = repo.createAttempt(liveRun.id, {
      status: 'running',
      pid: 4242,
      startedAt: '2026-03-20T00:01:00.000Z',
    });

    const deadRun = repo.createRun({
      trackedAgentId: deadAgent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'dead', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:02.000Z',
    });
    const deadAttempt = repo.createAttempt(deadRun.id, {
      status: 'running',
      pid: 5150,
      startedAt: '2026-03-20T00:01:00.000Z',
    });

    const queuedRun = repo.createRun({
      trackedAgentId: queuedAgent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'queued', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:03.000Z',
    });

    const approvalRun = repo.createRun({
      trackedAgentId: approvalAgent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'approval', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:04.000Z',
    });
    repo.createAttempt(approvalRun.id, {
      status: 'pending_approval',
      startedAt: '2026-03-20T00:01:00.000Z',
    });

    const completedRun = repo.createRun({
      trackedAgentId: completedAgent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'done', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:05.000Z',
    });
    repo.updateRun(completedRun.id, {
      status: 'completed',
      finishedAt: '2026-03-20T00:03:00.000Z',
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: (pid) => pid === 4242,
    });

    expect(report.checkedRuns).toBe(5);
    expect(report.findings.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'live-running-attempt-restored',
      'stale-running-attempt-failed',
      'queued-run-restored',
      'pending-approval-restored',
      'terminal-run-restored',
    ]));
    expect(repo.getRun(liveRun.id)).toMatchObject({ status: 'running', currentAttemptId: liveAttempt.id });
    expect(repo.getTrackedAgent(liveAgent.id)).toMatchObject({ status: 'running', dispatchRunId: liveRun.id });

    expect(repo.getRun(deadRun.id)).toMatchObject({
      status: 'failed',
      stopReason: 'dispatcher_restart_stale_pid',
      finishedAt: '2026-03-20T00:05:00.000Z',
    });
    expect(repo.getAttempt(deadAttempt.id)).toMatchObject({
      status: 'failed',
      stopReason: 'dispatcher_restart_stale_pid',
    });
    expect(repo.getTrackedAgent(deadAgent.id)).toMatchObject({ status: 'failed', dispatchRunId: deadRun.id });

    expect(repo.getRun(queuedRun.id)).toMatchObject({ status: 'queued' });
    expect(repo.getTrackedAgent(queuedAgent.id)).toMatchObject({ status: 'dispatching', dispatchRunId: queuedRun.id });
    expect(repo.getRun(approvalRun.id)).toMatchObject({ status: 'pending_approval' });
    expect(repo.getTrackedAgent(approvalAgent.id)).toMatchObject({ status: 'awaiting_approval', dispatchRunId: approvalRun.id });
    expect(repo.getTrackedAgent(completedAgent.id)).toMatchObject({ status: 'completed', dispatchRunId: completedRun.id });

    expect(repo.listEvents(deadRun.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'run.reconciliation.dispatcher_restart',
        payload: expect.objectContaining({ code: 'stale-running-attempt-failed' }),
      }),
    ]));
  });

  it('reports duplicate live processes for the same tracked agent without blindly killing either worker', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir!);
    const agent = createAgent(repo, 'duplicate worker');

    const runOne = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'first', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    const attemptOne = repo.createAttempt(runOne.id, { status: 'running', pid: 1111 });
    const runTwo = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'second', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:02.000Z',
    });
    const attemptTwo = repo.createAttempt(runTwo.id, { status: 'running', pid: 2222 });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: (pid) => pid === 1111 || pid === 2222,
    });

    expect(report.duplicateLiveAgentRunCount).toBe(2);
    expect(report.findings.filter(finding => finding.code === 'duplicate-live-agent-run')).toEqual([
      expect.objectContaining({ runId: runTwo.id, attemptId: attemptTwo.id, pid: 2222 }),
      expect.objectContaining({ runId: runOne.id, attemptId: attemptOne.id, pid: 1111 }),
    ]);
    expect(repo.getRun(runOne.id)).toMatchObject({ status: 'running' });
    expect(repo.getRun(runTwo.id)).toMatchObject({ status: 'running' });
    expect(repo.listEvents(runOne.id).some(event => event.type === 'run.reconciliation.duplicate_live_agent_run')).toBe(true);
    expect(repo.listEvents(runTwo.id).some(event => event.type === 'run.reconciliation.duplicate_live_agent_run')).toBe(true);
  });
});
