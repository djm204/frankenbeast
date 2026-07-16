export type ProcessCleanupFindingCode =
  | 'missing-pid'
  | 'stale-pid'
  | 'live-matching-worker'
  | 'wrong-command'
  | 'wrong-cwd'
  | 'wrong-uid'
  | 'wrong-args'
  | 'wrong-start-time'
  | 'duplicate-recorded-pid'
  | 'orphan-duplicate-process';

export type ProcessCleanupSeverity = 'info' | 'warning' | 'blocker';
export type ProcessCleanupStatus = 'clean' | 'review-required' | 'blocked';
export type ProcessCleanupActionKind = 'none' | 'clear-stale-pid' | 'terminate-orphan';

export interface ProcessCleanupAttemptSnapshot {
  readonly runId: string;
  readonly attemptId: string;
  readonly status: string;
  readonly pid?: number | undefined;
  readonly expectedCommand?: string | undefined;
  readonly expectedArgs?: readonly string[] | undefined;
  readonly expectedCwd?: string | undefined;
  readonly expectedUid?: number | undefined;
  readonly expectedStartTimeTicks?: string | undefined;
}

export interface ProcessTableEntry {
  readonly pid: number;
  readonly command: string;
  readonly args?: readonly string[] | undefined;
  readonly cwd?: string | undefined;
  readonly uid?: number | undefined;
  readonly startTimeTicks?: string | undefined;
}

export interface ProcessCleanupFinding {
  readonly code: ProcessCleanupFindingCode;
  readonly severity: ProcessCleanupSeverity;
  readonly runId: string;
  readonly attemptId: string;
  readonly pid?: number | undefined;
  readonly expectedCommand?: string | undefined;
  readonly actualCommand?: string | undefined;
  readonly expectedCwd?: string | undefined;
  readonly actualCwd?: string | undefined;
  readonly message: string;
}

export interface ProcessCleanupAction {
  readonly action: ProcessCleanupActionKind;
  readonly runId: string;
  readonly attemptId: string;
  readonly pid?: number | undefined;
  readonly requiresApproval: boolean;
  readonly wouldExecute: boolean;
  readonly reason: string;
}

export interface ProcessCleanupPlanOptions {
  readonly checkedAt: string;
  readonly dryRun?: boolean | undefined;
  readonly currentUid?: number | undefined;
  readonly approveTermination?: boolean | undefined;
  readonly attempts: readonly ProcessCleanupAttemptSnapshot[];
  readonly processes: readonly ProcessTableEntry[];
}

export interface ProcessCleanupPlanReport {
  readonly checkedAt: string;
  readonly wouldWrite: false;
  readonly status: ProcessCleanupStatus;
  readonly dryRun: boolean;
  readonly findings: readonly ProcessCleanupFinding[];
  readonly actions: readonly ProcessCleanupAction[];
  readonly operatorSummary: string;
}

function commandMatches(attempt: ProcessCleanupAttemptSnapshot, processEntry: ProcessTableEntry): boolean {
  return typeof attempt.expectedCommand === 'string' && attempt.expectedCommand === processEntry.command;
}

function cwdMatches(attempt: ProcessCleanupAttemptSnapshot, processEntry: ProcessTableEntry): boolean {
  return typeof attempt.expectedCwd === 'string' && attempt.expectedCwd === processEntry.cwd;
}

function uidMatches(
  attempt: ProcessCleanupAttemptSnapshot,
  processEntry: ProcessTableEntry,
  currentUid: number | undefined,
): boolean {
  const expectedUid = attempt.expectedUid ?? currentUid;
  return typeof expectedUid === 'number' && processEntry.uid === expectedUid;
}

function argsMatch(attempt: ProcessCleanupAttemptSnapshot, processEntry: ProcessTableEntry): boolean {
  if (!attempt.expectedArgs) return false;
  if (!processEntry.args) return false;
  return processEntry.args.length === attempt.expectedArgs.length
    && attempt.expectedArgs.every((arg, index) => processEntry.args?.[index] === arg);
}

function startTimeMatches(attempt: ProcessCleanupAttemptSnapshot, processEntry: ProcessTableEntry): boolean {
  return typeof attempt.expectedStartTimeTicks === 'string'
    && attempt.expectedStartTimeTicks.length > 0
    && attempt.expectedStartTimeTicks === processEntry.startTimeTicks;
}

function isLiveMatchingWorker(
  attempt: ProcessCleanupAttemptSnapshot,
  processEntry: ProcessTableEntry,
  currentUid: number | undefined,
): boolean {
  return commandMatches(attempt, processEntry)
    && cwdMatches(attempt, processEntry)
    && uidMatches(attempt, processEntry, currentUid)
    && argsMatch(attempt, processEntry)
    && startTimeMatches(attempt, processEntry);
}

function isMatchingOrphanCandidate(
  attempt: ProcessCleanupAttemptSnapshot,
  processEntry: ProcessTableEntry,
  currentUid: number | undefined,
): boolean {
  return commandMatches(attempt, processEntry)
    && cwdMatches(attempt, processEntry)
    && uidMatches(attempt, processEntry, currentUid)
    && argsMatch(attempt, processEntry)
    && typeof processEntry.startTimeTicks === 'string'
    && processEntry.startTimeTicks.length > 0;
}

function finding(input: ProcessCleanupFinding): ProcessCleanupFinding {
  return input;
}

function statusForFindings(findings: readonly ProcessCleanupFinding[]): ProcessCleanupStatus {
  if (findings.some((item) => item.severity === 'blocker')) return 'blocked';
  if (findings.some((item) => item.code !== 'live-matching-worker')) return 'review-required';
  return 'clean';
}

function summarize(report: Pick<ProcessCleanupPlanReport, 'status' | 'findings' | 'actions'>): string {
  const staleCount = report.findings.filter((item) => item.code === 'stale-pid').length;
  const orphanCount = report.findings.filter((item) => item.code === 'orphan-duplicate-process').length;
  const guardedSkips = report.findings.filter((item) => [
    'wrong-command',
    'wrong-cwd',
    'wrong-uid',
    'wrong-args',
    'wrong-start-time',
    'duplicate-recorded-pid',
  ].includes(item.code)).length;
  const planned = report.actions.filter((action) => action.action !== 'none').length;
  const evidenceRule = 'No orphan duplicate termination is planned without matching uid, cwd, command, args, and process-start evidence.';

  if (report.status === 'clean') {
    return `Process cleanup plan is clean; all inspected live attempts match their recorded PID, command, cwd, and owner. ${evidenceRule}`;
  }
  return `Process cleanup plan is ${report.status}: ${staleCount} stale PID(s), ${orphanCount} orphan duplicate(s), ${guardedSkips} guarded skip(s), ${planned} planned cleanup action(s). ${evidenceRule}`;
}

export function buildProcessCleanupPlan(options: ProcessCleanupPlanOptions): ProcessCleanupPlanReport {
  const dryRun = options.dryRun ?? true;
  const findings: ProcessCleanupFinding[] = [];
  const actions: ProcessCleanupAction[] = [];
  const processByPid = new Map(options.processes.map((entry) => [entry.pid, entry] as const));
  const recordedPidCounts = new Map<number, number>();
  for (const attempt of options.attempts) {
    if (typeof attempt.pid === 'number' && attempt.pid > 0) {
      recordedPidCounts.set(attempt.pid, (recordedPidCounts.get(attempt.pid) ?? 0) + 1);
    }
  }
  const claimedPids = new Set<number>();

  for (const attempt of options.attempts) {
    if (typeof attempt.pid !== 'number' || attempt.pid <= 0) {
      findings.push(finding({
        code: 'missing-pid',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        message: `Attempt ${attempt.attemptId} is ${attempt.status} but has no positive PID recorded.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        requiresApproval: false,
        wouldExecute: false,
        reason: 'Missing PID requires run-state reconciliation rather than process signaling.',
      });
      continue;
    }

    claimedPids.add(attempt.pid);
    const liveProcess = processByPid.get(attempt.pid);
    if (!liveProcess) {
      findings.push(finding({
        code: 'stale-pid',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        expectedCwd: attempt.expectedCwd,
        message: `Recorded PID ${attempt.pid} is not present in the process table.`,
      }));
      actions.push({
        action: 'clear-stale-pid',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: false,
        wouldExecute: false,
        reason: 'Dry-run would clear the stale attempt PID/run liveness pointer; no process signal is needed.',
      });
      continue;
    }

    if ((recordedPidCounts.get(attempt.pid) ?? 0) > 1) {
      findings.push(finding({
        code: 'duplicate-recorded-pid',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: liveProcess.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: liveProcess.cwd,
        message: `PID ${attempt.pid} is recorded by more than one live attempt snapshot.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: true,
        wouldExecute: false,
        reason: 'Duplicate PID ownership requires operator review to choose the surviving run/attempt before cleanup.',
      });
      continue;
    }

    if (!commandMatches(attempt, liveProcess)) {
      findings.push(finding({
        code: 'wrong-command',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: liveProcess.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: liveProcess.cwd,
        message: `PID ${attempt.pid} is live but command does not match the recorded Beast attempt.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: true,
        wouldExecute: false,
        reason: 'Wrong-command PID may be reused by an unrelated user process; skip termination and require manual investigation.',
      });
      continue;
    }

    if (!cwdMatches(attempt, liveProcess)) {
      findings.push(finding({
        code: 'wrong-cwd',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: liveProcess.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: liveProcess.cwd,
        message: `PID ${attempt.pid} is live with the expected command but a different cwd.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: true,
        wouldExecute: false,
        reason: 'Wrong-cwd PID may be a sibling or unrelated process; skip termination and require manual investigation.',
      });
      continue;
    }

    if (!uidMatches(attempt, liveProcess, options.currentUid)) {
      findings.push(finding({
        code: 'wrong-uid',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: liveProcess.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: liveProcess.cwd,
        message: `PID ${attempt.pid} is live with expected command/cwd but a different owner uid.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: true,
        wouldExecute: false,
        reason: 'Wrong-uid PID may be reused by another user; skip termination and require manual investigation.',
      });
      continue;
    }

    if (!argsMatch(attempt, liveProcess)) {
      findings.push(finding({
        code: 'wrong-args',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: liveProcess.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: liveProcess.cwd,
        message: `PID ${attempt.pid} is live with expected command/cwd/uid but different launch arguments.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: true,
        wouldExecute: false,
        reason: 'Wrong-args PID may be a different worker-looking process; skip termination and require manual investigation.',
      });
      continue;
    }

    if (!startTimeMatches(attempt, liveProcess)) {
      findings.push(finding({
        code: 'wrong-start-time',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: liveProcess.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: liveProcess.cwd,
        message: `PID ${attempt.pid} is live but the process start token does not match the recorded attempt.`,
      }));
      actions.push({
        action: 'none',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: attempt.pid,
        requiresApproval: true,
        wouldExecute: false,
        reason: 'Wrong-start-time PID may be PID reuse; skip termination and require manual investigation.',
      });
      continue;
    }

    findings.push(finding({
      code: 'live-matching-worker',
      severity: 'info',
      runId: attempt.runId,
      attemptId: attempt.attemptId,
      pid: attempt.pid,
      expectedCommand: attempt.expectedCommand,
      actualCommand: liveProcess.command,
      expectedCwd: attempt.expectedCwd,
      actualCwd: liveProcess.cwd,
      message: `PID ${attempt.pid} matches the recorded Beast worker command, cwd, and owner evidence.`,
    }));
    actions.push({
      action: 'none',
      runId: attempt.runId,
      attemptId: attempt.attemptId,
      pid: attempt.pid,
      requiresApproval: false,
      wouldExecute: false,
      reason: 'Worker appears live and owned; no cleanup planned.',
    });
  }

  const orphanPids = new Set<number>();
  for (const attempt of options.attempts) {
    if (!attempt.expectedCommand || !attempt.expectedCwd) continue;
    if (typeof attempt.pid === 'number' && (recordedPidCounts.get(attempt.pid) ?? 0) > 1) continue;
    const recordedProcess = typeof attempt.pid === 'number' ? processByPid.get(attempt.pid) : undefined;
    if (!recordedProcess || !isLiveMatchingWorker(attempt, recordedProcess, options.currentUid)) continue;
    for (const processEntry of options.processes) {
      if (claimedPids.has(processEntry.pid) || orphanPids.has(processEntry.pid)) continue;
      if (!isMatchingOrphanCandidate(attempt, processEntry, options.currentUid)) continue;
      orphanPids.add(processEntry.pid);
      findings.push(finding({
        code: 'orphan-duplicate-process',
        severity: 'warning',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: processEntry.pid,
        expectedCommand: attempt.expectedCommand,
        actualCommand: processEntry.command,
        expectedCwd: attempt.expectedCwd,
        actualCwd: processEntry.cwd,
        message: `PID ${processEntry.pid} matches Beast command/cwd/owner evidence but is not the recorded attempt PID.`,
      }));
      actions.push({
        action: 'terminate-orphan',
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        pid: processEntry.pid,
        requiresApproval: true,
        wouldExecute: !dryRun && options.approveTermination === true,
        reason: 'Duplicate orphan termination requires matching uid, cwd, and command evidence plus explicit operator approval.',
      });
    }
  }

  const status = statusForFindings(findings);
  const partialReport = { status, findings, actions };
  return {
    checkedAt: options.checkedAt,
    wouldWrite: false,
    dryRun,
    status,
    findings,
    actions,
    operatorSummary: summarize(partialReport),
  };
}

export function renderProcessCleanupDryRunPlan(report: ProcessCleanupPlanReport): string {
  const lines = [
    `DR process cleanup dry-run: ${report.status}`,
    `checkedAt=${report.checkedAt} wouldWrite=${String(report.wouldWrite)} dryRun=${String(report.dryRun)}`,
    report.operatorSummary,
    'findings:',
    ...report.findings.map((item) => {
      const pid = item.pid === undefined ? 'none' : String(item.pid);
      const expected = item.expectedCommand ? ` expected=${item.expectedCommand}` : '';
      const actual = item.actualCommand ? ` actual=${item.actualCommand}` : '';
      const cwd = item.expectedCwd ? ` cwd=${item.expectedCwd}` : '';
      const actualCwd = item.actualCwd ? ` actualCwd=${item.actualCwd}` : '';
      return `- ${item.code} run=${item.runId} attempt=${item.attemptId} pid=${pid}${expected}${actual}${cwd}${actualCwd}: ${item.message}`;
    }),
    'planned actions:',
    ...report.actions
      .filter((action) => action.action !== 'none')
      .map((action) => {
        const pid = action.pid === undefined ? 'none' : String(action.pid);
        const approval = action.requiresApproval ? 'required' : 'not-required';
        const mode = action.wouldExecute ? 'execute' : 'dry-run';
        return `- ${action.action} pid=${pid} approval=${approval} ${mode} run=${action.runId} attempt=${action.attemptId}: ${action.reason}`;
      }),
  ];
  if (report.actions.every((action) => action.action === 'none')) {
    lines.push('- none');
  }
  return `${lines.join('\n')}\n`;
}
