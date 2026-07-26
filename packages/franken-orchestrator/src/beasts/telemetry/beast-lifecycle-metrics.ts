import type { BeastRun } from '../types.js';

export interface BeastLifecycleMetricsWindow {
  readonly from: string;
  readonly to: string;
}

export interface BeastRunDurationDistribution {
  readonly count: number;
  readonly min: number | null;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly max: number | null;
}

export interface BeastDefinitionLifecycleAggregate {
  readonly definitionId: string;
  readonly spawnCount: number;
  readonly spawnRatePerMinute: number;
  readonly completionCount: number;
  readonly failureCount: number;
  readonly stopCount: number;
  readonly activeCount: number;
  readonly completionRate: number;
  readonly failureRate: number;
  readonly stopRate: number;
  readonly runDurationMs: BeastRunDurationDistribution;
}

export interface BeastLifecycleMetricsSnapshot {
  readonly window: BeastLifecycleMetricsWindow;
  readonly definitions: readonly BeastDefinitionLifecycleAggregate[];
  readonly orphanedProcessCount: number;
}

export interface BeastLifecycleMetricsOptions {
  readonly now?: (() => string) | undefined;
}

interface ParsedWindow {
  readonly from: number;
  readonly to: number;
  readonly durationMinutes: number;
}

const isoNow = (): string => new Date().toISOString();

/**
 * Computes lifecycle churn from persisted Beast run records and process-local
 * orphan-sweep observations. Runs are grouped into creation-time cohorts so
 * outcome rates always use the matching spawn count as their denominator.
 */
export class BeastLifecycleMetrics {
  private readonly orphanSweepTimes: number[] = [];
  private readonly now: () => string;

  constructor(
    private readonly listRuns: () => readonly BeastRun[],
    options: BeastLifecycleMetricsOptions = {},
  ) {
    this.now = options.now ?? isoNow;
  }

  recordOrphanProcessSwept(at: string = this.now()): void {
    const timestamp = Date.parse(at);
    if (!Number.isFinite(timestamp)) {
      throw new RangeError('Orphan sweep timestamp must be a valid ISO timestamp');
    }
    this.orphanSweepTimes.push(timestamp);
  }

  query(window: BeastLifecycleMetricsWindow): BeastLifecycleMetricsSnapshot {
    const parsedWindow = parseWindow(window);
    const cohorts = new Map<string, BeastRun[]>();

    for (const run of this.listRuns()) {
      const createdAt = Date.parse(run.createdAt);
      if (!Number.isFinite(createdAt) || createdAt < parsedWindow.from || createdAt >= parsedWindow.to) {
        continue;
      }
      const cohort = cohorts.get(run.definitionId) ?? [];
      cohort.push(run);
      cohorts.set(run.definitionId, cohort);
    }

    const definitions = [...cohorts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([definitionId, runs]) => aggregateDefinition(definitionId, runs, parsedWindow.durationMinutes));

    return {
      window,
      definitions,
      orphanedProcessCount: this.orphanSweepTimes.filter(
        timestamp => timestamp >= parsedWindow.from && timestamp < parsedWindow.to,
      ).length,
    };
  }
}

function parseWindow(window: BeastLifecycleMetricsWindow): ParsedWindow {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new RangeError('Lifecycle metrics window must contain valid ISO timestamps');
  }
  if (from >= to) {
    throw new RangeError('Lifecycle metrics window from must be before to');
  }
  return { from, to, durationMinutes: (to - from) / 60_000 };
}

function aggregateDefinition(
  definitionId: string,
  runs: readonly BeastRun[],
  durationMinutes: number,
): BeastDefinitionLifecycleAggregate {
  const spawnCount = runs.length;
  const completionCount = countStatus(runs, 'completed');
  const failureCount = countStatus(runs, 'failed');
  const stopCount = countStatus(runs, 'stopped');
  const durations = runs.flatMap(run => {
    if (!run.startedAt || !run.finishedAt) return [];
    const duration = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    return Number.isFinite(duration) && duration >= 0 ? [duration] : [];
  });

  return {
    definitionId,
    spawnCount,
    spawnRatePerMinute: spawnCount / durationMinutes,
    completionCount,
    failureCount,
    stopCount,
    activeCount: spawnCount - completionCount - failureCount - stopCount,
    completionRate: completionCount / spawnCount,
    failureRate: failureCount / spawnCount,
    stopRate: stopCount / spawnCount,
    runDurationMs: durationDistribution(durations),
  };
}

function countStatus(runs: readonly BeastRun[], status: BeastRun['status']): number {
  return runs.filter(run => run.status === status).length;
}

function durationDistribution(values: readonly number[]): BeastRunDurationDistribution {
  if (values.length === 0) {
    return { count: 0, min: null, p50: null, p95: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0]!,
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    max: sorted.at(-1)!,
  };
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  const index = Math.ceil(percentile * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}
