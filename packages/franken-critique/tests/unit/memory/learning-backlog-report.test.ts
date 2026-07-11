import { describe, expect, it } from 'vitest';
import {
  createLearningBacklogPrioritizationReport,
  type LearningBacklogInputItem,
} from '../../../src/memory/learning-backlog-report.js';
import type { CritiqueLesson } from '../../../src/types/contracts.js';

function lesson(overrides: Partial<CritiqueLesson> = {}): CritiqueLesson {
  return {
    evaluatorName: 'safety',
    failureDescription: 'unsafe shell command was proposed',
    correctionApplied: 'Corrected in iteration 1',
    taskId: 'task-123',
    timestamp: '2026-07-11T00:00:00.000Z',
    testTraceability: [
      {
        lessonId: 'task-123:safety:iteration-0',
        taskId: 'task-123',
        evaluatorName: 'safety',
        failingIteration: 0,
        resolvedIteration: 1,
        sourceFindingMessages: ['unsafe shell command was proposed'],
        testId: 'task-123:safety:iteration-0:regression',
        verificationCommand:
          'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      },
    ],
    ...overrides,
  };
}

describe('createLearningBacklogPrioritizationReport', () => {
  it('ranks active lessons by deterministic priority score for PM handoff', () => {
    const items: LearningBacklogInputItem[] = [
      {
        lesson: lesson({
          evaluatorName: 'style',
          failureDescription: 'wordy response',
          taskId: 'task-low',
          testTraceability: [
            {
              lessonId: 'task-low:style:iteration-0',
              taskId: 'task-low',
              evaluatorName: 'style',
              failingIteration: 0,
              resolvedIteration: 1,
              sourceFindingMessages: ['wordy response'],
              testId: 'task-low:style:iteration-0:regression',
              verificationCommand:
                'npm run test --workspace @franken/critique -- --run tests/unit/memory/learning-backlog-report.test.ts',
            },
          ],
        }),
      },
      {
        lesson: lesson({
          evaluatorName: 'security',
          failureDescription: 'critical credential exposure',
          taskId: 'task-high',
          testTraceability: undefined,
        }),
        recurrenceCount: 4,
        handoffBlocking: true,
        note: 'Blocks safe worker dispatch.',
      },
    ];

    const report = createLearningBacklogPrioritizationReport(items, {
      generatedAt: '2026-07-11T12:00:00.000Z',
    });

    expect(report.generatedAt).toBe('2026-07-11T12:00:00.000Z');
    expect(report.totalInputCount).toBe(2);
    expect(report.entries).toEqual([
      expect.objectContaining({
        rank: 1,
        lessonId: 'task-high:security',
        taskId: 'task-high',
        priority: 'P0',
        score: 115,
        recurrenceCount: 4,
        handoffBlocking: true,
        verifiedByRegression: false,
        recommendedAction: 'Add regression traceability before promotion.',
        note: 'Blocks safe worker dispatch.',
      }),
      expect.objectContaining({
        rank: 2,
        lessonId: 'task-low:style:iteration-0',
        priority: 'P3',
        verifiedByRegression: true,
      }),
    ]);
    expect(report.summary).toEqual({
      p0Count: 1,
      p1Count: 0,
      p2Count: 0,
      p3Count: 1,
      unverifiedCount: 1,
    });
  });

  it('omits promoted or retired lessons and reports the omitted count', () => {
    const report = createLearningBacklogPrioritizationReport([
      { lesson: lesson({ taskId: 'active' }) },
      { lesson: lesson({ taskId: 'done' }), promotedOrRetired: true },
    ]);

    expect(report.activeCount).toBe(1);
    expect(report.omittedPromotedOrRetiredCount).toBe(1);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.taskId).toBe('active');
  });

  it('uses a stable timestamp default and empty summary for an empty backlog', () => {
    const report = createLearningBacklogPrioritizationReport([]);

    expect(report.generatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(report.entries).toEqual([]);
    expect(report.summary).toEqual({
      p0Count: 0,
      p1Count: 0,
      p2Count: 0,
      p3Count: 0,
      unverifiedCount: 0,
    });
  });

  it('supports report limits after sorting highest priority first', () => {
    const report = createLearningBacklogPrioritizationReport(
      [
        {
          lesson: lesson({ taskId: 'medium', testTraceability: undefined }),
          recurrenceCount: 2,
        },
        {
          lesson: lesson({ taskId: 'highest', testTraceability: undefined }),
          recurrenceCount: 5,
        },
      ],
      { limit: 1 },
    );

    expect(report.activeCount).toBe(2);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.taskId).toBe('highest');
  });
});
