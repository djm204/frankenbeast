import type {
  LessonEffectivenessEvent,
  LessonEffectivenessOutcome,
  LessonEffectivenessReport,
  LessonEffectivenessTrend,
  LessonInjectionContext,
  LessonLifecycleRecommendation,
  LessonScopeKind,
  LessonScopeMetadata,
} from '../types/contracts.js';

const LESSON_SCOPE_KINDS: readonly LessonScopeKind[] = [
  'global',
  'repo',
  'role',
  'profile',
  'task',
];

export interface LessonEffectivenessRecordInput {
  readonly lessonId: string;
  readonly lessonScope: LessonScopeMetadata;
  readonly injectionContext: Omit<LessonInjectionContext, 'now'>;
  readonly observedAt: string;
  readonly taskSucceeded: boolean;
  readonly blockersBefore: number;
  readonly blockersAfter: number;
  readonly reviewFindingCount: number;
  readonly userCorrection: boolean;
}

interface MutableLessonEffectivenessTrend {
  lessonId: string;
  lessonScope: LessonScopeKind;
  observations: number;
  positive: number;
  neutral: number;
  negative: number;
  correctionSignals: number;
  blockerReductions: number;
  blockerRegressions: number;
}

/**
 * Records transcript-free outcome signals for injected lessons and aggregates
 * them into deterministic lifecycle trends. Raw prompts, finding text, and
 * correction text are deliberately absent from the input and event schemas.
 */
export class LessonEffectivenessTelemetry {
  private readonly events: LessonEffectivenessEvent[] = [];
  private readonly now: () => string;

  constructor(now: () => Date | string = (): Date => new Date()) {
    this.now = (): string => normalizeTimestamp(now(), 'report timestamp');
  }

  record(input: LessonEffectivenessRecordInput): LessonEffectivenessEvent {
    const lessonId = requireNonEmptyString(input.lessonId, 'lessonId');
    const lessonScope = normalizeLessonScope(input.lessonScope?.scope);
    const observedAt = normalizeTimestamp(input.observedAt, 'observedAt');
    const blockersBefore = requireCount(input.blockersBefore, 'blockersBefore');
    const blockersAfter = requireCount(input.blockersAfter, 'blockersAfter');
    const reviewFindingCount = requireCount(
      input.reviewFindingCount,
      'reviewFindingCount',
    );
    if (typeof input.taskSucceeded !== 'boolean') {
      throw new TypeError('taskSucceeded must be a boolean.');
    }
    if (typeof input.userCorrection !== 'boolean') {
      throw new TypeError('userCorrection must be a boolean.');
    }

    const blockerDelta = blockersAfter - blockersBefore;
    const outcome = attributeOutcome({
      taskSucceeded: input.taskSucceeded,
      blockerDelta,
      reviewFindingCount,
      userCorrection: input.userCorrection,
    });
    const event: LessonEffectivenessEvent = {
      schemaVersion: 'lesson-effectiveness-event-v1',
      lessonId,
      lessonScope,
      injectionContext: normalizeInjectionContext(input.injectionContext),
      observedAt,
      outcome,
      signals: {
        taskSucceeded: input.taskSucceeded,
        blockerDelta,
        blockerReduced: blockerDelta < 0,
        reviewFindingCount,
        userCorrection: input.userCorrection,
      },
    };
    this.events.push(event);
    return event;
  }

  report(): LessonEffectivenessReport {
    const trends = new Map<string, MutableLessonEffectivenessTrend>();
    for (const event of this.events) {
      const key = `${event.lessonScope}\u0000${event.lessonId}`;
      const trend = trends.get(key) ?? {
        lessonId: event.lessonId,
        lessonScope: event.lessonScope,
        observations: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        correctionSignals: 0,
        blockerReductions: 0,
        blockerRegressions: 0,
      };
      trend.observations += 1;
      trend[event.outcome] += 1;
      if (event.signals.userCorrection) trend.correctionSignals += 1;
      if (event.signals.blockerDelta < 0) trend.blockerReductions += 1;
      if (event.signals.blockerDelta > 0) trend.blockerRegressions += 1;
      trends.set(key, trend);
    }

    const lessons = [...trends.values()]
      .sort(
        (left, right) =>
          left.lessonId.localeCompare(right.lessonId) ||
          left.lessonScope.localeCompare(right.lessonScope),
      )
      .map(toPublicTrend);

    return {
      schemaVersion: 'lesson-effectiveness-report-v1',
      generatedAt: this.now(),
      totalEvents: this.events.length,
      lessons,
    };
  }
}

function attributeOutcome(signals: {
  readonly taskSucceeded: boolean;
  readonly blockerDelta: number;
  readonly reviewFindingCount: number;
  readonly userCorrection: boolean;
}): LessonEffectivenessOutcome {
  if (
    signals.userCorrection ||
    !signals.taskSucceeded ||
    signals.blockerDelta > 0
  ) {
    return 'negative';
  }
  if (
    signals.taskSucceeded &&
    signals.blockerDelta < 0 &&
    signals.reviewFindingCount === 0
  ) {
    return 'positive';
  }
  return 'neutral';
}

function toPublicTrend(
  trend: MutableLessonEffectivenessTrend,
): LessonEffectivenessTrend {
  const effectivenessScore = roundScore(
    (trend.positive - trend.negative) / trend.observations,
  );
  return {
    lessonId: trend.lessonId,
    lessonScope: trend.lessonScope,
    observations: trend.observations,
    positive: trend.positive,
    neutral: trend.neutral,
    negative: trend.negative,
    effectivenessScore,
    correctionSignals: trend.correctionSignals,
    blockerReductions: trend.blockerReductions,
    blockerRegressions: trend.blockerRegressions,
    lifecycleRecommendation: recommendLifecycle(trend),
  };
}

function recommendLifecycle(
  trend: MutableLessonEffectivenessTrend,
): LessonLifecycleRecommendation {
  if (trend.negative > trend.positive) return 'retire';
  if (trend.positive > trend.negative) return 'promote';
  return 'monitor';
}

function normalizeInjectionContext(
  context: Omit<LessonInjectionContext, 'now'>,
): Omit<LessonInjectionContext, 'now'> {
  if (!context || typeof context !== 'object') {
    throw new TypeError('injectionContext must be an object.');
  }
  return {
    ...(context.repo !== undefined
      ? { repo: requireNonEmptyString(context.repo, 'injectionContext.repo') }
      : {}),
    ...(context.role !== undefined
      ? { role: requireNonEmptyString(context.role, 'injectionContext.role') }
      : {}),
    ...(context.profile !== undefined
      ? {
          profile: requireNonEmptyString(
            context.profile,
            'injectionContext.profile',
          ),
        }
      : {}),
    ...(context.taskId !== undefined
      ? {
          taskId: requireTaskId(context.taskId),
        }
      : {}),
  };
}

function normalizeLessonScope(scope: LessonScopeKind): LessonScopeKind {
  if (!LESSON_SCOPE_KINDS.includes(scope)) {
    throw new RangeError(`Unsupported lesson scope: ${String(scope)}.`);
  }
  return scope;
}

function requireNonEmptyString(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireTaskId(
  value: NonNullable<LessonInjectionContext['taskId']>,
): NonNullable<LessonInjectionContext['taskId']> {
  requireNonEmptyString(value, 'injectionContext.taskId');
  return value;
}

function requireCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizeTimestamp(value: Date | string, label: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`${label} must be a valid timestamp.`);
  }
  return date.toISOString();
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
