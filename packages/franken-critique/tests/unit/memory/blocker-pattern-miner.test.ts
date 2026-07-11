import { describe, expect, it } from 'vitest';
import {
  mineCrossTaskBlockerPatterns,
  normalizeBlockerDescription,
} from '../../../src/memory/blocker-pattern-miner.js';
import type { CritiqueLesson } from '../../../src/types/contracts.js';

function lesson(overrides: Partial<CritiqueLesson>): CritiqueLesson {
  return {
    evaluatorName: 'safety',
    failureDescription: 'Sandbox command timed out after 30 seconds',
    correctionApplied: 'Added a bounded timeout and smaller fixture',
    taskId: 'task-a',
    timestamp: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('mineCrossTaskBlockerPatterns', () => {
  it('mines repeated blocker signatures across distinct tasks with structured evidence', () => {
    const result = mineCrossTaskBlockerPatterns([
      lesson({ taskId: 'task-a', timestamp: '2026-07-11T00:00:01.000Z' }),
      lesson({
        taskId: 'task-b',
        failureDescription: 'Sandbox command timed out after 45 seconds!',
        correctionApplied: 'Reduced fixture size',
        timestamp: '2026-07-11T00:00:02.000Z',
      }),
      lesson({
        evaluatorName: 'complexity',
        failureDescription: 'Too many branches in planner',
        taskId: 'task-c',
        timestamp: '2026-07-11T00:00:03.000Z',
      }),
    ]);

    expect(result.analyzedLessonCount).toBe(3);
    expect(result.discardedLessonCount).toBe(0);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^blocker-pattern-[a-f0-9]{12}$/),
      evaluatorName: 'safety',
      blockerSignature: 'sandbox command timed out after <number> seconds',
      taskIds: ['task-a', 'task-b'],
      taskCount: 2,
      occurrenceCount: 2,
      firstSeen: '2026-07-11T00:00:01.000Z',
      lastSeen: '2026-07-11T00:00:02.000Z',
      score: 22,
      recommendation: expect.stringContaining('Promote guidance'),
    }));
    expect(result.patterns[0]!.examples).toHaveLength(2);
  });

  it('does not promote repeated blockers from only one task', () => {
    const result = mineCrossTaskBlockerPatterns([
      lesson({ taskId: 'task-a', timestamp: '2026-07-11T00:00:01.000Z' }),
      lesson({ taskId: 'task-a', timestamp: '2026-07-11T00:00:02.000Z' }),
    ]);

    expect(result.patterns).toEqual([]);
    expect(result.warnings).toContain('No cross-task blocker patterns met minTaskCount=2.');
  });

  it('reports malformed lessons instead of silently mining ambiguous blockers', () => {
    const result = mineCrossTaskBlockerPatterns([
      lesson({ taskId: 'task-a' }),
      lesson({ taskId: '', timestamp: '2026-07-11T00:00:02.000Z' }),
      lesson({ failureDescription: '   ', taskId: 'task-b', timestamp: '2026-07-11T00:00:03.000Z' }),
    ]);

    expect(result.analyzedLessonCount).toBe(1);
    expect(result.discardedLessonCount).toBe(2);
    expect(result.warnings).toEqual([
      'Discarded lesson at index 1: evaluatorName, taskId, and failureDescription are required.',
      'Discarded lesson at index 2: evaluatorName, taskId, and failureDescription are required.',
      'No cross-task blocker patterns met minTaskCount=2.',
    ]);
  });

  it('normalizes volatile literals so equivalent blockers group deterministically', () => {
    expect(normalizeBlockerDescription('Command `npm test` timed out after 30 seconds.')).toBe(
      'command <code> timed out after <number> seconds',
    );
    expect(normalizeBlockerDescription('Command "pnpm test" timed out after 45 seconds!')).toBe(
      'command <quoted> timed out after <number> seconds',
    );
  });
});
