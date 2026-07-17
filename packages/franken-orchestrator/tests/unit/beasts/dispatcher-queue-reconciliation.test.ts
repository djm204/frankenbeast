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
    initConfig: { identity: { name }, labels: ['reconciliation'],
        agentRole: 'coding',
        requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'],},
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
      executorMetadata: {
        processGroupOwned: true,
        processGroupLeaderPid: 4242,
        processStartTimeTicks: '4242-start',
      },
    });
    repo.updateRun(liveRun.id, {
      status: 'running',
      finishedAt: '2026-03-20T00:00:30.000Z',
      latestExitCode: 1,
      stopReason: 'previous_failure',
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
      getProcessStartTimeTicks: (pid) => pid === 4242 ? '4242-start' : undefined,
    });

    expect(report.checkedRuns).toBe(6);
    expect(report.findings.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'live-running-attempt-quarantined',
      'stale-running-attempt-failed',
      'queued-run-restored',
      'pending-approval-restored',
      'terminal-run-restored',
      'terminal-attempt-restored',
    ]));
    expect(repo.getRun(liveRun.id)).toMatchObject({
      status: 'running',
      currentAttemptId: liveAttempt.id,
    });
    expect(repo.getRun(liveRun.id)?.finishedAt).toBeUndefined();
    expect(repo.getRun(liveRun.id)?.latestExitCode).toBeUndefined();
    expect(repo.getRun(liveRun.id)?.stopReason).toBeUndefined();
    expect(repo.getAttempt(liveAttempt.id)).toMatchObject({ status: 'running', pid: 4242 });
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

  it('does not relink an agent to an older queued run when a newer run already owns dispatch', async () => {
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
    ]));
    expect(report.findings.map(finding => finding.code)).not.toContain('queued-run-restored');
    expect(repo.getRun(oldRun.id)).toMatchObject({ status: 'queued' });
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'awaiting_approval',
      dispatchRunId: newRun.id,
    });
  });

  it('reports duplicate owned live processes for the same tracked agent before mutating restart state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
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
    const attemptOne = repo.createAttempt(runOne.id, {
      status: 'running',
      pid: 1111,
      executorMetadata: {
        processGroupOwned: true,
        processGroupLeaderPid: 1111,
        processStartTimeTicks: '1111-start',
      },
    });
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
    const attemptTwo = repo.createAttempt(runTwo.id, {
      status: 'running',
      pid: 2222,
      executorMetadata: {
        processGroupOwned: true,
        processGroupLeaderPid: 2222,
        processStartTimeTicks: '2222-start',
      },
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: (pid) => pid === 1111 || pid === 2222,
      getProcessStartTimeTicks: (pid) => `${pid}-start`,
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

  it('fails closed when a live PID does not match the attempt process ownership metadata', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'pid reuse worker');

    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'pid reuse', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'running',
      pid: 3333,
      executorMetadata: {
        processGroupOwned: true,
        processGroupLeaderPid: 3333,
        processStartTimeTicks: 'original-start',
      },
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: (pid) => pid === 3333,
      getProcessStartTimeTicks: () => 'reused-start',
    });

    expect(report.findings.map(finding => finding.code)).toContain('stale-running-attempt-failed');
    expect(repo.getRun(run.id)).toMatchObject({ status: 'failed', stopReason: 'dispatcher_restart_stale_pid' });
    expect(repo.getAttempt(attempt.id)).toMatchObject({ status: 'failed', stopReason: 'dispatcher_restart_stale_pid' });
  });

  it('restores terminal current attempts before preserving pending approval state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'stopped approval worker');
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'approval stop', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'stopped',
    });
    repo.updateAttempt(attempt.id, {
      status: 'stopped',
      stopReason: 'operator_kill',
      finishedAt: '2026-03-20T00:02:00.000Z',
    });
    repo.updateRun(run.id, { status: 'pending_approval' });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: () => false,
    });

    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'terminal-attempt-restored',
      runId: run.id,
      attemptId: attempt.id,
      toStatus: 'stopped',
    }));
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'stopped',
      stopReason: 'operator_kill',
      finishedAt: '2026-03-20T00:02:00.000Z',
    });
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({ status: 'stopped', dispatchRunId: run.id });
  });

  it('does not log reconciliation events for already-linked queued runs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'already queued worker');
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'queued', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    repo.updateTrackedAgent(agent.id, {
      status: 'dispatching',
      dispatchRunId: run.id,
      updatedAt: '2026-03-20T00:00:02.000Z',
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: () => false,
    });

    expect(report.findings.map(finding => finding.code)).not.toContain('queued-run-restored');
    expect(repo.listEvents(run.id).some(event => event.type === 'run.reconciliation.dispatcher_restart')).toBe(false);
  });

  it('clears stale exit metadata when failing running runs with missing attempts', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'missing attempt worker');
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'missing attempt', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    repo.updateRun(run.id, {
      status: 'running',
      currentAttemptId: 'attempt_missing',
      latestExitCode: 42,
      finishedAt: '2026-03-20T00:00:30.000Z',
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: () => false,
    });

    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'missing-running-attempt-failed',
      runId: run.id,
    }));
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'failed',
      stopReason: 'dispatcher_restart_missing_attempt',
      finishedAt: '2026-03-20T00:05:00.000Z',
    });
    expect(repo.getRun(run.id)?.currentAttemptId).toBeUndefined();
    expect(repo.getRun(run.id)?.latestExitCode).toBeUndefined();
  });

  it('quarantines live legacy attempts that predate process ownership metadata', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'legacy live worker');
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'legacy', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'running',
      pid: 5555,
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: (pid) => pid === 5555,
    });

    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'live-running-attempt-quarantined',
      runId: run.id,
      attemptId: attempt.id,
      pid: 5555,
    }));
    expect(repo.getRun(run.id)).toMatchObject({ status: 'running', currentAttemptId: attempt.id });
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({ status: 'running', dispatchRunId: run.id });
  });

  it('preserves owned process groups when the original group leader has exited', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-dispatcher-reconcile-'));
    const repo = createRepo(workDir);
    const agent = createAgent(repo, 'process group worker');
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { objective: 'group', chunkDirectory: '.' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:01.000Z',
    });
    repo.createAttempt(run.id, {
      status: 'running',
      pid: 4444,
      executorMetadata: {
        processGroupOwned: true,
        processGroupLeaderPid: 4444,
        processStartTimeTicks: '4444-start',
      },
    });

    const report = reconcileDispatcherQueueAfterRestart(repo, {
      now: () => '2026-03-20T00:05:00.000Z',
      isPidAlive: () => false,
      getProcessStartTimeTicks: () => undefined,
      isProcessGroupAlive: (pid) => pid === 4444,
    });

    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'live-running-attempt-quarantined',
      runId: run.id,
      pid: 4444,
    }));
    expect(repo.getRun(run.id)).toMatchObject({ status: 'running' });
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({ status: 'running', dispatchRunId: run.id });
  });
});
