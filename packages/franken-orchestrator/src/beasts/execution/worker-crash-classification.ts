export type WorkerCrashKind =
  | 'clean_exit'
  | 'spawn_failure'
  | 'operator_stop'
  | 'operator_kill'
  | 'oom_killed'
  | 'signal_termination'
  | 'nonzero_exit'
  | 'runtime_error'
  | 'unknown_exit';

export type WorkerCrashSeverity = 'none' | 'info' | 'warning' | 'error' | 'critical';

export interface WorkerCrashClassificationInput {
  readonly code?: number | null | undefined;
  readonly signal?: string | null | undefined;
  readonly stopReason?: string | undefined;
  readonly spawnErrorCode?: string | undefined;
  readonly stderrTail?: readonly string[] | undefined;
}

export interface WorkerCrashClassification {
  readonly kind: WorkerCrashKind;
  readonly severity: WorkerCrashSeverity;
  readonly retryable: boolean;
  readonly summary: string;
  readonly operatorGuidance: string;
}

const OOM_PATTERNS = [
  /\bout of memory\b/i,
  /\boom\b/i,
  /\bheap out of memory\b/i,
  /\ballocation failed\b/i,
  /\bkilled process\b/i,
];

const RUNTIME_ERROR_PATTERNS = [
  /\buncaught(?: exception)?\b/i,
  /\bunhandled(?: promise)? rejection\b/i,
  /\btraceback\b/i,
  /\btypeerror\b/i,
  /\breferenceerror\b/i,
  /\bsyntaxerror\b/i,
  /\berror:\s+.+/i,
];

function stderrContains(stderrTail: readonly string[] | undefined, patterns: readonly RegExp[]): boolean {
  if (!stderrTail || stderrTail.length === 0) return false;
  const text = stderrTail.join('\n');
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyWorkerCrash(input: WorkerCrashClassificationInput): WorkerCrashClassification {
  const stopReason = input.stopReason;

  if (input.code === 0 && !input.signal && !stopReason) {
    return {
      kind: 'clean_exit',
      severity: 'none',
      retryable: false,
      summary: 'Worker process exited successfully.',
      operatorGuidance: 'No crash remediation is required.',
    };
  }

  if (stopReason === 'operator_stop') {
    return {
      kind: 'operator_stop',
      severity: 'info',
      retryable: false,
      summary: 'Worker process stopped after an operator-requested graceful stop.',
      operatorGuidance: 'Treat this as intentional unless the stop request was unexpected; inspect the operator action trail before restarting.',
    };
  }

  if (stopReason === 'operator_kill') {
    return {
      kind: 'operator_kill',
      severity: 'warning',
      retryable: false,
      summary: 'Worker process was force-killed by an operator action.',
      operatorGuidance: 'Do not auto-retry until the operator confirms the force-kill was not protecting shared state or credentials.',
    };
  }

  if (input.spawnErrorCode || stopReason === 'spawn_failed') {
    const detail = input.spawnErrorCode ? ` (${input.spawnErrorCode})` : '';
    return {
      kind: 'spawn_failure',
      severity: 'error',
      retryable: false,
      summary: `Worker process could not be spawned${detail}.`,
      operatorGuidance: 'Check command path, permissions, cwd containment, and runtime installation before retrying; repeated immediate retries will not repair missing dependencies.',
    };
  }

  if (input.signal === 'SIGKILL' || input.code === 137 || stderrContains(input.stderrTail, OOM_PATTERNS)) {
    return {
      kind: 'oom_killed',
      severity: 'critical',
      retryable: true,
      summary: 'Worker process appears to have been killed by the OS or runtime due to memory pressure.',
      operatorGuidance: 'Retry only with reduced concurrency or memory footprint; inspect host OOM logs and the stderr tail before marking the worker as flaky.',
    };
  }

  if (input.signal) {
    return {
      kind: 'signal_termination',
      severity: input.signal === 'SIGTERM' ? 'warning' : 'error',
      retryable: input.signal !== 'SIGTERM',
      summary: `Worker process terminated by signal ${input.signal}.`,
      operatorGuidance: 'Correlate the signal with supervisor stop/kill requests, host shutdowns, and container runtime events before retrying.',
    };
  }

  if (stderrContains(input.stderrTail, RUNTIME_ERROR_PATTERNS)) {
    return {
      kind: 'runtime_error',
      severity: 'error',
      retryable: true,
      summary: `Worker process exited with code ${input.code ?? 'unknown'} after emitting runtime error output.`,
      operatorGuidance: 'Use the redacted stderr tail as the primary debugging handle; retry only after the exception path is understood or the input has been corrected.',
    };
  }

  if (typeof input.code === 'number') {
    return {
      kind: 'nonzero_exit',
      severity: 'error',
      retryable: true,
      summary: `Worker process exited with code ${input.code}.`,
      operatorGuidance: 'Inspect logs and the run configuration; the exit code is deterministic evidence and should be preserved in handoffs.',
    };
  }

  return {
    kind: 'unknown_exit',
    severity: 'error',
    retryable: true,
    summary: 'Worker process exited without an exit code or signal.',
    operatorGuidance: 'Treat the run as ambiguous; inspect supervisor logs, host process state, and stream closure order before retrying.',
  };
}
