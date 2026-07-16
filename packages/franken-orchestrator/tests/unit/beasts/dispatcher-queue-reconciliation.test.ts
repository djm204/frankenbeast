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
    const repo = createRepo(workDir);
    const liveAgent = createAgent(repo, 'live worker');
    const deadAgent = createAgent(repo, 'dead worker');
    const queuedAgent = createAgent(repo, 'queued worker');
    const approvalAgent = createAgent(repo, 'approval worker');
    const completedAgent = createAgent(repo, 'completed worker');
    const terminalAttemptAgent = createAgent(repo, 'terminal attempt worker');

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

    const terminalAttemptRun = repo.createRun({
      trackedAgentId: terminalAttemptAgent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'terminal attempt', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:06.000Z',
    });
    const terminalAttempt = repo.createAttempt(terminalAttemptRun.id, {
      status: 'completed',
      pid: 6262,
      startedAt: '2026-03-20T00:01:00.000Z',
    });
    repo.updateAttempt(terminalAttempt.id, {
      status: 'completed',
      finishedAt: '2026-03-20T00:04:00.000Z',
      exitCode: 0,
    });
    repo.updateRun(terminalAttemptRun.id, { status: 'running', finishedAt: null });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: (pid) => pid === 4242,
    });

    expect(report.checkedRuns).toBe(6);
    expect(report.findings.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'stale-running-attempt-failed',
      'queued-run-restored',
      'pending-approval-restored',
      'terminal-run-restored',
      'terminal-attempt-restored',
    ]));
    expect(repo.getRun(liveRun.id)).toMatchObject({
      status: 'failed',
      stopReason: 'dispatcher_restart_unattached_pid',
      finishedAt: '2026-03-20T00:05:00.000Z',
    });
    expect(repo.getAttempt(liveAttempt.id)).toMatchObject({
      status: 'failed',
      stopReason: 'dispatcher_restart_unattached_pid',
    });
    expect(repo.getTrackedAgent(liveAgent.id)).toMatchObject({ status: 'failed', dispatchRunId: liveRun.id });

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
    expect(repo.getRun(terminalAttemptRun.id)).toMatchObject({
      status: 'completed',
      finishedAt: '2026-03-20T00:04:00.000Z',
      latestExitCode: 0,
    });
    expect(repo.getTrackedAgent(terminalAttemptAgent.id)).toMatchObject({ status: 'completed', dispatchRunId: terminalAttemptRun.id });

    expect(repo.listEvents(deadRun.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'run.reconciliation.dispatcher_restart',
        payload: expect.objectContaining({ code: 'stale-running-attempt-failed' }),
      }),
    ]));
  });

  it('does not relink an agent to an older terminal run when a newer run already owns dispatch', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'replacement worker');

    const oldRun = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'old', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    repo.updateRun(oldRun.id, {
      status: 'completed',
      finishedAt: '2026-03-20T00:03:00.000Z',
    });
    const newRun = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'replacement', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:02.000Z',
    });
    repo.createAttempt(newRun.id, { status: 'pending_approval' });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: () => false,
    });

    expect(report.findings.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'pending-approval-restored',
      'terminal-run-restored',
    ]));
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'awaiting_approval',
      dispatchRunId: newRun.id,
    });
  });
});
