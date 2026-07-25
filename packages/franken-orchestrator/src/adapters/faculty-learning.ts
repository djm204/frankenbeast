import type { IEpisodicMemory, ILearningFaculty, RelevantLesson } from '@franken/types';
import { redactSensitiveText } from '../logging/redaction.js';

const MAX_LESSON_QUERY_INPUT_CHARS = 2_048;
const MAX_LESSON_QUERY_BYTES = 512;
const scheduledConsolidations = new WeakSet<ILearningFaculty>();

export const FACULTY_LESSON_POLICY = Object.freeze({
  consultationLimit: 5,
  consolidation: Object.freeze({
    threshold: 3,
    lookback: 100,
    similarityThreshold: 0.5,
  }),
});

export type LessonConsultingFaculty = 'planning' | 'reasoning';

export function consultFacultyLessons(
  faculty: LessonConsultingFaculty,
  query: string,
  episodic: IEpisodicMemory,
  learning: ILearningFaculty | undefined,
  createdAt: string,
): RelevantLesson[] {
  if (!learning) return [];
  try {
    const boundedQuery = prepareFacultyLessonQuery(query);
    const lessons = learning.relevantLessons(boundedQuery, {
      limit: FACULTY_LESSON_POLICY.consultationLimit,
    });
    episodic.record({
      type: 'observation',
      step: `${faculty}:lesson-consultation`,
      summary: `${capitalize(faculty)} consulted relevant lessons: ${lessons.length}`,
      details: {
        category: 'lesson-consultation',
        faculty,
        query: boundedQuery,
        lessonCount: lessons.length,
        lessonKeys: lessons.map((lesson) => lesson.key),
      },
      createdAt,
    });
    return lessons;
  } catch {
    // Lesson consultation is advisory and must not replace planner/critique behavior.
    return [];
  }
}

export function consolidateFacultyNegativeOutcome(
  learning: ILearningFaculty | undefined,
): void {
  if (!learning || scheduledConsolidations.has(learning)) return;
  scheduledConsolidations.add(learning);
  setTimeout(() => {
    scheduledConsolidations.delete(learning);
    try {
      learning.consolidate(FACULTY_LESSON_POLICY.consolidation);
    } catch {
      // Consolidation is review/telemetry work and must not replace a faculty result.
    }
  }, 0);
}

export function prepareFacultyLessonQuery(query: string): string {
  const redacted = redactSensitiveText(query.slice(0, MAX_LESSON_QUERY_INPUT_CHARS))
    .replace(/\s+/gu, ' ')
    .trim();
  return truncateUtf8(redacted, MAX_LESSON_QUERY_BYTES);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let bounded = '';
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    bounded += character;
    bytes += characterBytes;
  }
  return bounded;
}
