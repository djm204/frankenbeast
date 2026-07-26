import type { BeastLifecycleAttempt } from '../types.js';

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
  readonly orphanRetentionMs?: number | undefined;
}

interface ParsedWindow {
  readonly from: number;
  readonly to: number;
  readonly durationMinutes: number;
}

const isoNow = (): string => new Date().toISOString();
const DEFAULT_ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1_000;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/**
 * Computes lifecycle churn from persisted Beast attempts and process-local
 * orphan-sweep observations. Attempts are grouped into start-time cohorts so
 * retries and outcome rates use the matching spawn count as their denominator.
 */
export class BeastLifecycleMetrics {
  private readonly orphanSweepTimes: number[] = [];
  private readonly now: () => string;
  private readonly orphanRetentionMs: number;

  constructor(
    private readonly listAttempts: (window: BeastLifecycleMetricsWindow) => readonly BeastLifecycleAttempt[],
    options: BeastLifecycleMetricsOptions = {},
  ) {
    this.now = options.now ?? isoNow;
    this.orphanRetentionMs = options.orphanRetentionMs ?? DEFAULT_ORPHAN_RETENTION_MS;
    if (!Number.isFinite(this.orphanRetentionMs) || this.orphanRetentionMs <= 0) {
      throw new RangeError('Orphan sweep retention must be a positive number of milliseconds');
    }
  }

  recordOrphanProcessSwept(at: string = this.now()): void {
    const timestamp = parseIsoTimestamp(at);
    if (timestamp === undefined) {
      throw new RangeError('Orphan sweep timestamp must be a valid ISO timestamp');
    }
    insertSorted(this.orphanSweepTimes, timestamp);
    this.pruneOrphanSweeps();
  }

  query(window: BeastLifecycleMetricsWindow): BeastLifecycleMetricsSnapshot {
    const parsedWindow = parseWindow(window);
    const storageWindow = {
      from: new Date(parsedWindow.from).toISOString(),
      to: new Date(parsedWindow.to).toISOString(),
    };
    const cohorts = new Map<string, BeastLifecycleAttempt[]>();

    for (const attempt of this.listAttempts(storageWindow)) {
      const startedAt = parseIsoTimestamp(attempt.startedAt);
      if (startedAt === undefined || startedAt < parsedWindow.from || startedAt >= parsedWindow.to) {
        continue;
      }
      const cohort = cohorts.get(attempt.definitionId) ?? [];
      cohort.push(attempt);
      cohorts.set(attempt.definitionId, cohort);
    }

    const definitions = [...cohorts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([definitionId, attempts]) => aggregateDefinition(definitionId, attempts, parsedWindow.durationMinutes));

    this.pruneOrphanSweeps();

    return {
      window,
      definitions,
      orphanedProcessCount: this.orphanSweepTimes.filter(
        timestamp => timestamp >= parsedWindow.from && timestamp < parsedWindow.to,
      ).length,
    };
  }

  private pruneOrphanSweeps(): void {
    const now = parseIsoTimestamp(this.now());
    if (now === undefined) {
      throw new RangeError('Lifecycle metrics clock must return a valid ISO timestamp');
    }
    const cutoff = now - this.orphanRetentionMs;
    let retainedFrom = 0;
    while (retainedFrom < this.orphanSweepTimes.length && this.orphanSweepTimes[retainedFrom]! < cutoff) {
      retainedFrom += 1;
    }
    if (retainedFrom > 0) {
      this.orphanSweepTimes.splice(0, retainedFrom);
    }
  }
}

function parseWindow(window: BeastLifecycleMetricsWindow): ParsedWindow {
  const from = parseIsoTimestamp(window.from);
  const to = parseIsoTimestamp(window.to);
  if (from === undefined || to === undefined) {
    throw new RangeError('Lifecycle metrics window must contain valid ISO timestamps');
  }
  if (from >= to) {
    throw new RangeError('Lifecycle metrics window from must be before to');
  }
  return { from, to, durationMinutes: (to - from) / 60_000 };
}

function aggregateDefinition(
  definitionId: string,
  attempts: readonly BeastLifecycleAttempt[],
  durationMinutes: number,
): BeastDefinitionLifecycleAggregate {
  const spawnCount = attempts.length;
  const completionCount = countStatus(attempts, 'completed');
  const failureCount = countStatus(attempts, 'failed');
  const stopCount = countStatus(attempts, 'stopped');
  const durations = attempts.flatMap(attempt => {
    if (!attempt.finishedAt) return [];
    const startedAt = parseIsoTimestamp(attempt.startedAt);
    const finishedAt = parseIsoTimestamp(attempt.finishedAt);
    if (startedAt === undefined || finishedAt === undefined) return [];
    const duration = finishedAt - startedAt;
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

function countStatus(attempts: readonly BeastLifecycleAttempt[], status: BeastLifecycleAttempt['status']): number {
  return attempts.filter(attempt => attempt.status === status).length;
}

function parseIsoTimestamp(value: string): number | undefined {
  if (!ISO_UTC_PATTERN.test(value)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(timestamp).toISOString() === normalized ? timestamp : undefined;
}

function insertSorted(values: number[], value: number): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  values.splice(low, 0, value);
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
