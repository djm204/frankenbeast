import { appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { BeastLoop } from '../beast-loop.js';
import { ChunkFileGraphBuilder } from '../planning/chunk-file-graph-builder.js';
import { ChunkFileWriter } from '../planning/chunk-file-writer.js';
import { getProjectPaths } from '../cli/project-root.js';
import type {
  PlanGraph,
  ICheckpointStore,
  ILogger,
  BeastLoopDeps,
  ISkillsModule,
  SkillDescriptor,
} from '../deps.js';
import { isoNow } from '@franken/types';
import type { GithubIssue, TriageResult, IssueOutcome } from './types.js';
import type { IssueGraphBuilder } from './issue-graph-builder.js';
import type { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import type { BeastResult } from '../types.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import type { CliSkillConfig } from '../skills/cli-types.js';
import type { PrCreator } from '../closure/pr-creator.js';

export interface IssueRuntimeArtifacts {
  readonly planName: string;
  readonly planDir: string;
  readonly checkpointFile: string;
  readonly logFile: string;
}

export interface IssueRuntimeSupport {
  planNameForIssue(issueNumber: number): string;
  checkpointForIssue(issueNumber: number): ICheckpointStore;
  artifactsForIssue(issueNumber: number): IssueRuntimeArtifacts;
}

export interface IssueBackpressureSignals {
  readonly activeProcesses: number;
  readonly failedStarts: number;
  readonly inFlightBacklog: number;
  readonly oldestQueueAgeMs?: number | undefined;
  readonly systemLoadAverage?: number | undefined;
  readonly providerBudgetTokensRemaining?: number | undefined;
  readonly pendingIssueCount?: number | undefined;
  readonly dependencyStatuses?: readonly IssueDependencySignal[] | undefined;
}

export type IssueDependencyStatus = 'healthy' | 'degraded' | 'unavailable';

export interface IssueDependencySignal {
  readonly dependency: string;
  readonly status: IssueDependencyStatus;
  readonly consecutiveFailures?: number | undefined;
  readonly openUntil?: string | number | Date | undefined;
  readonly error?: string | undefined;
}

export interface IssueDependencyCircuitBreakerConfig {
  readonly maxConsecutiveFailures?: number | undefined;
  readonly pauseOnStatuses?: readonly IssueDependencyStatus[] | undefined;
}

export interface IssueBackpressureSignalContext {
  readonly issue: GithubIssue;
  readonly index: number;
  readonly totalIssues: number;
  readonly pendingIssueCount: number;
  readonly cumulativeTokens: number;
  readonly budgetTokens: number;
  readonly providerBudgetTokensRemaining: number;
}

export type IssueBackpressureSignalSource = (
  context: IssueBackpressureSignalContext,
) => IssueBackpressureSignals | Promise<IssueBackpressureSignals>;

export interface IssueBackpressureThresholds {
  readonly maxActiveProcesses?: number | undefined;
  readonly maxFailedStarts?: number | undefined;
  readonly maxInFlightBacklog?: number | undefined;
  readonly maxPendingIssueCount?: number | undefined;
  readonly maxOldestQueueAgeMs?: number | undefined;
  readonly maxSystemLoadAverage?: number | undefined;
  readonly minProviderBudgetTokensRemaining?: number | undefined;
  /**
   * Optional dependency-specific circuit breakers. Each key is a dependency
   * name reported by `signals().dependencyStatuses`; only matching dependencies
   * can pause fresh starts, so a degraded non-critical dependency does not
   * silently stop unrelated work.
   */
  readonly dependencyCircuitBreakers?: Readonly<Record<string, IssueDependencyCircuitBreakerConfig>> | undefined;
  /**
   * Optional live alert ratio for capacity-style limits. For example, 0.8 emits
   * a warning when a signal reaches 80% of its configured limit while still
   * allowing the issue start until the hard threshold is exceeded/reached.
   */
  readonly capacityWatermarkRatio?: number | undefined;
}

export interface IssueCapacityWatermarkAlert {
  readonly signal: keyof IssueBackpressureSignals;
  readonly value: number;
  readonly threshold: number;
  readonly watermarkRatio: number;
  readonly message: string;
}

export interface IssueBackpressureConfig {
  readonly thresholds?: IssueBackpressureThresholds | undefined;
  readonly signals?: IssueBackpressureSignalSource | undefined;
}

export interface IssueBackpressureDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly signals: IssueBackpressureSignals;
  readonly alerts: readonly IssueCapacityWatermarkAlert[];
  readonly dependencyCircuitBreakers: readonly IssueDependencyCircuitBreakerState[];
}

export interface IssueDependencyCircuitBreakerState {
  readonly dependency: string;
  readonly status: IssueDependencyStatus;
  readonly state: 'closed' | 'open';
  readonly reason?: string | undefined;
  readonly retryAfterMs?: number | undefined;
}

export type IssueDegradedModeWorkerRouteAction =
  | 'start-fresh'
  | 'resume-checkpointed'
  | 'complete-checkpointed'
  | 'defer-fresh-start';

export interface IssueDegradedModeWorkerRoute {
  readonly mode: 'normal' | 'degraded';
  readonly action: IssueDegradedModeWorkerRouteAction;
  readonly issueNumber: number;
  readonly reason?: string | undefined;
  readonly guidance: string;
  readonly checkpointHasIssueProgress: boolean;
  readonly graphHasCheckpointProgress: boolean;
  readonly graphComplete: boolean;
}

export interface IssueDegradedModeWorkerRouteInput {
  readonly issue: GithubIssue;
  readonly checkpointHasIssueProgress: boolean;
  readonly graphHasCheckpointProgress?: boolean | undefined;
  readonly graphComplete?: boolean | undefined;
  readonly backpressureDecision?: IssueBackpressureDecision | undefined;
  readonly stopRemainingReason?: string | undefined;
}


export interface IssueWorkerCardProcessSnapshot {
  /** Stable Kanban/PM worker card id that owns this process. */
  readonly cardId: string;
  /** Operating-system process id observed by liveness tooling. */
  readonly pid: number;
  /** Optional run id for tools that distinguish multiple attempts on one card. */
  readonly runId?: string | undefined;
  /** Optional linked GitHub issue for operator summaries. */
  readonly issueNumber?: number | undefined;
  /** Worker owner, profile, or host label that reported the process. */
  readonly owner?: string | undefined;
  /** Runtime status reported by the worker/card process monitor. */
  readonly status?: string | undefined;
  /** Explicit liveness probe result; omitted means the snapshot is considered live. */
  readonly alive?: boolean | undefined;
  readonly startedAt?: string | number | Date | undefined;
  readonly lastHeartbeatAt?: string | number | Date | undefined;
  /** Monotonic heartbeat sequence recorded by the heartbeat writer. */
  readonly heartbeatSequence?: number | undefined;
  /** Writer/reader source for diagnostics when heartbeat state is stale or regressive. */
  readonly source?: string | undefined;
}

export interface WorkerHeartbeatMonotonicityFinding {
  readonly cardId: string;
  readonly runId?: string | undefined;
  readonly source: string;
  readonly severity: 'warning';
  readonly code: 'duplicate-heartbeat' | 'regressive-heartbeat';
  readonly priorSequence?: number | undefined;
  readonly newSequence?: number | undefined;
  readonly priorHeartbeatAt?: string | undefined;
  readonly newHeartbeatAt?: string | undefined;
  readonly message: string;
}

export interface DuplicateWorkerCardProcessFinding {
  readonly cardId: string;
  readonly severity: 'warning';
  readonly processCount: number;
  readonly pids: readonly number[];
  readonly runIds: readonly string[];
  readonly issueNumbers: readonly number[];
  readonly owners: readonly string[];
  readonly statuses: readonly string[];
  readonly newestStartedAt?: string | undefined;
  readonly lastHeartbeatAt?: string | undefined;
  readonly message: string;
  readonly guidance: string;
}

export interface IssueSchedulerFairnessBucket {
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'unprioritized';
  /** Sampled issue numbers for PM/liveness output; `count` is authoritative when this list is truncated. */
  readonly issueNumbers: readonly number[];
  readonly count: number;
  readonly issueNumbersTruncated?: true | undefined;
  readonly omittedIssueNumberCount?: number | undefined;
}

export interface IssueSchedulerFairnessReport {
  readonly totalIssues: number;
  /** Sampled severity-ordered issue numbers for PM/liveness output; `totalIssues` is authoritative when truncated. */
  readonly scheduledIssueNumbers: readonly number[];
  /** Sampled scheduling scores so PM/liveness output can explain effective priority decisions. */
  readonly effectivePriorities: readonly IssueSchedulingScore[];
  readonly buckets: readonly IssueSchedulerFairnessBucket[];
  readonly warnings: readonly string[];
  readonly scheduledIssueNumbersTruncated?: true | undefined;
  readonly omittedScheduledIssueNumberCount?: number | undefined;
  readonly warningsTruncated?: true | undefined;
  readonly omittedWarningCount?: number | undefined;
  readonly warningSummary?: readonly string[] | undefined;
}

export interface IssueSchedulerFairnessReportOptions {
  readonly maxIssueNumbersPerList?: number | undefined;
  readonly maxWarnings?: number | undefined;
  readonly nowMs?: number | undefined;
}

export type IssueBlockerStatus = 'eligible' | 'blocked' | 'hitl';
export type IssueFreshness = 'fresh' | 'normal' | 'stale' | 'unknown';

export interface IssueSchedulingScore {
  readonly issueNumber: number;
  readonly priority: IssueSchedulerFairnessBucket['severity'];
  readonly priorityRank: number;
  readonly effectivePriorityRank: number;
  readonly ageDays: number;
  readonly ageBoost: number;
  readonly blockerStatus: IssueBlockerStatus;
  readonly riskLane: string;
  readonly freshness: IssueFreshness;
  readonly score: number;
  readonly explanation: string;
}

export interface IssueRunnerConfig {
  readonly issues: readonly GithubIssue[];
  readonly triageResults: readonly TriageResult[];
  readonly graphBuilder: IssueGraphBuilder;
  readonly fullDeps: BeastLoopDeps;
  readonly git: GitBranchIsolator;
  readonly logger?: ILogger | undefined;
  readonly budget: number;
  readonly repo: string;
  readonly issueRuntime?: IssueRuntimeSupport | undefined;
  readonly checkpoint?: ICheckpointStore | undefined;
  readonly timeoutMs?: number | undefined;
  readonly enableTracing?: boolean | undefined;
  readonly backpressure?: IssueBackpressureConfig | undefined;
}

const SEVERITY_ORDER: Record<string, number> = {
  p0: 0,
  'priority:p0': 0,
  critical: 0,
  p1: 1,
  'priority:p1': 1,
  high: 1,
  p2: 2,
  'priority:p2': 2,
  medium: 2,
  p3: 3,
  'priority:p3': 3,
  low: 3,
};

const NO_SEVERITY = 4;
const TOKENS_PER_DOLLAR = 1_000_000;
const ONE_SHOT_MAX_ITERATIONS = 50;
const ONE_SHOT_STALE_MATE_LIMIT = 3;
const DEFAULT_SCHEDULER_FAIRNESS_ISSUE_NUMBER_LIMIT = 50;
const DEFAULT_SCHEDULER_FAIRNESS_WARNING_LIMIT = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_AGING_DAYS_PER_RANK = 14;
const MAX_PRIORITY_AGE_BOOST = 2;
const FRESHNESS_PENALTY_DAYS = 1;
const STALE_FRESHNESS_DAYS = 14;

function limitExceeded(value: number | undefined, limit: number | undefined): value is number {
  return limit !== undefined && value !== undefined && value > limit;
}

function limitReached(value: number | undefined, limit: number | undefined): value is number {
  return limit !== undefined && value !== undefined && value >= limit;
}

function providerBudgetAtReserve(value: number | undefined, reserve: number | undefined): value is number {
  return reserve !== undefined && value !== undefined && value <= reserve;
}

function validWatermarkRatio(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0 && value < 1;
}

function configuredPauseStatuses(
  config: IssueDependencyCircuitBreakerConfig,
): readonly IssueDependencyStatus[] {
  return config.pauseOnStatuses ?? ['unavailable'];
}

function retryAfterMs(openUntil: string | number | Date | undefined, nowMs: number): number | undefined {
  if (openUntil === undefined) return undefined;
  const untilMs = openUntil instanceof Date ? openUntil.getTime() : new Date(openUntil).getTime();
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) return undefined;
  return untilMs - nowMs;
}

function evaluateDependencyCircuitBreakers(
  signals: IssueBackpressureSignals,
  thresholds: IssueBackpressureThresholds,
  nowMs: number = Date.now(),
): IssueDependencyCircuitBreakerState[] {
  const configs = thresholds.dependencyCircuitBreakers ?? {};
  const states: IssueDependencyCircuitBreakerState[] = [];

  for (const signal of signals.dependencyStatuses ?? []) {
    const config = configs[signal.dependency];
    if (!config) continue;

    const retryMs = retryAfterMs(signal.openUntil, nowMs);
    if (retryMs !== undefined) {
      states.push({
        dependency: signal.dependency,
        status: signal.status,
        state: 'open',
        retryAfterMs: retryMs,
        reason: `${signal.dependency} circuit breaker is open for another ${retryMs}ms`,
      });
      continue;
    }

    const maxFailures = config.maxConsecutiveFailures;
    if (
      maxFailures !== undefined
      && maxFailures > 0
      && signal.consecutiveFailures !== undefined
      && signal.consecutiveFailures >= maxFailures
    ) {
      states.push({
        dependency: signal.dependency,
        status: signal.status,
        state: 'open',
        reason: `${signal.dependency} consecutive failures ${signal.consecutiveFailures} reached circuit breaker limit ${maxFailures}`,
      });
      continue;
    }

    const pauseStatuses = configuredPauseStatuses(config);
    if (pauseStatuses.includes(signal.status)) {
      states.push({
        dependency: signal.dependency,
        status: signal.status,
        state: 'open',
        reason: `${signal.dependency} dependency status ${signal.status} opened circuit breaker`,
      });
      continue;
    }

    states.push({
      dependency: signal.dependency,
      status: signal.status,
      state: 'closed',
    });
  }

  return states;
}

function capacityAlert(
  signal: keyof IssueBackpressureSignals,
  label: string,
  value: number | undefined,
  threshold: number | undefined,
  ratio: number | undefined,
): IssueCapacityWatermarkAlert | undefined {
  if (threshold === undefined || threshold <= 0 || !validWatermarkRatio(ratio) || value === undefined) return undefined;
  const thresholdValue: number = threshold;
  const ratioValue: number = ratio;
  if (value < thresholdValue * ratioValue) return undefined;
  return {
    signal,
    value,
    threshold: thresholdValue,
    watermarkRatio: ratioValue,
    message: `${label} ${value} reached ${Math.round(ratioValue * 100)}% of limit ${thresholdValue}`,
  };
}

function defaultBackpressureSignals(context: IssueBackpressureSignalContext): IssueBackpressureSignals {
  return {
    activeProcesses: 0,
    failedStarts: 0,
    inFlightBacklog: 0,
    pendingIssueCount: context.pendingIssueCount,
    providerBudgetTokensRemaining: context.providerBudgetTokensRemaining,
    systemLoadAverage: loadavg()[0],
  };
}

export function routeIssueWorkerForDegradedMode(
  input: IssueDegradedModeWorkerRouteInput,
): IssueDegradedModeWorkerRoute {
  const graphHasCheckpointProgress = input.graphHasCheckpointProgress ?? false;
  const graphComplete = input.graphComplete ?? false;
  const backpressureReason = input.backpressureDecision && !input.backpressureDecision.allowed
    ? `backpressure: ${input.backpressureDecision.reasons.join('; ')}`
    : undefined;
  const degradedReason = input.stopRemainingReason ?? backpressureReason;
  const hasProgress = graphHasCheckpointProgress || (input.graphHasCheckpointProgress === undefined && input.checkpointHasIssueProgress);

  if (graphComplete) {
    return {
      mode: degradedReason ? 'degraded' : 'normal',
      action: 'complete-checkpointed',
      issueNumber: input.issue.number,
      reason: degradedReason,
      guidance: 'Treat this issue as already complete from checkpoint; do not start a duplicate worker.',
      checkpointHasIssueProgress: input.checkpointHasIssueProgress,
      graphHasCheckpointProgress,
      graphComplete,
    };
  }

  if (hasProgress) {
    return {
      mode: degradedReason ? 'degraded' : 'normal',
      action: 'resume-checkpointed',
      issueNumber: input.issue.number,
      reason: degradedReason,
      guidance: degradedReason
        ? 'Resume checkpointed work during degraded mode; avoid opening a new fresh worker while capacity is constrained.'
        : 'Route the worker to resume checkpointed work before considering fresh-start policy.',
      checkpointHasIssueProgress: input.checkpointHasIssueProgress,
      graphHasCheckpointProgress,
      graphComplete,
    };
  }

  if (degradedReason) {
    return {
      mode: 'degraded',
      action: 'defer-fresh-start',
      issueNumber: input.issue.number,
      reason: degradedReason,
      guidance: 'Defer this fresh worker start until capacity/dependency signals recover; keep the skip reason in liveness output.',
      checkpointHasIssueProgress: input.checkpointHasIssueProgress,
      graphHasCheckpointProgress,
      graphComplete,
    };
  }

  return {
    mode: 'normal',
    action: 'start-fresh',
    issueNumber: input.issue.number,
    guidance: 'Start a fresh worker; no degraded-mode routing condition is active.',
    checkpointHasIssueProgress: input.checkpointHasIssueProgress,
    graphHasCheckpointProgress,
    graphComplete,
  };
}

export async function evaluateIssueBackpressure(
  backpressure: IssueBackpressureConfig | undefined,
  context: IssueBackpressureSignalContext,
): Promise<IssueBackpressureDecision> {
  const rawSignals = await (backpressure?.signals?.(context) ?? defaultBackpressureSignals(context));
  const signals: IssueBackpressureSignals = {
    ...rawSignals,
    providerBudgetTokensRemaining: rawSignals.providerBudgetTokensRemaining ?? context.providerBudgetTokensRemaining,
    pendingIssueCount: rawSignals.pendingIssueCount ?? context.pendingIssueCount,
  };
  const thresholds = backpressure?.thresholds ?? {};
  const reasons: string[] = [];
  const alerts = [
    capacityAlert(
      'activeProcesses',
      'active processes',
      signals.activeProcesses,
      thresholds.maxActiveProcesses,
      thresholds.capacityWatermarkRatio,
    ),
    capacityAlert(
      'inFlightBacklog',
      'in-flight backlog',
      signals.inFlightBacklog,
      thresholds.maxInFlightBacklog,
      thresholds.capacityWatermarkRatio,
    ),
    capacityAlert(
      'pendingIssueCount',
      'queue depth',
      signals.pendingIssueCount,
      thresholds.maxPendingIssueCount,
      thresholds.capacityWatermarkRatio,
    ),
    capacityAlert(
      'oldestQueueAgeMs',
      'oldest queue age',
      signals.oldestQueueAgeMs,
      thresholds.maxOldestQueueAgeMs,
      thresholds.capacityWatermarkRatio,
    ),
    capacityAlert(
      'systemLoadAverage',
      'system load',
      signals.systemLoadAverage,
      thresholds.maxSystemLoadAverage,
      thresholds.capacityWatermarkRatio,
    ),
  ].filter((alert): alert is IssueCapacityWatermarkAlert => alert !== undefined);

  if (limitReached(signals.activeProcesses, thresholds.maxActiveProcesses)) {
    reasons.push(`active processes ${signals.activeProcesses} reached limit ${thresholds.maxActiveProcesses}`);
  }
  if (limitExceeded(signals.failedStarts, thresholds.maxFailedStarts)) {
    reasons.push(`failed starts ${signals.failedStarts} exceeds limit ${thresholds.maxFailedStarts}`);
  }
  if (limitExceeded(signals.inFlightBacklog, thresholds.maxInFlightBacklog)) {
    reasons.push(
      `fresh ticket creation blocked while in-flight backlog ${signals.inFlightBacklog} exceeds limit ${thresholds.maxInFlightBacklog}`,
    );
  }
  if (limitExceeded(signals.pendingIssueCount, thresholds.maxPendingIssueCount)) {
    reasons.push(`queue depth ${signals.pendingIssueCount} exceeds limit ${thresholds.maxPendingIssueCount}`);
  }
  if (limitExceeded(signals.oldestQueueAgeMs, thresholds.maxOldestQueueAgeMs)) {
    reasons.push(`oldest queue age ${signals.oldestQueueAgeMs}ms exceeds limit ${thresholds.maxOldestQueueAgeMs}ms`);
  }
  if (limitExceeded(signals.systemLoadAverage, thresholds.maxSystemLoadAverage)) {
    reasons.push(`system load ${signals.systemLoadAverage} exceeds limit ${thresholds.maxSystemLoadAverage}`);
  }
  if (providerBudgetAtReserve(signals.providerBudgetTokensRemaining, thresholds.minProviderBudgetTokensRemaining)) {
    reasons.push(
      `provider budget remaining ${signals.providerBudgetTokensRemaining} tokens is at or below reserve ${thresholds.minProviderBudgetTokensRemaining}`,
    );
  }
  const dependencyCircuitBreakers = evaluateDependencyCircuitBreakers(signals, thresholds);
  for (const breaker of dependencyCircuitBreakers) {
    if (breaker.state === 'open' && breaker.reason) {
      reasons.push(breaker.reason);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    signals,
    alerts,
    dependencyCircuitBreakers,
  };
}


const TERMINAL_WORKER_CARD_STATUSES = new Set([
  'archived',
  'cancelled',
  'canceled',
  'closed',
  'complete',
  'completed',
  'crashed',
  'deleted',
  'done',
  'exited',
  'failed',
  'merged',
  'removed',
  'skipped',
  'stopped',
]);

function activeWorkerCardProcess(snapshot: IssueWorkerCardProcessSnapshot): boolean {
  if (snapshot.alive === false) return false;
  if (!snapshot.cardId.trim()) return false;
  if (!Number.isSafeInteger(snapshot.pid) || snapshot.pid <= 0) return false;
  const status = snapshot.status?.trim().toLowerCase();
  return status === undefined || !TERMINAL_WORKER_CARD_STATUSES.has(status);
}

function isoTimestamp(value: string | number | Date | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
}

function uniqueSortedNumbers(values: Iterable<number | undefined>): number[] {
  return [...new Set([...values].filter((value): value is number => Number.isSafeInteger(value)))]
    .sort((a, b) => a - b);
}

function uniqueSortedStrings(values: Iterable<string | undefined>): string[] {
  return [...new Set([...values]
    .map(value => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function maxIsoTimestamp(values: Iterable<string | number | Date | undefined>): string | undefined {
  let maxMs = Number.NEGATIVE_INFINITY;
  let maxIso: string | undefined;
  for (const value of values) {
    const iso = isoTimestamp(value);
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (ms > maxMs) {
      maxMs = ms;
      maxIso = iso;
    }
  }
  return maxIso;
}

function heartbeatSource(snapshot: IssueWorkerCardProcessSnapshot): string {
  return snapshot.source?.trim() || snapshot.owner?.trim() || 'unknown-source';
}

function sequenceDidNotAdvance(
  prior: number | undefined,
  next: number | undefined,
): boolean {
  return prior !== undefined
    && next !== undefined
    && Number.isSafeInteger(prior)
    && Number.isSafeInteger(next)
    && next <= prior;
}

function timestampDidNotAdvance(
  prior: string | undefined,
  next: string | undefined,
): boolean {
  if (!prior || !next) return false;
  return new Date(next).getTime() <= new Date(prior).getTime();
}

export function detectWorkerHeartbeatMonotonicityAnomalies(
  snapshots: readonly IssueWorkerCardProcessSnapshot[],
): WorkerHeartbeatMonotonicityFinding[] {
  const highWaterByRun = new Map<string, IssueWorkerCardProcessSnapshot>();
  const findings: WorkerHeartbeatMonotonicityFinding[] = [];

  for (const snapshot of snapshots) {
    if (!activeWorkerCardProcess(snapshot)) continue;
    const cardId = snapshot.cardId.trim();
    const baselineKey = `${cardId}\0${snapshot.runId ?? 'unknown-run'}`;
    const prior = highWaterByRun.get(baselineKey);
    if (prior) {
      const priorHeartbeatAt = isoTimestamp(prior.lastHeartbeatAt);
      const newHeartbeatAt = isoTimestamp(snapshot.lastHeartbeatAt);
      const sequenceStale = sequenceDidNotAdvance(prior.heartbeatSequence, snapshot.heartbeatSequence);
      const timestampStale = timestampDidNotAdvance(priorHeartbeatAt, newHeartbeatAt);

      if (sequenceStale || timestampStale) {
        const regressed = (snapshot.heartbeatSequence !== undefined && prior.heartbeatSequence !== undefined && snapshot.heartbeatSequence < prior.heartbeatSequence)
          || (priorHeartbeatAt !== undefined && newHeartbeatAt !== undefined && new Date(newHeartbeatAt).getTime() < new Date(priorHeartbeatAt).getTime());
        const code: WorkerHeartbeatMonotonicityFinding['code'] = regressed ? 'regressive-heartbeat' : 'duplicate-heartbeat';
        const source = heartbeatSource(snapshot);
        findings.push({
          cardId,
          ...(snapshot.runId ? { runId: snapshot.runId } : prior.runId ? { runId: prior.runId } : {}),
          source,
          severity: 'warning',
          code,
          ...(prior.heartbeatSequence !== undefined ? { priorSequence: prior.heartbeatSequence } : {}),
          ...(snapshot.heartbeatSequence !== undefined ? { newSequence: snapshot.heartbeatSequence } : {}),
          ...(priorHeartbeatAt ? { priorHeartbeatAt } : {}),
          ...(newHeartbeatAt ? { newHeartbeatAt } : {}),
          message: `Worker card ${cardId} heartbeat ${code === 'regressive-heartbeat' ? 'regressed' : 'did not advance'}: prior sequence ${prior.heartbeatSequence ?? 'unknown'} at ${priorHeartbeatAt ?? 'unknown'}, new sequence ${snapshot.heartbeatSequence ?? 'unknown'} at ${newHeartbeatAt ?? 'unknown'} from ${source}`,
        });
        continue;
      }
    }
    highWaterByRun.set(baselineKey, snapshot);
  }

  return findings;
}

export function detectDuplicateWorkerCardProcesses(
  snapshots: readonly IssueWorkerCardProcessSnapshot[],
): DuplicateWorkerCardProcessFinding[] {
  const byCard = new Map<string, IssueWorkerCardProcessSnapshot[]>();

  for (const snapshot of snapshots) {
    if (!activeWorkerCardProcess(snapshot)) continue;
    const cardId = snapshot.cardId.trim();
    const existingForCard = byCard.get(cardId);
    if (existingForCard) {
      existingForCard.push(snapshot);
    } else {
      byCard.set(cardId, [snapshot]);
    }
  }

  const findings: DuplicateWorkerCardProcessFinding[] = [];
  for (const [cardId, cardSnapshots] of byCard) {
    const pids = uniqueSortedNumbers(cardSnapshots.map(snapshot => snapshot.pid));
    if (pids.length < 2) continue;

    const issueNumbers = uniqueSortedNumbers(cardSnapshots.map(snapshot => snapshot.issueNumber));
    findings.push({
      cardId,
      severity: 'warning',
      processCount: pids.length,
      pids,
      runIds: uniqueSortedStrings(cardSnapshots.map(snapshot => snapshot.runId)),
      issueNumbers,
      owners: uniqueSortedStrings(cardSnapshots.map(snapshot => snapshot.owner)),
      statuses: uniqueSortedStrings(cardSnapshots.map(snapshot => snapshot.status)),
      newestStartedAt: maxIsoTimestamp(cardSnapshots.map(snapshot => snapshot.startedAt)),
      lastHeartbeatAt: maxIsoTimestamp(cardSnapshots.map(snapshot => snapshot.lastHeartbeatAt)),
      message: `Worker card ${cardId} has ${pids.length} live processes: ${pids.join(', ')}`,
      guidance: 'Keep one live owner for the worker card, stop or park the duplicate process, then record the surviving PID/run id in PM/liveness output.',
    });
  }

  return findings.sort((a, b) => a.cardId.localeCompare(b.cardId));
}

function extractSeverity(labels: readonly string[]): number {
  for (const label of labels) {
    const rank = SEVERITY_ORDER[label.toLowerCase()];
    if (rank !== undefined) return rank;
  }
  return NO_SEVERITY;
}

function normalizedLabels(issue: GithubIssue): string[] {
  return issue.labels.map(label => label.trim().toLowerCase()).filter(label => label.length > 0);
}

function issueBlockerStatus(issue: GithubIssue): IssueBlockerStatus {
  const status = issue.status?.trim().toLowerCase();
  if (status && ['blocked', 'paused', 'parked'].includes(status)) return 'blocked';
  if (status && ['triage', 'needs_input', 'needs-input', 'hitl', 'review-required'].includes(status)) return 'hitl';
  const labels = normalizedLabels(issue);
  if (labels.some(label => ['hitl', 'human-in-the-loop', 'needs-input', 'needs_input', 'needs-human', 'review-required'].includes(label))) {
    return 'hitl';
  }
  if (labels.some(label => ['blocked', 'blocked_status', 'parked', 'paused'].includes(label))) return 'blocked';
  return 'eligible';
}

function issueRiskLane(issue: GithubIssue): string {
  for (const label of normalizedLabels(issue)) {
    if (label.startsWith('risk:') || label.startsWith('lane:')) return label;
    if (['low-risk', 'docs', 'test', 'tests', 'security', 'orchestrator', 'web', 'mcp', 'fallback'].includes(label)) return label;
  }
  return 'standard';
}

function riskLaneWeight(riskLane: string): number {
  switch (riskLane) {
    case 'low-risk':
    case 'docs':
    case 'test':
    case 'tests':
    case 'lane:low-risk':
      return -0.1;
    case 'security':
    case 'risk:high':
      return 0.25;
    default:
      return 0;
  }
}

function timestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function ageDays(issue: GithubIssue, nowMs: number): number {
  const createdMs = timestampMs(issue.createdAt);
  if (createdMs === undefined || createdMs > nowMs) return 0;
  return Math.floor((nowMs - createdMs) / ONE_DAY_MS);
}

function issueFreshness(issue: GithubIssue, nowMs: number): IssueFreshness {
  const updatedMs = timestampMs(issue.updatedAt);
  if (updatedMs === undefined || updatedMs > nowMs) return 'unknown';
  const days = (nowMs - updatedMs) / ONE_DAY_MS;
  if (days < FRESHNESS_PENALTY_DAYS) return 'fresh';
  if (days >= STALE_FRESHNESS_DAYS) return 'stale';
  return 'normal';
}

function freshnessWeight(freshness: IssueFreshness): number {
  switch (freshness) {
    case 'fresh':
      return 0.2;
    case 'stale':
      return -0.1;
    default:
      return 0;
  }
}

function severityName(rank: number): IssueSchedulerFairnessBucket['severity'] {
  switch (rank) {
    case 0:
      return 'critical';
    case 1:
      return 'high';
    case 2:
      return 'medium';
    case 3:
      return 'low';
    default:
      return 'unprioritized';
  }
}

export function evaluateIssueSchedulingScore(issue: GithubIssue, nowMs: number = Date.now()): IssueSchedulingScore {
  const priorityRank = extractSeverity(issue.labels);
  const priority = severityName(priorityRank);
  const blockerStatus = issueBlockerStatus(issue);
  const age = ageDays(issue, nowMs);
  const ageBoost = blockerStatus === 'eligible' && priorityRank < NO_SEVERITY
    ? Math.min(MAX_PRIORITY_AGE_BOOST, Math.floor(age / PRIORITY_AGING_DAYS_PER_RANK))
    : 0;
  const agedPriorityRank = Math.max(0, priorityRank - ageBoost);
  const effectivePriorityRank = priorityRank === 0 ? 0 : Math.max(1, agedPriorityRank);
  const riskLane = issueRiskLane(issue);
  const freshness = issueFreshness(issue, nowMs);
  const unsafePenalty = blockerStatus === 'eligible' ? 0 : 100;
  const score = effectivePriorityRank + unsafePenalty + riskLaneWeight(riskLane) + freshnessWeight(freshness);
  return {
    issueNumber: issue.number,
    priority,
    priorityRank,
    effectivePriorityRank,
    ageDays: age,
    ageBoost,
    blockerStatus,
    riskLane,
    freshness,
    score,
    explanation: `priority=${priority}(${priorityRank}) age=${age}d boost=${ageBoost} blocker=${blockerStatus} riskLane=${riskLane} freshness=${freshness} effective=${effectivePriorityRank}`,
  };
}

function sortBySchedulingScore(issues: readonly GithubIssue[], nowMs: number = Date.now()): GithubIssue[] {
  return [...issues].sort((a, b) => {
    const scoreA = evaluateIssueSchedulingScore(a, nowMs);
    const scoreB = evaluateIssueSchedulingScore(b, nowMs);
    if (scoreA.score !== scoreB.score) return scoreA.score - scoreB.score;
    if (scoreA.ageDays !== scoreB.ageDays) return scoreB.ageDays - scoreA.ageDays;
    return a.number - b.number;
  });
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const candidate: number = value;
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : fallback;
}

function sampleNumbers(values: readonly number[], limit: number): { sample: readonly number[]; omitted: number } {
  if (values.length <= limit) return { sample: values, omitted: 0 };
  return { sample: values.slice(0, limit), omitted: values.length - limit };
}

function sampleStrings(values: readonly string[], limit: number): { sample: readonly string[]; omitted: number } {
  if (values.length <= limit) return { sample: values, omitted: 0 };
  return { sample: values.slice(0, limit), omitted: values.length - limit };
}

export function buildIssueSchedulerFairnessReport(
  issues: readonly GithubIssue[],
  triageResults: readonly TriageResult[],
  options: IssueSchedulerFairnessReportOptions = {},
): IssueSchedulerFairnessReport {
  const nowMs = options.nowMs ?? Date.now();
  const scheduled = sortBySchedulingScore(issues, nowMs);
  const triagedIssueNumbers = new Set(triageResults.map(triage => triage.issueNumber));
  const buckets = new Map<IssueSchedulerFairnessBucket['severity'], number[]>();
  const warnings: string[] = [];
  const warningCounters = {
    unprioritized: 0,
    missingTriage: 0,
  };
  const issueNumberLimit = boundedPositiveInteger(
    options.maxIssueNumbersPerList,
    DEFAULT_SCHEDULER_FAIRNESS_ISSUE_NUMBER_LIMIT,
  );
  const warningLimit = boundedPositiveInteger(
    options.maxWarnings,
    DEFAULT_SCHEDULER_FAIRNESS_WARNING_LIMIT,
  );

  for (const severity of ['critical', 'high', 'medium', 'low', 'unprioritized'] as const) {
    buckets.set(severity, []);
  }

  for (const issue of scheduled) {
    const severity = severityName(extractSeverity(issue.labels));
    buckets.get(severity)!.push(issue.number);

    if (severity === 'unprioritized') {
      warningCounters.unprioritized += 1;
      warnings.push(`issue #${issue.number} has no recognized severity label and is scheduled after prioritized work`);
    }

    if (!triagedIssueNumbers.has(issue.number)) {
      warningCounters.missingTriage += 1;
      warnings.push(`issue #${issue.number} has no triage result and will fail before execution if approved`);
    }
  }

  const scheduledSample = sampleNumbers(scheduled.map(issue => issue.number), issueNumberLimit);
  const scheduledSampleNumbers = new Set(scheduledSample.sample);
  const warningSample = sampleStrings(warnings, warningLimit);
  const warningSummary = [
    warningCounters.unprioritized > 0
      ? `${warningCounters.unprioritized} unprioritized issue(s) are scheduled after prioritized work`
      : undefined,
    warningCounters.missingTriage > 0
      ? `${warningCounters.missingTriage} issue(s) are missing triage results and require labels/triage before safe execution`
      : undefined,
  ].filter((entry): entry is string => entry !== undefined);

  return {
    totalIssues: issues.length,
    scheduledIssueNumbers: scheduledSample.sample,
    effectivePriorities: scheduled
      .filter(issue => scheduledSampleNumbers.has(issue.number))
      .map(issue => evaluateIssueSchedulingScore(issue, nowMs)),
    ...(scheduledSample.omitted > 0
      ? {
          scheduledIssueNumbersTruncated: true as const,
          omittedScheduledIssueNumberCount: scheduledSample.omitted,
        }
      : {}),
    buckets: [...buckets.entries()].map(([severity, issueNumbers]) => {
      const bucketSample = sampleNumbers(issueNumbers, issueNumberLimit);
      return {
        severity,
        issueNumbers: bucketSample.sample,
        count: issueNumbers.length,
        ...(bucketSample.omitted > 0
          ? {
              issueNumbersTruncated: true as const,
              omittedIssueNumberCount: bucketSample.omitted,
            }
          : {}),
      };
    }),
    warnings: warningSample.sample,
    ...(warningSample.omitted > 0
      ? {
          warningsTruncated: true as const,
          omittedWarningCount: warningSample.omitted,
          warningSummary,
        }
      : {}),
  };
}

function findTriage(triages: readonly TriageResult[], issueNumber: number): TriageResult | undefined {
  return triages.find(t => t.issueNumber === issueNumber);
}

function appendIssueLog(logFile: string | undefined, message: string): void {
  if (!logFile) return;
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(logFile, `[${isoNow()}] ${message}\n`);
}

function issueCompletionKey(taskId: string): string {
  return `${taskId}:done`;
}

function issueTaskProgressKey(issueNumber: number, taskId: string): string {
  return `issue:${issueNumber}:${taskId}`;
}

function taskRecoveryStage(taskId: string): 'impl' | 'harden' {
  return taskId.startsWith('harden:') || taskId.startsWith('fix-harden:') ? 'harden' : 'impl';
}

function listPlanChunkPaths(planDir: string): string[] {
  try {
    if (!existsSync(planDir)) return [];
    return readdirSync(planDir)
      .filter((fileName) => fileName.endsWith('.md') && !fileName.startsWith('00_') && /^\d{2}/.test(fileName))
      .sort()
      .map((fileName) => join(planDir, fileName));
  } catch {
    return [];
  }
}

function checkpointEntriesHavePlanProgress(
  entries: ReadonlySet<string>,
  issueNumber: number,
  planDir: string,
): boolean {
  const chunkPaths = listPlanChunkPaths(planDir);
  for (const chunkPath of chunkPaths) {
    const chunkId = basename(chunkPath, '.md');
    if (
      entries.has(issueTaskProgressKey(issueNumber, `impl:${chunkId}`)) ||
      entries.has(issueTaskProgressKey(issueNumber, `harden:${chunkId}`))
    ) {
      return true;
    }
  }

  if (chunkPaths.length > 0) {
    return chunkPaths.every((chunkPath) => {
      const chunkId = basename(chunkPath, '.md');
      return (
        entries.has(issueCompletionKey(`impl:${chunkId}`)) &&
        entries.has(issueCompletionKey(`harden:${chunkId}`))
      );
    });
  }

  return false;
}

function checkpointEntriesHaveIssueProgress(
  entries: ReadonlySet<string> | undefined,
  issueNumber: number,
  issueSpecificCheckpoint: boolean,
  planDir: string,
): boolean {
  if (!entries) return false;
  if (issueSpecificCheckpoint) return entries.size > 0;

  const issueToken = `issue-${issueNumber}`;
  for (const entry of entries) {
    const index = entry.indexOf(issueToken);
    if (index < 0) continue;

    const before = entry[index - 1];
    const after = entry[index + issueToken.length];
    const hasNumericPrefix = before !== undefined && /\d/.test(before);
    const hasNumericSuffix = after !== undefined && /\d/.test(after);
    if (!hasNumericPrefix && !hasNumericSuffix) return true;
  }

  return checkpointEntriesHavePlanProgress(entries, issueNumber, planDir);
}

function checkpointEntriesAreCompleteWithoutPlan(
  entries: ReadonlySet<string> | undefined,
  issueNumber: number,
  issueSpecificCheckpoint: boolean,
  complexity: TriageResult['complexity'],
): boolean {
  if (!issueSpecificCheckpoint || entries === undefined || entries.size === 0) return false;
  if (complexity === 'chunked') return false;

  const issueToken = `issue-${issueNumber}`;
  const doneEntries = [...entries].filter((entry) => entry.endsWith(':done') && entry.includes(issueToken));
  const oneShotImplKey = `impl:${issueToken}:done`;
  const oneShotHardenKey = `harden:${issueToken}:done`;

  return doneEntries.includes(oneShotImplKey)
    && doneEntries.includes(oneShotHardenKey);
}

function checkpointHasTaskProgress(issueCheckpoint: ICheckpointStore, taskId: string): boolean {
  return (
    issueCheckpoint.has(issueCompletionKey(taskId)) ||
    issueCheckpoint.lastCommit(taskId, taskRecoveryStage(taskId)) !== undefined
  );
}

function issueSkillDescriptor(id: string): SkillDescriptor {
  return {
    id,
    name: id.replace(/^cli:/, ''),
    executionType: 'cli',
    requiresHitl: false,
  };
}

function createIssueSkills(baseSkills: ISkillsModule | undefined, skillIds: readonly string[]): ISkillsModule {
  const fallbackSkills: ISkillsModule = baseSkills ?? {
    hasSkill: () => false,
    getAvailableSkills: () => [],
    execute: async () => {
      throw new Error('No skills available for issue execution');
    },
  };
  const extraIds = new Set(skillIds);
  const merged = new Map<string, SkillDescriptor>();

  for (const descriptor of fallbackSkills.getAvailableSkills()) {
    merged.set(descriptor.id, descriptor);
  }
  for (const skillId of skillIds) {
    merged.set(skillId, issueSkillDescriptor(skillId));
  }

  return {
    hasSkill: (id: string) => extraIds.has(id) || fallbackSkills.hasSkill(id),
    getAvailableSkills: () => [...merged.values()],
    execute: (skillId, input) => fallbackSkills.execute(skillId, input),
  };
}

function extractIssueChunkId(skillId: string): string {
  return skillId.startsWith('cli:') ? skillId.slice(4) : skillId;
}

function createIssueCliExecutor(
  baseCliExecutor: CliSkillExecutor,
  planName: string,
  options?: {
    maxIterations?: number;
    staleMateLimit?: number;
  },
): CliSkillExecutor {
  return {
    recoverDirtyFiles: (...args) => baseCliExecutor.recoverDirtyFiles(...args),
    execute: (skillId, input, _config, checkpoint, taskId) => {
      const martinConfig: CliSkillConfig = {
        martin: {
          planName,
          chunkId: extractIssueChunkId(skillId),
          taskId,
          ...(options?.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
          ...(options?.staleMateLimit !== undefined ? { staleMateLimit: options.staleMateLimit } : {}),
        } as CliSkillConfig['martin'],
        git: {
          baseBranch: 'main',
          branchPrefix: 'fix/',
          autoCommit: true,
          workingDir: '.',
        },
      };

      return baseCliExecutor.execute(skillId, input, martinConfig, checkpoint, taskId);
    },
  } as CliSkillExecutor;
}

function createIssuePrCreator(
  basePrCreator: PrCreator,
  issueNumber: number,
  prRef: { current?: string | undefined },
): PrCreator {
  return {
    create: async (result: BeastResult, logger?: ILogger) => {
      const created = await basePrCreator.create(result, logger, { issueNumber });
      prRef.current = created?.url;
      return created;
    },
  } as PrCreator;
}

export class IssueRunner {
  async run(config: IssueRunnerConfig): Promise<IssueOutcome[]> {
    const {
      issues,
      triageResults,
      budget,
      logger,
    } = config;

    if (issues.length === 0) return [];

    const sorted = sortBySchedulingScore(issues);
    const startableRemainingCounts = sorted.map((_, index) =>
      sorted.slice(index).filter((candidate) => evaluateIssueSchedulingScore(candidate).blockerStatus === 'eligible').length,
    );
    logger?.info('[issues] Scheduler fairness report', buildIssueSchedulerFairnessReport(issues, triageResults), 'issues');
    const budgetTokens = budget * TOKENS_PER_DOLLAR;
    let cumulativeTokens = 0;
    let budgetExceeded = false;
    let stopRemainingReason: string | undefined;
    const outcomes: IssueOutcome[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const issue = sorted[i]!;
      const position = `${i + 1}/${sorted.length}`;

      if (budgetExceeded) {
        outcomes.push({
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'skipped',
          tokensUsed: 0,
        });
        continue;
      }

      logger?.info(`[issues] Starting issue #${issue.number} (${position})`, undefined, 'issues');

      const triage = findTriage(triageResults, issue.number);
      if (!triage) {
        outcomes.push({
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: 0,
          error: `No triage result for issue #${issue.number}`,
        });
        continue;
      }

      try {
        const outcome = await this.processIssue(issue, triage, config, {
          index: i,
          totalIssues: sorted.length,
          pendingIssueCount: startableRemainingCounts[i] ?? 0,
          cumulativeTokens,
          budgetTokens,
          providerBudgetTokensRemaining: Math.max(0, budgetTokens - cumulativeTokens),
          stopRemainingReason,
        });
        cumulativeTokens += outcome.tokensUsed;
        outcomes.push(outcome);

        if (outcome.status === 'skipped' && outcome.error?.includes('queue depth')) {
          stopRemainingReason = outcome.error;
        }

        if (cumulativeTokens >= budgetTokens) {
          budgetExceeded = true;
        }
      } catch (err) {
        outcomes.push({
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return outcomes;
  }

  private async processIssue(
    issue: GithubIssue,
    triage: TriageResult,
    config: IssueRunnerConfig,
    backpressureContext: Omit<IssueBackpressureSignalContext, 'issue'> & {
      readonly stopRemainingReason?: string | undefined;
    },
  ): Promise<IssueOutcome> {
    const {
      graphBuilder,
      fullDeps,
      git,
      logger,
      repo,
      issueRuntime,
    } = config;

    const runtimeArtifacts = issueRuntime?.artifactsForIssue(issue.number);
    const issueCheckpoint = issueRuntime?.checkpointForIssue(issue.number) ?? config.checkpoint;
    const planName = runtimeArtifacts?.planName ?? issueRuntime?.planNameForIssue(issue.number) ?? `issue-${issue.number}`;
    const logFile = runtimeArtifacts?.logFile;
    const planDir = runtimeArtifacts?.planDir ?? resolve(getProjectPaths('.').plansDir, planName);
    const checkpointEntries = issueCheckpoint?.readAll();
    const checkpointHasIssueProgress = checkpointEntriesHaveIssueProgress(
      checkpointEntries,
      issue.number,
      issueRuntime !== undefined,
      planDir,
    );
    const checkpointedPlanChunkPaths = checkpointHasIssueProgress ? listPlanChunkPaths(planDir) : [];
    const schedulingScore = evaluateIssueSchedulingScore(issue);

    if (
      schedulingScore.blockerStatus !== 'eligible'
      && checkpointedPlanChunkPaths.length === 0
      && checkpointEntriesAreCompleteWithoutPlan(
        checkpointEntries,
        issue.number,
        issueRuntime !== undefined,
        triage.complexity,
      )
    ) {
      logger?.info(
        `[issues] Issue #${issue.number} already completed (checkpoint)`,
        { issueNumber: issue.number, schedulingScore, checkpointCompleteWithoutPlan: true },
        'issues',
      );
      appendIssueLog(logFile, `Issue #${issue.number} already complete from checkpoint`);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'fixed',
        tokensUsed: 0,
      };
    }

    if (
      schedulingScore.blockerStatus !== 'eligible'
      && (!checkpointHasIssueProgress || checkpointedPlanChunkPaths.length === 0)
    ) {
      const reason = `deferred by scheduler: ${schedulingScore.blockerStatus} issue is waiting on human/dependency gate`;
      logger?.warn(
        `[issues] Deferred issue #${issue.number}: ${reason}`,
        { issueNumber: issue.number, schedulingScore },
        'issues',
      );
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: reason,
      };
    }

    const logDegradedRoute = (route: IssueDegradedModeWorkerRoute): void => {
      logger?.warn(
        `[issues] Degraded-mode route for issue #${issue.number}: ${route.action}`,
        {
          issueNumber: issue.number,
          workerRoute: route,
        },
        'issues',
      );
    };

    const skipForDegradedRoute = (route: IssueDegradedModeWorkerRoute): IssueOutcome => {
      logDegradedRoute(route);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: route.reason,
      };
    };

    const pauseForBackpressure = async (
      graphProgress?: { graphHasCheckpointProgress?: boolean; graphComplete?: boolean },
    ): Promise<IssueOutcome | undefined> => {
      const backpressureDecision = await evaluateIssueBackpressure(config.backpressure, {
        issue,
        ...backpressureContext,
      });

      if (backpressureDecision.allowed) {
        if (backpressureDecision.alerts.length > 0) {
          logger?.warn(
            `[issues] Capacity watermark alert for issue #${issue.number}: ${backpressureDecision.alerts.map(alert => alert.message).join('; ')}`,
            {
              issueNumber: issue.number,
              alerts: backpressureDecision.alerts,
              signals: backpressureDecision.signals,
            },
            'issues',
          );
        }
        return undefined;
      }

      const route = routeIssueWorkerForDegradedMode({
        issue,
        checkpointHasIssueProgress,
        graphHasCheckpointProgress: graphProgress?.graphHasCheckpointProgress,
        graphComplete: graphProgress?.graphComplete,
        backpressureDecision,
      });
      logger?.warn(
        `[issues] Backpressure paused issue #${issue.number}: ${backpressureDecision.reasons.join('; ')}`,
        {
          issueNumber: issue.number,
          reasons: backpressureDecision.reasons,
          signals: backpressureDecision.signals,
          workerRoute: route,
          dependencyCircuitBreakers: backpressureDecision.dependencyCircuitBreakers,
        },
        'issues',
      );
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: route.reason ?? `backpressure: ${backpressureDecision.reasons.join('; ')}`,
      };
    };

    if (backpressureContext.stopRemainingReason && !checkpointHasIssueProgress) {
      return skipForDegradedRoute(routeIssueWorkerForDegradedMode({
        issue,
        checkpointHasIssueProgress,
        stopRemainingReason: backpressureContext.stopRemainingReason,
      }));
    }

    const requiresCheckpointCompletionCheckBeforeBackpressure =
      issueRuntime === undefined && issueCheckpoint !== undefined && checkpointHasIssueProgress;
    if (!checkpointHasIssueProgress && !requiresCheckpointCompletionCheckBeforeBackpressure) {
      const paused = await pauseForBackpressure();
      if (paused) return paused;
    }

    let graph: PlanGraph;
    let executionGraphBuilder: BeastLoopDeps['graphBuilder'];
    let refreshPlanTasks: BeastLoopDeps['refreshPlanTasks'];
    let skillIds: readonly string[];
    try {
      const realGraphBuilder = new ChunkFileGraphBuilder(planDir);
      const chunkPaths = checkpointedPlanChunkPaths.length > 0
        ? checkpointedPlanChunkPaths
        : new ChunkFileWriter(planDir).write(await graphBuilder.buildChunkDefinitionsForIssue(issue, triage));
      graph = await realGraphBuilder.build({ goal: `Process issue #${issue.number}` });
      executionGraphBuilder = realGraphBuilder;
      skillIds = chunkPaths.map((chunkPath) => `cli:${basename(chunkPath, '.md')}`);
      refreshPlanTasks = async () => (await realGraphBuilder.build({ goal: 'refresh issue tasks' })).tasks;
      if (issueCheckpoint && issueRuntime === undefined) {
        for (const task of graph.tasks) {
          const progressKey = issueTaskProgressKey(issue.number, task.id);
          if (!issueCheckpoint.has(progressKey)) {
            issueCheckpoint.write(progressKey);
          }
        }
      }
    } catch (err) {
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'failed',
        tokensUsed: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const graphHasCheckpointProgress =
      issueCheckpoint !== undefined && graph.tasks.some((task) => checkpointHasTaskProgress(issueCheckpoint, task.id));

    const graphComplete = issueCheckpoint !== undefined
      && graph.tasks.every((task) => issueCheckpoint.has(issueCompletionKey(task.id)));

    if (graphComplete) {
      const route = routeIssueWorkerForDegradedMode({
        issue,
        checkpointHasIssueProgress,
        graphHasCheckpointProgress,
        graphComplete,
        stopRemainingReason: backpressureContext.stopRemainingReason,
      });
      logger?.info(
        `[issues] Issue #${issue.number} already completed (checkpoint)`,
        { issueNumber: issue.number, workerRoute: route },
        'issues',
      );
      appendIssueLog(logFile, `Issue #${issue.number} already complete from checkpoint`);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'fixed',
        tokensUsed: 0,
      };
    }

    if (schedulingScore.blockerStatus !== 'eligible') {
      const reason = `deferred by scheduler: ${schedulingScore.blockerStatus} issue is waiting on human/dependency gate`;
      logger?.warn(
        `[issues] Deferred issue #${issue.number}: ${reason}`,
        { issueNumber: issue.number, schedulingScore, graphHasCheckpointProgress, graphComplete },
        'issues',
      );
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: reason,
      };
    }

    if (backpressureContext.stopRemainingReason && !graphHasCheckpointProgress) {
      return skipForDegradedRoute(routeIssueWorkerForDegradedMode({
        issue,
        checkpointHasIssueProgress,
        graphHasCheckpointProgress,
        graphComplete,
        stopRemainingReason: backpressureContext.stopRemainingReason,
      }));
    }

    if (backpressureContext.stopRemainingReason && graphHasCheckpointProgress) {
      logDegradedRoute(routeIssueWorkerForDegradedMode({
        issue,
        checkpointHasIssueProgress,
        graphHasCheckpointProgress,
        graphComplete,
        stopRemainingReason: backpressureContext.stopRemainingReason,
      }));
    }

    if (requiresCheckpointCompletionCheckBeforeBackpressure && !graphHasCheckpointProgress) {
      const paused = await pauseForBackpressure({ graphHasCheckpointProgress, graphComplete });
      if (paused) return paused;
    }

    git.isolate(`issue-${issue.number}`);

    const prRef: { current?: string | undefined } = {};
    const issueDeps: BeastLoopDeps = {
      firewall: fullDeps.firewall,
      skills: createIssueSkills(fullDeps.skills, skillIds),
      memory: fullDeps.memory,
      planner: fullDeps.planner,
      observer: fullDeps.observer,
      critique: fullDeps.critique,
      governor: fullDeps.governor,
      heartbeat: fullDeps.heartbeat,
      logger: logger ?? fullDeps.logger,
      clock: fullDeps.clock,
      graphBuilder: executionGraphBuilder,
      refreshPlanTasks,
      ...(fullDeps.mcp ? { mcp: fullDeps.mcp } : {}),
      ...(fullDeps.cliExecutor
        ? {
            cliExecutor: createIssueCliExecutor(
              fullDeps.cliExecutor,
              planName,
              triage.complexity === 'one-shot'
                ? {
                    maxIterations: ONE_SHOT_MAX_ITERATIONS,
                    staleMateLimit: ONE_SHOT_STALE_MATE_LIMIT,
                  }
                : undefined,
            ),
          }
        : {}),
      ...(fullDeps.prCreator
        ? { prCreator: createIssuePrCreator(fullDeps.prCreator, issue.number, prRef) }
        : {}),
      ...(issueCheckpoint ? { checkpoint: issueCheckpoint } : {}),
    };

    const loop = new BeastLoop(issueDeps, {
      maxDurationMs: config.timeoutMs ?? 3_600_000,
      ...(config.enableTracing !== undefined ? { enableTracing: config.enableTracing } : {}),
    });

    try {
      appendIssueLog(logFile, `Issue #${issue.number} execution started via BeastLoop`);
      
      const result = await loop.run({
        sessionId: `issue-${issue.number}`,
        projectId: repo,
        userInput: `Fix issue #${issue.number}: ${issue.title}\n\n${issue.body}`,
      });

      const tokensUsed = result.tokenSpend.totalTokens;
      const status = result.status === 'completed' ? 'fixed' : 'failed';
      const prUrl = prRef.current;

      appendIssueLog(logFile, `Issue #${issue.number} execution finished with status ${status}`);

      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status,
        tokensUsed,
        prUrl,
        error: result.error?.message,
      };
    } catch (err) {
      appendIssueLog(logFile, `Issue #${issue.number} failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'failed',
        tokensUsed: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
