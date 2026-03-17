import type { BeastDefinition, BeastRun, BeastRunAttempt } from '../types.js';

export interface StopOptions {
  timeoutMs?: number;
}

export interface BeastExecutor {
  start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt>;
  stop(runId: string, attemptId: string, options?: StopOptions): Promise<BeastRunAttempt>;
  kill(runId: string, attemptId: string): Promise<BeastRunAttempt>;
}
