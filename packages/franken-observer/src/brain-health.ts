export interface BrainHealthSignals {
  /** Fraction of completed tasks that succeeded. */
  readonly taskSuccessRate: number;
  /** Fraction of reusable input tokens served from cache. */
  readonly cacheHitRatio: number;
  /** Normalized context-compaction pressure; 1 is the configured unhealthy threshold. */
  readonly compactionPressure: number;
  /** Normalized lifecycle discard/retry/orphan pressure; 1 is fully degraded. */
  readonly churnRatio: number;
  /** Normalized CPU/RSS/power pressure; 1 is the configured resource ceiling. */
  readonly resourcePressure: number;
  /** Current spend divided by the configured budget, capped at 1 by callers. */
  readonly budgetBurnRatio: number;
}

export type BrainHealthWeights = Readonly<Record<keyof BrainHealthSignals, number>>;

export interface BrainHealthSample {
  readonly brainId: string;
  readonly score: number;
  readonly signals: BrainHealthSignals;
  readonly weights: BrainHealthWeights;
  readonly timestamp: number;
}

export interface BrainHealthHistoryWindow {
  readonly since?: number;
  readonly before?: number;
  readonly limit?: number;
}

export interface BrainHealthSampleQuery extends BrainHealthHistoryWindow {
  readonly brainId: string;
}

export interface BrainHealthSampleAdapter {
  recordHealthScore(sample: BrainHealthSample): Promise<void>;
  queryHealthScores(query: BrainHealthSampleQuery): Promise<BrainHealthSample[]>;
}

/**
 * Outcome quality receives the largest share. Cache efficiency, context
 * stability, lifecycle stability, and budget headroom are equally weighted;
 * resource pressure receives a smaller share because v1 power data is an
 * estimate rather than a hardware measurement.
 */
export const DEFAULT_BRAIN_HEALTH_WEIGHTS: BrainHealthWeights = Object.freeze({
  taskSuccessRate: 0.3,
  cacheHitRatio: 0.15,
  compactionPressure: 0.15,
  churnRatio: 0.15,
  resourcePressure: 0.1,
  budgetBurnRatio: 0.15,
});

const SIGNAL_NAMES = Object.keys(DEFAULT_BRAIN_HEALTH_WEIGHTS) as Array<keyof BrainHealthSignals>;

/** Returns a deterministic 0–100 score from caller-normalized health signals. */
export function calculateBrainHealthScore(
  signals: BrainHealthSignals,
  weights: BrainHealthWeights = DEFAULT_BRAIN_HEALTH_WEIGHTS,
): number {
  validateWeights(weights);
  for (const name of SIGNAL_NAMES) validateRatio(name, signals[name]);

  const score = (
    signals.taskSuccessRate * weights.taskSuccessRate
    + signals.cacheHitRatio * weights.cacheHitRatio
    + (1 - signals.compactionPressure) * weights.compactionPressure
    + (1 - signals.churnRatio) * weights.churnRatio
    + (1 - signals.resourcePressure) * weights.resourcePressure
    + (1 - signals.budgetBurnRatio) * weights.budgetBurnRatio
  ) * 100;

  return Math.round(score * 100) / 100;
}

/**
 * Computes and persists health snapshots on demand. Callers own cadence so the
 * observer does not create a hidden timer or retain a second in-memory cache.
 */
export class BrainHealthScorer {
  constructor(
    private readonly adapter: BrainHealthSampleAdapter,
    private readonly weights: BrainHealthWeights = DEFAULT_BRAIN_HEALTH_WEIGHTS,
  ) {
    validateWeights(weights);
  }

  async computeAndPersist(
    brainId: string,
    signals: BrainHealthSignals,
    timestamp = Date.now(),
  ): Promise<BrainHealthSample> {
    const normalizedBrainId = requireBrainId(brainId);
    validateTimestamp(timestamp);
    const sample: BrainHealthSample = {
      brainId: normalizedBrainId,
      score: calculateBrainHealthScore(signals, this.weights),
      signals: { ...signals },
      weights: { ...this.weights },
      timestamp,
    };
    await this.adapter.recordHealthScore(sample);
    return sample;
  }

  async getHealthScore(brainId: string): Promise<BrainHealthSample | null> {
    const [latest] = await this.adapter.queryHealthScores({
      brainId: requireBrainId(brainId),
      limit: 1,
    });
    return latest ?? null;
  }

  getHealthHistory(
    brainId: string,
    window: BrainHealthHistoryWindow = {},
  ): Promise<BrainHealthSample[]> {
    return this.adapter.queryHealthScores({
      brainId: requireBrainId(brainId),
      ...window,
    });
  }
}

function validateRatio(name: keyof BrainHealthSignals, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function validateWeights(weights: BrainHealthWeights): void {
  let total = 0;
  for (const name of SIGNAL_NAMES) {
    const weight = weights[name];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`${name} weight must be a non-negative finite number`);
    }
    total += weight;
  }
  if (Math.abs(total - 1) > 1e-9) {
    throw new RangeError(`brain health weights must sum to 1, received ${total}`);
  }
}

function requireBrainId(brainId: string): string {
  const normalized = brainId.trim();
  if (normalized.length === 0) throw new TypeError('brainId must not be empty');
  return normalized;
}

function validateTimestamp(timestamp: number): void {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('health score timestamp must be a non-negative safe integer');
  }
}
