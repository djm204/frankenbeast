import type { CritiqueLesson } from '../types/contracts.js';

export type LearningBacklogPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface LearningBacklogInputItem {
  readonly lesson: CritiqueLesson;
  /** Number of times the same lesson or failure pattern has recurred in worker retrospectives. */
  readonly recurrenceCount?: number;
  /** True when the lesson has already been promoted into durable guidance or retired as obsolete. */
  readonly promotedOrRetired?: boolean;
  /** True when a missing lesson would block PM handoff or worker liveness decisions. */
  readonly handoffBlocking?: boolean;
  /** Optional operator-facing note copied into the report for PM triage. */
  readonly note?: string;
}

export interface LearningBacklogReportOptions {
  readonly generatedAt?: string;
  /** Maximum number of ranked backlog entries to include. Defaults to all active entries. */
  readonly limit?: number;
}

export interface LearningBacklogReportEntry {
  readonly rank: number;
  readonly lessonId: string;
  readonly taskId: string;
  readonly evaluatorName: string;
  readonly priority: LearningBacklogPriority;
  readonly score: number;
  readonly recurrenceCount: number;
  readonly handoffBlocking: boolean;
  readonly verifiedByRegression: boolean;
  readonly sourceFindingMessages: readonly string[];
  readonly recommendedAction: string;
  readonly note?: string;
}

export interface LearningBacklogPrioritizationReport {
  readonly generatedAt: string;
  readonly totalInputCount: number;
  readonly activeCount: number;
  readonly omittedPromotedOrRetiredCount: number;
  readonly entries: readonly LearningBacklogReportEntry[];
  readonly summary: {
    readonly p0Count: number;
    readonly p1Count: number;
    readonly p2Count: number;
    readonly p3Count: number;
    readonly unverifiedCount: number;
  };
}

const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';

export function createLearningBacklogPrioritizationReport(
  items: readonly LearningBacklogInputItem[],
  options: LearningBacklogReportOptions = {},
): LearningBacklogPrioritizationReport {
  const generatedAt = options.generatedAt ?? DEFAULT_GENERATED_AT;
  const activeItems = items.filter((item) => !item.promotedOrRetired);
  const rankedEntries = activeItems
    .map((item) => scoreLearningBacklogItem(item))
    .sort(compareLearningBacklogEntries)
    .slice(0, options.limit ?? activeItems.length)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    generatedAt,
    totalInputCount: items.length,
    activeCount: activeItems.length,
    omittedPromotedOrRetiredCount: items.length - activeItems.length,
    entries: rankedEntries,
    summary: {
      p0Count: rankedEntries.filter((entry) => entry.priority === 'P0').length,
      p1Count: rankedEntries.filter((entry) => entry.priority === 'P1').length,
      p2Count: rankedEntries.filter((entry) => entry.priority === 'P2').length,
      p3Count: rankedEntries.filter((entry) => entry.priority === 'P3').length,
      unverifiedCount: rankedEntries.filter(
        (entry) => !entry.verifiedByRegression,
      ).length,
    },
  };
}

function scoreLearningBacklogItem(
  item: LearningBacklogInputItem,
): Omit<LearningBacklogReportEntry, 'rank'> {
  const traceability = item.lesson.testTraceability ?? [];
  const verifiedByRegression = traceability.some(
    (entry) => entry.testId.length > 0,
  );
  const recurrenceCount = Math.max(1, item.recurrenceCount ?? 1);
  const handoffBlocking = item.handoffBlocking ?? false;
  const sourceFindingMessages = traceability.flatMap(
    (entry) => entry.sourceFindingMessages,
  );

  let score = 0;
  score += Math.min(recurrenceCount, 5) * 10;
  if (handoffBlocking) score += 30;
  if (!verifiedByRegression) score += 25;
  if (
    mentionsCriticalSignal(
      item.lesson.failureDescription,
      sourceFindingMessages,
    )
  )
    score += 20;

  const entry: Omit<LearningBacklogReportEntry, 'rank'> = {
    lessonId: traceability[0]?.lessonId ?? createFallbackLessonId(item.lesson),
    taskId: item.lesson.taskId,
    evaluatorName: item.lesson.evaluatorName,
    priority: priorityFromScore(score),
    score,
    recurrenceCount,
    handoffBlocking,
    verifiedByRegression,
    sourceFindingMessages,
    recommendedAction: recommendedAction({
      verifiedByRegression,
      handoffBlocking,
      recurrenceCount,
    }),
  };

  return item.note === undefined ? entry : { ...entry, note: item.note };
}

function compareLearningBacklogEntries(
  a: Omit<LearningBacklogReportEntry, 'rank'>,
  b: Omit<LearningBacklogReportEntry, 'rank'>,
): number {
  return b.score - a.score || a.lessonId.localeCompare(b.lessonId);
}

function priorityFromScore(score: number): LearningBacklogPriority {
  if (score >= 70) return 'P0';
  if (score >= 50) return 'P1';
  if (score >= 25) return 'P2';
  return 'P3';
}

function recommendedAction(input: {
  readonly verifiedByRegression: boolean;
  readonly handoffBlocking: boolean;
  readonly recurrenceCount: number;
}): string {
  if (!input.verifiedByRegression) {
    return 'Add regression traceability before promotion.';
  }
  if (input.handoffBlocking) {
    return 'Promote into PM handoff guidance before the next worker dispatch.';
  }
  if (input.recurrenceCount > 1) {
    return 'Promote repeated lesson into durable worker guidance.';
  }
  return 'Keep in backlog until the pattern recurs or is retired.';
}

function mentionsCriticalSignal(
  failureDescription: string,
  sourceFindingMessages: readonly string[],
): boolean {
  return [failureDescription, ...sourceFindingMessages].some((message) =>
    /\b(block|critical|security|unsafe|data loss|credential|secret)\b/i.test(
      message,
    ),
  );
}

function createFallbackLessonId(lesson: CritiqueLesson): string {
  return (
    [lesson.taskId, lesson.evaluatorName]
      .map((part) =>
        part
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, ''),
      )
      .filter(Boolean)
      .join(':') || 'unknown:lesson'
  );
}
