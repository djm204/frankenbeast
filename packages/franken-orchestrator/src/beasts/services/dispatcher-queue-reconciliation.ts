import { readFileSync } from 'node:fs';
import type { BeastRun, BeastRunAttempt, BeastRunStatus, TrackedAgentStatus } from '../types.js';
import {
  BeastRepositoryJsonCorruptionError,
  type BeastRunProcessReference,
  SQLiteBeastRepository,
} from '../repository/sqlite-beast-repository.js';
import { isoNow } from '@franken/types';

export type DispatcherQueueReconciliationCode =
  | 'queued-run-restored'
  | 'live-running-attempt-quarantined'
  | 'terminal-attempt-restored'
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
  readonly getProcessStartTimeTicks?: (pid: number) => string | undefined;
  readonly isProcessGroupAlive?: (pid: number) => boolean;
}

const ACTIVE_RUN_STATUSES = new Set<BeastRunStatus>(['queued', 'interviewing', 'running', 'pending_approval']);
const TERMINAL_RUN_STATUSES = new Set<BeastRunStatus>(['completed', 'failed', 'stopped']);
const CORRUPT_ATTEMPT = Symbol('corrupt-attempt');

function getAttemptForReconciliation(
  repository: SQLiteBeastRepository,
  attemptId: string,
): BeastRunAttempt | undefined | typeof CORRUPT_ATTEMPT {
  try {
    return repository.getAttempt(attemptId);
  } catch (error) {
    if (!(error instanceof BeastRepositoryJsonCorruptionError)) throw error;
    console.warn(
      `Skipping restart reconciliation for corrupt Beast JSON in ${error.context.table}.${error.context.column} for row ${error.context.rowId}; persisted state was left unchanged for operator repair.`,
    );
    return CORRUPT_ATTEMPT;
  }
}

export function reconcileDispatcherQueueAfterRestart(
  repository: SQLiteBeastRepository,
  options: DispatcherQueueReconciliationOptions = {},
): DispatcherQueueReconciliationReport {
  const now = options.now ?? isoNow;
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
  const getProcessStartTimeTicks = options.getProcessStartTimeTicks ?? defaultProcessStartTimeTicks;
  const isProcessGroupAlive = options.isProcessGroupAlive ?? defaultIsProcessGroupAlive;
  const reconciledAt = now();
  const findings: DispatcherQueueReconciliationFinding[] = [];
  let changedRuns = 0;

  repository.transaction(() => {
    const duplicates = detectDuplicateLiveAgentRuns(
      repository,
      isPidAlive,
      getProcessStartTimeTicks,
      isProcessGroupAlive,
    );
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

    for (const run of repository.listRuns({ recoverCorruptJson: true })) {
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        const finding = reconcileTerminalRun(repository, run, reconciledAt);
        if (finding) findings.push(finding);
        continue;
      }

      if (!ACTIVE_RUN_STATUSES.has(run.status)) {
        continue;
      }

      const currentAttempt = run.currentAttemptId
        ? getAttemptForReconciliation(repository, run.currentAttemptId)
        : undefined;
      if (currentAttempt === CORRUPT_ATTEMPT) continue;
      const finding = reconcileActiveRun(
        repository,
        run,
        currentAttempt,
        reconciledAt,
        isPidAlive,
        getProcessStartTimeTicks,
        isProcessGroupAlive,
      );
      if (!finding) continue;
      findings.push(finding);
      if (finding.fromStatus !== finding.toStatus || finding.code === 'missing-running-attempt-failed' || finding.code === 'stale-running-attempt-failed') {
        changedRuns += 1;
      }
    }
  });

  return {
    checkedRuns: repository.listRunProcessReferences().length,
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
  getProcessStartTimeTicks: (pid: number) => string | undefined,
  isProcessGroupAlive: (pid: number) => boolean,
): DispatcherQueueReconciliationFinding | undefined {
  if (attempt && TERMINAL_RUN_STATUSES.has(attempt.status)) {
    const restoredRun = repository.updateRun(run.id, {
      status: attempt.status,
      finishedAt: attempt.finishedAt ?? reconciledAt,
      latestExitCode: attempt.exitCode ?? null,
      stopReason: attempt.stopReason ?? null,
    });
    syncTrackedAgentIfRunOwnsDispatch(repository, restoredRun, trackedAgentStatusForRun(attempt.status), reconciledAt);
    const finding: DispatcherQueueReconciliationFinding = {
      code: 'terminal-attempt-restored',
      runId: run.id,
      trackedAgentId: run.trackedAgentId,
      attemptId: attempt.id,
      pid: attempt.pid,
      fromStatus: run.status,
      toStatus: attempt.status,
      message: `Run ${run.id} was ${run.status} but its current attempt was already ${attempt.status}; restored the persisted terminal attempt result.`,
    };
    appendReconciliationEvent(repository, finding, reconciledAt);
    return finding;
  }

  if (run.status === 'pending_approval') {
    if (!syncTrackedAgentIfRunOwnsDispatch(repository, run, 'awaiting_approval', reconciledAt)) {
      return undefined;
    }
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
    if (!syncTrackedAgentIfRunOwnsDispatch(repository, run, 'dispatching', reconciledAt)) {
      return undefined;
    }
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
      latestExitCode: null,
      stopReason: 'dispatcher_restart_missing_attempt',
    });
    syncTrackedAgentIfRunOwnsDispatch(repository, failedRun, 'failed', reconciledAt);
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
  if (attemptOwnsLiveProcess(attempt, isPidAlive, getProcessStartTimeTicks, isProcessGroupAlive)) {
    const liveRun = repository.updateRun(run.id, {
      status: 'running',
      finishedAt: null,
      latestExitCode: null,
      stopReason: null,
    });
    syncTrackedAgentIfRunOwnsDispatch(repository, liveRun, 'running', reconciledAt);
    const finding: DispatcherQueueReconciliationFinding = {
      code: 'live-running-attempt-quarantined',
      runId: run.id,
      trackedAgentId: run.trackedAgentId,
      attemptId: attempt.id,
      pid,
      fromStatus: run.status,
      toStatus: run.status,
      message: `Run ${run.id} recorded live PID ${pid} after dispatcher restart; preserved it as non-startable running state for operator reconciliation.`,
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
  syncTrackedAgentIfRunOwnsDispatch(repository, failedRun, 'failed', reconciledAt);
  const finding: DispatcherQueueReconciliationFinding = {
    code: typeof pid === 'number' && pid > 0 ? 'stale-running-attempt-failed' : 'missing-running-attempt-failed',
    runId: run.id,
    trackedAgentId: run.trackedAgentId,
    attemptId: attempt.id,
    pid,
    fromStatus: run.status,
    toStatus: 'failed',
    message: typeof pid === 'number' && pid > 0
      ? `Run ${run.id} recorded PID ${pid}, but the restarted dispatcher cannot reattach exit handling safely; marked failed for retry.`
      : `Run ${run.id} was running with no positive PID after dispatcher restart; marked failed for retry.`,
  };
  appendReconciliationEvent(repository, finding, reconciledAt);
  return finding;
}

function reconcileTerminalRun(
  repository: SQLiteBeastRepository,
  run: BeastRun,
  reconciledAt: string,
): DispatcherQueueReconciliationFinding | undefined {
  if (!syncTrackedAgentIfRunOwnsDispatch(repository, run, trackedAgentStatusForRun(run.status), reconciledAt)) {
    return undefined;
  }
  const finding: DispatcherQueueReconciliationFinding = {
    code: 'terminal-run-restored',
    runId: run.id,
    trackedAgentId: run.trackedAgentId,
    attemptId: run.currentAttemptId,
    fromStatus: run.status,
    toStatus: run.status,
    message: `Run ${run.id} is terminal (${run.status}) after dispatcher restart; repaired tracked agent linkage.`,
  };
  appendReconciliationEvent(repository, finding, reconciledAt);
  return finding;
}

function detectDuplicateLiveAgentRuns(
  repository: SQLiteBeastRepository,
  isPidAlive: (pid: number) => boolean,
  getProcessStartTimeTicks: (pid: number) => string | undefined,
  isProcessGroupAlive: (pid: number) => boolean,
): DispatcherQueueReconciliationFinding[] {
  const liveRunsByAgent = new Map<string, Array<{ run: BeastRunProcessReference; attempt: BeastRunAttempt; pid: number }>>();
  for (const run of repository.listRunProcessReferences()) {
    if (!run.trackedAgentId || run.status !== 'running' || !run.currentAttemptId) continue;
    const attempt = getAttemptForReconciliation(repository, run.currentAttemptId);
    if (attempt === CORRUPT_ATTEMPT) continue;
    const pid = attempt?.pid;
    if (!attempt || typeof pid !== 'number' || pid <= 0 || !attemptOwnsLiveProcess(
      attempt,
      isPidAlive,
      getProcessStartTimeTicks,
      isProcessGroupAlive,
    )) continue;
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

function syncTrackedAgentIfRunOwnsDispatch(
  repository: SQLiteBeastRepository,
  run: BeastRun,
  status: TrackedAgentStatus,
  updatedAt: string,
): boolean {
  if (!run.trackedAgentId) return false;
  const agent = repository.getTrackedAgent(run.trackedAgentId, { recoverCorruptJson: true });
  if (!agent || agent.status === 'deleted') return false;
  if (agent.dispatchRunId && agent.dispatchRunId !== run.id) return false;
  if (agent.status === status && agent.dispatchRunId === run.id) return false;
  syncTrackedAgent(repository, run, status, updatedAt);
  return true;
}

function syncTrackedAgent(
  repository: SQLiteBeastRepository,
  run: BeastRun,
  status: TrackedAgentStatus,
  updatedAt: string,
): void {
  if (!run.trackedAgentId) return;
  const agent = repository.getTrackedAgent(run.trackedAgentId, { recoverCorruptJson: true });
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

function defaultProcessStartTimeTicks(pid: number): string | undefined {
  if (pid <= 0 || process.platform !== 'linux') return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const endOfCommand = stat.lastIndexOf(')');
    if (endOfCommand < 0) return undefined;
    const fieldsFromState = stat.slice(endOfCommand + 2).trim().split(/\s+/);
    return fieldsFromState[19];
  } catch {
    return undefined;
  }
}

function attemptOwnsLiveProcess(
  attempt: BeastRunAttempt,
  isPidAlive: (pid: number) => boolean,
  getProcessStartTimeTicks: (pid: number) => string | undefined,
  isProcessGroupAlive: (pid: number) => boolean,
): boolean {
  const pid = attempt.pid;
  if (typeof pid !== 'number' || pid <= 0) return false;
  const metadata = attempt.executorMetadata;
  const hasOwnershipMetadata = metadata?.processGroupOwned !== undefined
    || metadata?.processGroupLeaderPid !== undefined
    || metadata?.processStartTimeTicks !== undefined;
  if (metadata?.processGroupOwned !== true || metadata?.processGroupLeaderPid !== pid) {
    return !hasOwnershipMetadata && isPidAlive(pid);
  }
  const expectedStartTime = metadata.processStartTimeTicks;
  if (typeof expectedStartTime !== 'string' || expectedStartTime.length === 0) {
    return isPidAlive(pid);
  }
  if (isPidAlive(pid)) {
    return getProcessStartTimeTicks(pid) === expectedStartTime;
  }
  return isProcessGroupAlive(pid);
}

function defaultIsProcessGroupAlive(pid: number): boolean {
  if (pid <= 0 || process.platform === 'win32') return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
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
