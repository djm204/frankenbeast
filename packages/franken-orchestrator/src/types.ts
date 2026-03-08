import type { TokenSpend } from '@franken/types';

/** Phases of the Beast Loop pipeline. */
export type BeastPhase = 'ingestion' | 'planning' | 'execution' | 'closure';

/** Final result returned by BeastLoop.run(). */
export interface BeastResult {
  readonly sessionId: string;
  readonly projectId: string;
  readonly phase: BeastPhase;
  readonly status: 'completed' | 'failed' | 'aborted';
  readonly tokenSpend: TokenSpend;
  readonly planSummary?: string | undefined;
  readonly taskResults?: readonly TaskOutcome[] | undefined;
  readonly abortReason?: string | undefined;
  readonly error?: Error | undefined;
  readonly durationMs: number;
}

/** Outcome of a single task execution within the Beast Loop. */
export interface TaskOutcome {
  readonly taskId: string;
  readonly status: 'success' | 'failure' | 'skipped';
  readonly output?: unknown | undefined;
  readonly error?: string | undefined;
}

/** User input that initiates a Beast Loop run. */
export interface BeastInput {
  readonly projectId: string;
  readonly userInput: string;
  readonly sessionId?: string | undefined;
  readonly dryRun?: boolean | undefined;
}
