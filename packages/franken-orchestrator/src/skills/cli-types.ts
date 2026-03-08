/**
 * CLI skill types for Martin-loop orchestration.
 * Types and interfaces only — no implementation code.
 */

export interface IterationResult {
  readonly iteration: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly rateLimited: boolean;
  readonly promiseDetected: boolean;
  readonly tokensEstimated: number;
  readonly sleepMs: number;
}

export interface MartinLoopConfig {
  readonly prompt: string;
  readonly promiseTag: string;
  readonly maxIterations: number;
  readonly maxTurns: number;
  readonly provider: string;
  readonly command?: string | undefined;
  readonly timeoutMs: number;
  readonly workingDir?: string | undefined;
  readonly abortSignal?: AbortSignal | undefined;
  readonly providers?: readonly string[] | undefined;
  readonly onRateLimit?: ((provider: string) => string | undefined) | undefined;
  readonly onIteration?: ((iteration: number, result: IterationResult) => void) | undefined;
  readonly onSleep?: ((durationMs: number, source: string) => void) | undefined;
  readonly onProviderAttempt?: ((provider: string, iteration: number) => void) | undefined;
  readonly onProviderSwitch?: ((fromProvider: string, toProvider: string, reason: 'rate-limit' | 'post-sleep-reset') => void) | undefined;
  readonly onSpawnError?: ((provider: string, error: string) => void) | undefined;
  readonly onProviderTimeout?: ((provider: string, timeoutMs: number) => void) | undefined;
  /** @internal Injected sleep function for testing — do not use in production. */
  readonly _sleepFn?: ((ms: number) => Promise<void>) | undefined;
}

export interface MartinLoopResult {
  readonly completed: boolean;
  readonly iterations: number;
  readonly output: string;
  readonly tokensUsed: number;
}

export interface GitIsolationConfig {
  readonly baseBranch: string;
  readonly branchPrefix: string;
  readonly autoCommit: boolean;
  readonly workingDir: string;
}

export interface MergeResult {
  readonly merged: boolean;
  readonly commits: number;
  readonly conflicted?: boolean;
  readonly conflictFiles?: readonly string[];
}

export interface CliSkillConfig {
  readonly martin: MartinLoopConfig;
  readonly git: GitIsolationConfig;
  readonly budgetLimitUsd?: number | undefined;
}
