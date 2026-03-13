/**
 * CLI skill types for Martin-loop orchestration.
 * Types and interfaces only — no implementation code.
 */

import type { FileChunkSessionStore } from '../session/chunk-session-store.js';
import type { FileChunkSessionSnapshotStore } from '../session/chunk-session-snapshot-store.js';
import type { ChunkSessionRenderer } from '../session/chunk-session-renderer.js';
import type { ChunkSessionCompactor } from '../session/chunk-session-compactor.js';
import type { CommandFailure } from '../errors/command-failure.js';

export interface IterationResult {
  readonly iteration: number;
  readonly provider: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly rateLimited: boolean;
  readonly promiseDetected: boolean;
  readonly emittedPromiseTags?: readonly string[] | undefined;
  readonly tokensEstimated: number;
  readonly sleepMs: number;
  readonly failure?: CommandFailure | undefined;
}

export interface MartinLoopConfig {
  readonly prompt: string;
  readonly promiseTag: string;
  readonly maxIterations: number;
  readonly staleMateLimit?: number | undefined;
  readonly maxTurns: number;
  readonly provider: string;
  readonly command?: string | undefined;
  readonly timeoutMs: number;
  readonly workingDir?: string | undefined;
  readonly abortSignal?: AbortSignal | undefined;
  readonly providers?: readonly string[] | undefined;
  readonly planName?: string | undefined;
  readonly taskId?: string | undefined;
  readonly chunkId?: string | undefined;
  readonly sessionStore?: FileChunkSessionStore | undefined;
  readonly snapshotStore?: FileChunkSessionSnapshotStore | undefined;
  readonly renderer?: ChunkSessionRenderer | undefined;
  readonly compactor?: ChunkSessionCompactor | undefined;
  readonly contextUsage?: ((prompt: string, provider: string, maxTokens: number) => {
    usedTokens: number;
    maxTokens: number;
    usageRatio: number;
    threshold: number;
    shouldCompact: boolean;
  }) | undefined;
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
  readonly emittedPromiseTags?: readonly string[] | undefined;
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
