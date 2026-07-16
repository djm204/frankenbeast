import type { BeastRun, BeastRunAttempt, BeastRunStatus, TrackedAgentStatus } from '../types.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import { isoNow } from '@franken/types';

export type DispatcherQueueReconciliationCode =
  | 'queued-run-restored'
  | 'live-running-attempt-restored'
  | 'stale-running-attempt-failed'
  | 'missing-running-attempt-failed'
  | 'pending-approval-restored'
  | 'terminal-run-restored'
  | 'duplicate-live-agent-run';

export interface DispatcherQueueReconciliationFinding {
  readonly code: DispatcherQueueReconciliationCode;
  readonly runId: string;
  readonly trackedAgentId?: string | undefined;
  readonly attemptId?: string | undefined;
  readonly pid?: number | undefined;
  readonly fromStatus: BeastRunStatus;
  readonly toStatus: BeastRunStatus;
  readonly message: string;
}

export interface DispatcherQueueReconciliationReport {
  readonly checkedRuns: number;
  readonly findings: readonly DispatcherQueueReconciliationFinding[];
  readonly changedRuns: number;
  readonly duplicateLiveAgentRunCount: number;
  readonly reconciledAt: string;
}

export interface DispatcherQueueReconciliationOptions {
  readonly now?: () => string;
  readonly isPidAlive?: (pid: number) => boolean;
}

const ACTIVE_RUN_STATUSES = new Set<BeastRunStatus>(['queued', 'interviewing', 'running', 'pending_approval']);
const TERMINAL_RUN_STATUSES = new Set<BeastRunStatus>(['completed', 'failed', 'stopped']);

export function reconcileDispatcherQueueAfterRestart(
  repository: SQLiteBeastRepository,
  options: DispatcherQueueReconciliationOptions = {},
): DispatcherQueueReconciliationReport {
  const now = options.now ?? isoNow;
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
  const reconciledAt = now();
  const findings: DispatcherQueueReconciliationFinding[] = [];
  let changedRuns = 0;

  repository.transaction(() => {
    for (const run of repository.listRuns()) {
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        findings.push(reconcileTerminalRun(repository, run, reconciledAt));
        continue;
      }

      if (!ACTIVE_RUN_STATUSES.has(run.status)) {
        continue;
      }

      const currentAttempt = run.currentAttemptId ? repository.getAttempt(run.currentAttemptId) : undefined;
      const finding = reconcileActiveRun(repository, run, currentAttempt, reconciledAt, isPidAlive);
      findings.push(finding);
      if (finding.fromStatus !== finding.toStatus || finding.code === 'missing-running-attempt-failed' || finding.code === 'stale-running-attempt-failed') {
        changedRuns += 1;
      }
    }

    const duplicates = detectDuplicateLiveAgentRuns(repository, isPidAlive);
    for (const duplicate of duplicates) {
      findings.push(duplicate);
      repository.appendEvent(duplicate.runId, {
        attemptId: duplicate.attemptId,
        type: 'run.reconciliation.duplicate_live_agent_run',
        payload: {
          code: duplicate.code,
          trackedAgentId: duplicate.trackedAgentId,
          pid: duplicate.pid,
          message: duplicate.message,
        },
        createdAt: reconciledAt,
      });
    }
  });

  return {
    checkedRuns: repository.listRuns().length,
    findings,
    changedRuns,
    duplicateLiveAgentRunCount: findings.filter((finding) => finding.code === 'duplicate-live-agent-run').length,
    reconciledAt,
  };
}

function reconcileActiveRun(
  repository: SQLiteBeastRepository,
  run: BeastRun,
  attempt: BeastRunAttempt | undefined,
  reconciledAt: string,
  isPidAlive: (pid: number) => boolean,
): DispatcherQueueReconciliationFinding {
  if (run.status === 'pending_approval') {
    syncTrackedAgent(repository, run, 'awaiting_approval', reconciledAt);
    const finding: DispatcherQueueReconciliationFinding = {
      code: 'pending-approval-restored',
      runId: run.id,
      trackedAgentId: run.trackedAgentId,
      attemptId: attempt?.id,
      pid: attempt?.pid,
      fromStatus: run.status,
      toStatus: run.status,
      message: `Run ${run.id} remains pending approval after dispatcher restart; no worker process is assumed live.`,
    };
    appendReconciliationEvent(repository, finding, reconciledAt);
    return finding;
  }

  if (run.status === 'queued' || run.status === 'interviewing') {
    syncTrackedAgent(repository, run, 'dispatching', reconciledAt);
    const finding: DispatcherQueueReconciliationFinding = {
      code: 'queued-run-restored',
      runId: run.id,
      trackedAgentId: run.trackedAgentId,
      attemptId: attempt?.id,
      pid: attempt?.pid,
      fromStatus: run.status,
      toStatus: run.status,
      message: `Run ${run.id} remains ${run.status} after dispatcher restart and is eligible for normal dispatch handling.`,
    };
    appendReconciliationEvent(repository, finding, reconciledAt);
    return finding;
  }

  if (!attempt) {
    const failedRun = repository.updateRun(run.id, {
      status: 'failed',
      finishedAt: reconciledAt,
      currentAttemptId: null,
      stopReason: 'dispatcher_restart_missing_attempt',
    });
    syncTrackedAgent(repository, failedRun, 'failed', reconciledAt);
    const finding: DispatcherQueueReconciliationFinding = {
      code: 'missing-running-attempt-failed',
      runId: run.id,
      trackedAgentId: run.trackedAgentId,
      fromStatus: run.status,
      toStatus: 'failed',
      message: `Run ${run.id} was running but had no current attempt after dispatcher restart; marked failed for retry instead of assuming in-memory state.`,
    };
    appendReconciliationEvent(repository, finding, reconciledAt);
    return finding;
  }

  const pid = attempt.pid;
  if (typeof pid === 'number' && pid > 0 && isPidAlive(pid)) {
    syncTrackedAgent(repository, run, 'running', reconciledAt);
    const finding: DispatcherQueueReconciliationFinding = {
      code: 'live-running-attempt-restored',
      runId: run.id,
      trackedAgentId: run.trackedAgentId,
      attemptId: attempt.id,
      pid,
      fromStatus: run.status,
      toStatus: run.status,
      message: `Run ${run.id} has a live recorded worker PID ${pid} after dispatcher restart.`,
    };
    appendReconciliationEvent(repository, finding, reconciledAt);
    return finding;
  }

  const failedAttempt = repository.updateAttempt(attempt.id, {
    status: 'failed',
    finishedAt: reconciledAt,
    stopReason: typeof pid === 'number' && pid > 0
      ? 'dispatcher_restart_stale_pid'
      : 'dispatcher_restart_missing_pid',
  });
  const failedRun = repository.updateRun(run.id, {
    status: 'failed',
    finishedAt: reconciledAt,
    latestExitCode: null,
    stopReason: failedAttempt.stopReason,
  });
  syncTrackedAgent(repository, failedRun, 'failed', reconciledAt);
  const finding: DispatcherQueueReconciliationFinding = {
    code: typeof pid === 'number' && pid > 0 ? 'stale-running-attempt-failed' : 'missing-running-attempt-failed',
    runId: run.id,
    trackedAgentId: run.trackedAgentId,
    attemptId: attempt.id,
    pid,
    fromStatus: run.status,
    toStatus: 'failed',
    message: typeof pid === 'number' && pid > 0
      ? `Run ${run.id} recorded PID ${pid}, but it is not live after dispatcher restart; marked failed for retry.`
      : `Run ${run.id} was running with no positive PID after dispatcher restart; marked failed for retry.`,
  };
  appendReconciliationEvent(repository, finding, reconciledAt);
  return finding;
}

function reconcileTerminalRun(
  repository: SQLiteBeastRepository,
  run: BeastRun,
  reconciledAt: string,
): DispatcherQueueReconciliationFinding {
  syncTrackedAgent(repository, run, trackedAgentStatusForRun(run.status), reconciledAt);
  const finding: DispatcherQueueReconciliationFinding = {
    code: 'terminal-run-restored',
    runId: run.id,
    trackedAgentId: run.trackedAgentId,
    attemptId: run.currentAttemptId,
    fromStatus: run.status,
    toStatus: run.status,
    message: `Run ${run.id} is terminal (${run.status}) after dispatcher restart; terminal state preserved.`,
  };
  appendReconciliationEvent(repository, finding, reconciledAt);
  return finding;
}

function detectDuplicateLiveAgentRuns(
  repository: SQLiteBeastRepository,
  isPidAlive: (pid: number) => boolean,
): DispatcherQueueReconciliationFinding[] {
  const liveRunsByAgent = new Map<string, Array<{ run: BeastRun; attempt: BeastRunAttempt; pid: number }>>();
  for (const run of repository.listRuns()) {
    if (!run.trackedAgentId || run.status !== 'running' || !run.currentAttemptId) continue;
    const attempt = repository.getAttempt(run.currentAttemptId);
    const pid = attempt?.pid;
    if (!attempt || typeof pid !== 'number' || pid <= 0 || !isPidAlive(pid)) continue;
    const existing = liveRunsByAgent.get(run.trackedAgentId) ?? [];
    existing.push({ run, attempt, pid });
    liveRunsByAgent.set(run.trackedAgentId, existing);
  }

  return [...liveRunsByAgent.entries()].flatMap(([trackedAgentId, entries]) => {
    if (entries.length <= 1) return [];
    const runIds = entries.map(entry => entry.run.id);
    return entries.map(({ run, attempt, pid }) => ({
      code: 'duplicate-live-agent-run' as const,
      runId: run.id,
      trackedAgentId,
      attemptId: attempt.id,
      pid,
      fromStatus: run.status,
      toStatus: run.status,
      message: `Tracked agent ${trackedAgentId} has duplicate live running runs after dispatcher restart: ${runIds.join(', ')}.`,
    }));
  });
}

function syncTrackedAgent(
  repository: SQLiteBeastRepository,
  run: BeastRun,
  status: TrackedAgentStatus,
  updatedAt: string,
): void {
  if (!run.trackedAgentId) return;
  const agent = repository.getTrackedAgent(run.trackedAgentId);
  if (!agent || agent.status === 'deleted') return;
  if (agent.status === status && agent.dispatchRunId === run.id) return;
  repository.updateTrackedAgent(run.trackedAgentId, {
    status,
    dispatchRunId: run.id,
    updatedAt,
  });
  repository.appendTrackedAgentEvent(run.trackedAgentId, {
    level: status === 'failed' ? 'error' : 'info',
    type: 'agent.dispatch.reconciled',
    message: `Dispatcher restart reconciled agent ${run.trackedAgentId} to ${status}`,
    payload: { runId: run.id, status },
    createdAt: updatedAt,
  });
}

function appendReconciliationEvent(
  repository: SQLiteBeastRepository,
  finding: DispatcherQueueReconciliationFinding,
  createdAt: string,
): void {
  repository.appendEvent(finding.runId, {
    attemptId: finding.attemptId,
    type: 'run.reconciliation.dispatcher_restart',
    payload: {
      code: finding.code,
      fromStatus: finding.fromStatus,
      toStatus: finding.toStatus,
      trackedAgentId: finding.trackedAgentId,
      pid: finding.pid,
      message: finding.message,
    },
    createdAt,
  });
}

function trackedAgentStatusForRun(status: BeastRunStatus): TrackedAgentStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'pending_approval':
      return 'awaiting_approval';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'queued':
    case 'interviewing':
      return 'dispatching';
    case 'stopped':
      return 'stopped';
  }
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
