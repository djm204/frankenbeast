import type { BeastDefinition, BeastRun, BeastRunAttempt } from '../types.js';

export interface BeastExecutor {
  start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt>;
  stop(runId: string, attemptId: string): Promise<BeastRunAttempt>;
  kill(runId: string, attemptId: string): Promise<BeastRunAttempt>;
}
