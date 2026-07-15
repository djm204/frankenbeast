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

export interface IssueSchedulerFairnessBucket {
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'unprioritized';
  readonly issueNumbers: readonly number[];
  readonly count: number;
}

export interface IssueSchedulerFairnessReport {
  readonly totalIssues: number;
  readonly scheduledIssueNumbers: readonly number[];
  readonly buckets: readonly IssueSchedulerFairnessBucket[];
  readonly warnings: readonly string[];
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
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const NO_SEVERITY = 4;
const TOKENS_PER_DOLLAR = 1_000_000;
const ONE_SHOT_MAX_ITERATIONS = 50;
const ONE_SHOT_STALE_MATE_LIMIT = 3;

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

function extractSeverity(labels: readonly string[]): number {
  for (const label of labels) {
    const rank = SEVERITY_ORDER[label.toLowerCase()];
    if (rank !== undefined) return rank;
  }
  return NO_SEVERITY;
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

function sortBySeverity(issues: readonly GithubIssue[]): GithubIssue[] {
  return [...issues].sort((a, b) => extractSeverity(a.labels) - extractSeverity(b.labels));
}

export function buildIssueSchedulerFairnessReport(
  issues: readonly GithubIssue[],
  triageResults: readonly TriageResult[],
): IssueSchedulerFairnessReport {
  const scheduled = sortBySeverity(issues);
  const triagedIssueNumbers = new Set(triageResults.map(triage => triage.issueNumber));
  const buckets = new Map<IssueSchedulerFairnessBucket['severity'], number[]>();
  const warnings: string[] = [];

  for (const severity of ['critical', 'high', 'medium', 'low', 'unprioritized'] as const) {
    buckets.set(severity, []);
  }

  for (const issue of scheduled) {
    const severity = severityName(extractSeverity(issue.labels));
    buckets.get(severity)!.push(issue.number);

    if (severity === 'unprioritized') {
      warnings.push(`issue #${issue.number} has no recognized severity label and is scheduled after prioritized work`);
    }

    if (!triagedIssueNumbers.has(issue.number)) {
      warnings.push(`issue #${issue.number} has no triage result and will fail before execution if approved`);
    }
  }

  return {
    totalIssues: issues.length,
    scheduledIssueNumbers: scheduled.map(issue => issue.number),
    buckets: [...buckets.entries()].map(([severity, issueNumbers]) => ({
      severity,
      issueNumbers,
      count: issueNumbers.length,
    })),
    warnings,
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

    const sorted = sortBySeverity(issues);
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
          pendingIssueCount: sorted.length - i,
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

    const pauseForBackpressure = async (): Promise<IssueOutcome | undefined> => {
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

      const reason = `backpressure: ${backpressureDecision.reasons.join('; ')}`;
      logger?.warn(
        `[issues] Backpressure paused issue #${issue.number}: ${backpressureDecision.reasons.join('; ')}`,
        {
          issueNumber: issue.number,
          reasons: backpressureDecision.reasons,
          signals: backpressureDecision.signals,
          dependencyCircuitBreakers: backpressureDecision.dependencyCircuitBreakers,
        },
        'issues',
      );
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: reason,
      };
    };

    if (backpressureContext.stopRemainingReason && !checkpointHasIssueProgress) {
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: backpressureContext.stopRemainingReason,
      };
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

    if (issueCheckpoint && graph.tasks.every((task) => issueCheckpoint.has(issueCompletionKey(task.id)))) {
      logger?.info(`[issues] Issue #${issue.number} already completed (checkpoint)`, undefined, 'issues');
      appendIssueLog(logFile, `Issue #${issue.number} already complete from checkpoint`);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'fixed',
        tokensUsed: 0,
      };
    }

    if (backpressureContext.stopRemainingReason && !graphHasCheckpointProgress) {
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'skipped',
        tokensUsed: 0,
        error: backpressureContext.stopRemainingReason,
      };
    }

    if (requiresCheckpointCompletionCheckBeforeBackpressure && !graphHasCheckpointProgress) {
      const paused = await pauseForBackpressure();
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
