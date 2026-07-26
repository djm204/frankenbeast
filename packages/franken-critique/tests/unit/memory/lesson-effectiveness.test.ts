import { describe, expect, it } from 'vitest';
import { LessonEffectivenessTelemetry } from '../../../src/memory/lesson-effectiveness.js';
import { createTaskId } from '../../../src/types/common.js';
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
      injectedAt: '2026-07-20T00:00:00.000Z',
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
      injectedAt: '2026-07-20T00:00:00.000Z',
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
      injectedAt: '2026-07-21T00:00:00.000Z',
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
      injectedAt: '2026-07-22T00:00:00.000Z',
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
      auditTrail: [
        {
          changedAt: '2026-07-01T00:00:00.000Z',
          actor: 'reviewer',
          toScope: 'task',
          reason: 'Approved for one-task attribution.',
        },
      ],
    };

    telemetry.record({
      lessonId: 'lesson-a',
      lessonScope,
      injectionContext: { repo: 'djm204/frankenbeast', taskId: 'task-a' },
      injectedAt: '2026-07-20T00:00:00.000Z',
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
      injectedAt: '2026-07-21T00:00:00.000Z',
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
      injectedAt: '2026-07-22T00:00:00.000Z',
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

  it('requires a true majority before recommending promotion or retirement', () => {
    const telemetry = new LessonEffectivenessTelemetry();
    const observations = [
      { taskId: 'task-majority-positive', blockersBefore: 1, blockersAfter: 0 },
      {
        taskId: 'task-majority-neutral-a',
        blockersBefore: 0,
        blockersAfter: 0,
      },
      {
        taskId: 'task-majority-neutral-b',
        blockersBefore: 0,
        blockersAfter: 0,
      },
    ] as const;

    for (const [index, observation] of observations.entries()) {
      telemetry.record({
        lessonId: 'lesson-majority',
        lessonScope,
        injectionContext: {
          repo: 'djm204/frankenbeast',
          taskId: observation.taskId,
        },
        injectedAt: `2026-07-2${index}T00:00:00.000Z`,
        observedAt: `2026-07-2${index}T00:00:00.000Z`,
        taskSucceeded: true,
        blockersBefore: observation.blockersBefore,
        blockersAfter: observation.blockersAfter,
        reviewFindingCount: 0,
        userCorrection: false,
      });
    }

    expect(telemetry.report().lessons[0]).toMatchObject({
      positive: 1,
      neutral: 2,
      negative: 0,
      lifecycleRecommendation: 'monitor',
    });
  });

  it('keeps aggregation immutable when a caller mutates the returned event', () => {
    const telemetry = new LessonEffectivenessTelemetry();
    const event = telemetry.record({
      lessonId: 'lesson-immutable',
      lessonScope,
      injectionContext: {
        repo: 'djm204/frankenbeast',
        taskId: 'task-immutable',
      },
      injectedAt: '2026-07-23T00:00:00.000Z',
      observedAt: '2026-07-23T00:00:00.000Z',
      taskSucceeded: true,
      blockersBefore: 1,
      blockersAfter: 0,
      reviewFindingCount: 0,
      userCorrection: false,
    });

    (event as { outcome: 'negative' }).outcome = 'negative';

    expect(telemetry.report().lessons[0]).toMatchObject({
      positive: 1,
      negative: 0,
      lifecycleRecommendation: 'promote',
    });
  });

  it('rejects attribution from a context outside the reviewed lesson scope', () => {
    const telemetry = new LessonEffectivenessTelemetry();

    expect(() =>
      telemetry.record({
        lessonId: 'lesson-repo-a-only',
        lessonScope,
        injectionContext: { repo: 'other/repo', taskId: 'task-wrong-repo' },
        injectedAt: '2026-07-24T00:00:00.000Z',
        observedAt: '2026-07-24T00:00:00.000Z',
        taskSucceeded: true,
        blockersBefore: 1,
        blockersAfter: 0,
        reviewFindingCount: 0,
        userCorrection: false,
      }),
    ).toThrow('injection context is outside the reviewed lesson scope');
    expect(telemetry.report().totalEvents).toBe(0);
  });

  it('validates expiry at injection time rather than later outcome time', () => {
    const telemetry = new LessonEffectivenessTelemetry();
    const expiringScope: LessonScopeMetadata = {
      ...lessonScope,
      expiresAt: '2026-07-24T00:30:00.000Z',
    };

    expect(() =>
      telemetry.record({
        lessonId: 'lesson-expiring',
        lessonScope: expiringScope,
        injectionContext: {
          repo: 'djm204/frankenbeast',
          taskId: 'task-long-running',
        },
        injectedAt: '2026-07-24T00:00:00.000Z',
        observedAt: '2026-07-24T01:00:00.000Z',
        taskSucceeded: true,
        blockersBefore: 1,
        blockersAfter: 0,
        reviewFindingCount: 0,
        userCorrection: false,
      }),
    ).not.toThrow();
    expect(telemetry.report().totalEvents).toBe(1);
  });

  it('normalizes incidental whitespace in task IDs before scope validation', () => {
    const telemetry = new LessonEffectivenessTelemetry();
    const taskScope: LessonScopeMetadata = {
      schemaVersion: 'lesson-scope-v1',
      scope: 'task',
      allowedTasks: [createTaskId('task-scoped')],
      provenance: {
        source: 'human-review',
        taskId: createTaskId('source-task'),
      },
      auditTrail: [
        {
          changedAt: '2026-07-01T00:00:00.000Z',
          actor: 'reviewer',
          toScope: 'task',
          reason: 'Approved for one task.',
        },
      ],
    };

    const event = telemetry.record({
      lessonId: 'lesson-task-scoped',
      lessonScope: taskScope,
      injectionContext: { taskId: createTaskId('  task-scoped  ') },
      injectedAt: '2026-07-24T00:00:00.000Z',
      observedAt: '2026-07-24T00:01:00.000Z',
      taskSucceeded: true,
      blockersBefore: 1,
      blockersAfter: 0,
      reviewFindingCount: 0,
      userCorrection: false,
    });

    expect(event.injectionContext.taskId).toBe('task-scoped');
  });

  it('rejects outcomes observed before the lesson was injected', () => {
    const telemetry = new LessonEffectivenessTelemetry();

    expect(() =>
      telemetry.record({
        lessonId: 'lesson-time-order',
        lessonScope,
        injectionContext: {
          repo: 'djm204/frankenbeast',
          taskId: 'task-time-order',
        },
        injectedAt: '2026-07-24T00:01:00.000Z',
        observedAt: '2026-07-24T00:00:00.000Z',
        taskSucceeded: true,
        blockersBefore: 1,
        blockersAfter: 0,
        reviewFindingCount: 0,
        userCorrection: false,
      }),
    ).toThrow('observedAt must not precede injectedAt');
    expect(telemetry.report().totalEvents).toBe(0);
  });

  it('rejects scope approval that postdates the lesson injection', () => {
    const telemetry = new LessonEffectivenessTelemetry();
    const postdatedScope: LessonScopeMetadata = {
      ...lessonScope,
      auditTrail: [
        {
          changedAt: '2026-07-25T00:00:00.000Z',
          actor: 'reviewer',
          toScope: 'repo',
          reason: 'Approved after the attempted injection.',
        },
      ],
    };

    expect(() =>
      telemetry.record({
        lessonId: 'lesson-postdated-scope',
        lessonScope: postdatedScope,
        injectionContext: {
          repo: 'djm204/frankenbeast',
          taskId: 'task-postdated-scope',
        },
        injectedAt: '2026-07-24T00:00:00.000Z',
        observedAt: '2026-07-24T00:01:00.000Z',
        taskSucceeded: true,
        blockersBefore: 1,
        blockersAfter: 0,
        reviewFindingCount: 0,
        userCorrection: false,
      }),
    ).toThrow('injection context is outside the reviewed lesson scope');
    expect(telemetry.report().totalEvents).toBe(0);
  });
});
