import { createHash } from 'node:crypto';
import type { CritiqueLesson } from '../types/contracts.js';
import { createTaskId } from '../types/common.js';

export interface BlockerPatternMiningOptions {
  /** Minimum number of distinct task IDs required before a blocker is reported as cross-task. */
  readonly minTaskCount?: number;
  /** Maximum number of patterns to return after deterministic scoring and tie-breaking. */
  readonly maxPatterns?: number;
  /** Maximum representative lessons to include per pattern. */
  readonly maxExamplesPerPattern?: number;
}

export interface BlockerPatternExample {
  readonly taskId: string;
  readonly failureDescription: string;
  readonly correctionApplied: string;
  readonly timestamp: string;
}

export interface CrossTaskBlockerPattern {
  /** Stable ID derived from evaluator and normalized blocker signature. */
  readonly id: string;
  readonly evaluatorName: string;
  /** Human-readable normalized blocker text used for grouping. */
  readonly blockerSignature: string;
  readonly taskIds: readonly string[];
  readonly taskCount: number;
  readonly occurrenceCount: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** Higher scores should be promoted first by PM/liveness tooling. */
  readonly score: number;
  readonly recommendation: string;
  readonly examples: readonly BlockerPatternExample[];
}

export interface BlockerPatternMiningResult {
  readonly patterns: readonly CrossTaskBlockerPattern[];
  readonly analyzedLessonCount: number;
  readonly discardedLessonCount: number;
  readonly warnings: readonly string[];
}

interface CandidatePattern {
  readonly evaluatorName: string;
  readonly signature: string;
  readonly lessons: CritiqueLesson[];
}

interface NormalizedLesson {
  readonly lesson: CritiqueLesson;
  readonly evaluatorName: string;
  readonly signature: string;
}

const DEFAULT_MIN_TASK_COUNT = 2;
const DEFAULT_MAX_PATTERNS = 10;
const DEFAULT_MAX_EXAMPLES = 3;

/**
 * Mine repeated critique blockers across completed tasks.
 *
 * The miner intentionally uses deterministic local grouping instead of an LLM:
 * it normalizes blocker text, requires at least two distinct task IDs by default,
 * and returns structured evidence that PM handoffs or liveness dashboards can
 * consume directly. Lessons that are missing a task, evaluator, or failure text
 * are discarded with a warning instead of silently skewing pattern scores.
 */
export function mineCrossTaskBlockerPatterns(
  lessons: readonly CritiqueLesson[],
  options: BlockerPatternMiningOptions = {},
): BlockerPatternMiningResult {
  const minTaskCount = positiveIntegerOrDefault(options.minTaskCount, DEFAULT_MIN_TASK_COUNT);
  const maxPatterns = positiveIntegerOrDefault(options.maxPatterns, DEFAULT_MAX_PATTERNS);
  const maxExamples = positiveIntegerOrDefault(options.maxExamplesPerPattern, DEFAULT_MAX_EXAMPLES);

  const warnings: string[] = [];
  const normalizedLessons: NormalizedLesson[] = [];
  let discardedLessonCount = 0;

  lessons.forEach((lesson, index) => {
    const evaluatorName = lesson.evaluatorName.trim();
    const taskId = lesson.taskId.trim();
    const signature = normalizeBlockerDescription(lesson.failureDescription);

    if (!evaluatorName || !taskId || !signature) {
      discardedLessonCount += 1;
      warnings.push(`Discarded lesson at index ${index}: evaluatorName, taskId, and failureDescription are required.`);
      return;
    }

    normalizedLessons.push({
      lesson: { ...lesson, evaluatorName, taskId: createTaskId(taskId) },
      evaluatorName,
      signature,
    });
  });

  const grouped = new Map<string, CandidatePattern>();
  for (const item of normalizedLessons) {
    const key = `${item.evaluatorName}\0${item.signature}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.lessons.push(item.lesson);
    } else {
      grouped.set(key, {
        evaluatorName: item.evaluatorName,
        signature: item.signature,
        lessons: [item.lesson],
      });
    }
  }

  const patterns = Array.from(grouped.values())
    .map((candidate) => buildPattern(candidate, maxExamples))
    .filter((pattern): pattern is CrossTaskBlockerPattern => pattern !== undefined && pattern.taskCount >= minTaskCount)
    .sort(comparePatterns)
    .slice(0, maxPatterns);

  if (patterns.length === 0 && normalizedLessons.length > 0) {
    warnings.push(`No cross-task blocker patterns met minTaskCount=${minTaskCount}.`);
  }

  return {
    patterns,
    analyzedLessonCount: normalizedLessons.length,
    discardedLessonCount,
    warnings,
  };
}

export function normalizeBlockerDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/`[^`]+`/g, '<code>')
    .replace(/["'][^"']+["']/g, '<quoted>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<number>')
    .replace(/[^a-z0-9<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPattern(candidate: CandidatePattern, maxExamples: number): CrossTaskBlockerPattern | undefined {
  const orderedLessons = [...candidate.lessons].sort(compareLessonsByTimestampThenTask);
  const firstLesson = orderedLessons[0];
  const lastLesson = orderedLessons.at(-1);
  if (!firstLesson || !lastLesson) return undefined;

  const taskIds = Array.from(new Set(orderedLessons.map((lesson) => lesson.taskId))).sort();
  const occurrenceCount = orderedLessons.length;
  const taskCount = taskIds.length;
  const score = taskCount * 10 + occurrenceCount;

  return {
    id: stablePatternId(candidate.evaluatorName, candidate.signature),
    evaluatorName: candidate.evaluatorName,
    blockerSignature: candidate.signature,
    taskIds,
    taskCount,
    occurrenceCount,
    firstSeen: firstLesson.timestamp,
    lastSeen: lastLesson.timestamp,
    score,
    recommendation: `Promote guidance for ${candidate.evaluatorName} blocker "${candidate.signature}"; seen in ${taskCount} tasks (${occurrenceCount} lessons).`,
    examples: orderedLessons.slice(0, maxExamples).map((lesson) => ({
      taskId: lesson.taskId,
      failureDescription: lesson.failureDescription,
      correctionApplied: lesson.correctionApplied,
      timestamp: lesson.timestamp,
    })),
  };
}

function comparePatterns(left: CrossTaskBlockerPattern, right: CrossTaskBlockerPattern): number {
  return right.score - left.score
    || right.taskCount - left.taskCount
    || right.occurrenceCount - left.occurrenceCount
    || left.evaluatorName.localeCompare(right.evaluatorName)
    || left.blockerSignature.localeCompare(right.blockerSignature);
}

function compareLessonsByTimestampThenTask(left: CritiqueLesson, right: CritiqueLesson): number {
  return left.timestamp.localeCompare(right.timestamp)
    || left.taskId.localeCompare(right.taskId)
    || left.failureDescription.localeCompare(right.failureDescription);
}

function stablePatternId(evaluatorName: string, signature: string): string {
  const digest = createHash('sha256')
    .update(`${evaluatorName}\0${signature}`)
    .digest('hex')
    .slice(0, 12);
  return `blocker-pattern-${digest}`;
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback;
  return value;
}
