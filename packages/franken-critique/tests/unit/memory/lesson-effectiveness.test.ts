import { describe, expect, it } from 'vitest';
import { LessonEffectivenessTelemetry } from '../../../src/memory/lesson-effectiveness.js';
import type { LessonScopeMetadata } from '../../../src/types/contracts.js';

const lessonScope: LessonScopeMetadata = {
  schemaVersion: 'lesson-scope-v1',
  scope: 'repo',
  allowedRepos: ['djm204/frankenbeast'],
  provenance: { source: 'human-review', taskId: 'source-task' },
  auditTrail: [
    {
      changedAt: '2026-07-01T00:00:00.000Z',
      actor: 'reviewer',
      toScope: 'repo',
      reason: 'Approved for repository reuse.',
    },
  ],
};

describe('LessonEffectivenessTelemetry', () => {
  it('attributes a successful task with blocker reduction as a positive outcome', () => {
    const telemetry = new LessonEffectivenessTelemetry();

    const event = telemetry.record({
      lessonId: 'lesson-cache-verification',
      lessonScope,
      injectionContext: {
        repo: 'djm204/frankenbeast',
        role: 'worker',
        profile: 'default',
        taskId: 'task-positive',
      },
      observedAt: '2026-07-20T00:00:00.000Z',
      taskSucceeded: true,
      blockersBefore: 2,
      blockersAfter: 0,
      reviewFindingCount: 0,
      userCorrection: false,
    });

    expect(event).toMatchObject({
      schemaVersion: 'lesson-effectiveness-event-v1',
      lessonId: 'lesson-cache-verification',
      lessonScope: 'repo',
      injectionContext: {
        repo: 'djm204/frankenbeast',
        role: 'worker',
        profile: 'default',
        taskId: 'task-positive',
      },
      outcome: 'positive',
      signals: {
        taskSucceeded: true,
        blockerDelta: -2,
        blockerReduced: true,
        reviewFindingCount: 0,
        userCorrection: false,
      },
    });

    expect(telemetry.report().lessons[0]).toMatchObject({
      lessonId: 'lesson-cache-verification',
      positive: 1,
      neutral: 0,
      negative: 0,
      effectivenessScore: 1,
      lifecycleRecommendation: 'promote',
    });
  });

  it('attributes an unchanged outcome with no correction as neutral', () => {
    const telemetry = new LessonEffectivenessTelemetry();

    const event = telemetry.record({
      lessonId: 'lesson-cache-verification',
      lessonScope,
      injectionContext: { repo: 'djm204/frankenbeast', taskId: 'task-neutral' },
      observedAt: '2026-07-21T00:00:00.000Z',
      taskSucceeded: true,
      blockersBefore: 0,
      blockersAfter: 0,
      reviewFindingCount: 1,
      userCorrection: false,
    });

    expect(event.outcome).toBe('neutral');
    expect(telemetry.report().lessons[0]).toMatchObject({
      positive: 0,
      neutral: 1,
      negative: 0,
      effectivenessScore: 0,
      lifecycleRecommendation: 'monitor',
    });
  });

  it('attributes a user correction or worsened blockers as negative without retaining prompts', () => {
    const telemetry = new LessonEffectivenessTelemetry();

    const event = telemetry.record({
      lessonId: 'lesson-cache-verification',
      lessonScope,
      injectionContext: {
        repo: 'djm204/frankenbeast',
        taskId: 'task-negative',
      },
      observedAt: '2026-07-22T00:00:00.000Z',
      taskSucceeded: false,
      blockersBefore: 1,
      blockersAfter: 3,
      reviewFindingCount: 2,
      userCorrection: true,
    });

    expect(event.outcome).toBe('negative');
    expect(event.signals).toMatchObject({
      taskSucceeded: false,
      blockerDelta: 2,
      blockerReduced: false,
      reviewFindingCount: 2,
      userCorrection: true,
    });
    expect(event).not.toHaveProperty('prompt');
    expect(event).not.toHaveProperty('rawPrompt');
    expect(JSON.stringify(telemetry.report())).not.toContain('prompt');
    expect(telemetry.report().lessons[0]).toMatchObject({
      positive: 0,
      neutral: 0,
      negative: 1,
      effectivenessScore: -1,
      lifecycleRecommendation: 'retire',
      correctionSignals: 1,
      blockerRegressions: 1,
    });
  });

  it('aggregates trends per lesson and keeps scopes separate', () => {
    const telemetry = new LessonEffectivenessTelemetry();
    const taskScope: LessonScopeMetadata = {
      ...lessonScope,
      scope: 'task',
      allowedRepos: undefined,
      allowedTasks: ['task-scoped'],
    };

    telemetry.record({
      lessonId: 'lesson-a',
      lessonScope,
      injectionContext: { repo: 'djm204/frankenbeast', taskId: 'task-a' },
      observedAt: '2026-07-20T00:00:00.000Z',
      taskSucceeded: true,
      blockersBefore: 1,
      blockersAfter: 0,
      reviewFindingCount: 0,
      userCorrection: false,
    });
    telemetry.record({
      lessonId: 'lesson-a',
      lessonScope,
      injectionContext: { repo: 'djm204/frankenbeast', taskId: 'task-b' },
      observedAt: '2026-07-21T00:00:00.000Z',
      taskSucceeded: false,
      blockersBefore: 0,
      blockersAfter: 0,
      reviewFindingCount: 1,
      userCorrection: true,
    });
    telemetry.record({
      lessonId: 'lesson-b',
      lessonScope: taskScope,
      injectionContext: { taskId: 'task-scoped' },
      observedAt: '2026-07-22T00:00:00.000Z',
      taskSucceeded: true,
      blockersBefore: 0,
      blockersAfter: 0,
      reviewFindingCount: 0,
      userCorrection: false,
    });

    expect(telemetry.report()).toMatchObject({
      schemaVersion: 'lesson-effectiveness-report-v1',
      totalEvents: 3,
      lessons: [
        {
          lessonId: 'lesson-a',
          lessonScope: 'repo',
          observations: 2,
          positive: 1,
          negative: 1,
          lifecycleRecommendation: 'monitor',
        },
        {
          lessonId: 'lesson-b',
          lessonScope: 'task',
          observations: 1,
          neutral: 1,
        },
      ],
    });
  });
});
