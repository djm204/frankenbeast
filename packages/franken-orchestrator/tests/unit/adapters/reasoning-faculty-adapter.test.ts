import { afterEach, describe, expect, it, vi } from 'vitest';

import { SqliteBrain } from '@franken/brain';
import { ReasoningFacultyAdapter } from '../../../src/adapters/reasoning-faculty-adapter.js';
import type { CritiqueResult, ICritiqueModule, PlanGraph } from '../../../src/deps.js';

describe('ReasoningFacultyAdapter', () => {
  const brains: SqliteBrain[] = [];

  afterEach(() => {
    for (const brain of brains.splice(0)) {
      brain.close();
    }
  });

  it('delegates critique unchanged and records its verdict as a recallable episode', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const result = {
      verdict: 'warn' as const,
      findings: [{ evaluator: 'factuality', severity: 'medium', message: 'Verify the claim' }],
      score: 0.75,
    };
    const critique: ICritiqueModule = {
      reviewPlan: vi.fn(async () => result),
    };
    const faculty = new ReasoningFacultyAdapter(
      critique,
      brain,
      () => new Date('2026-07-24T12:00:00.000Z'),
    );
    const plan: PlanGraph = {
      tasks: [{ id: 'task-1', objective: 'Check the claim', requiredSkills: [], dependsOn: [] }],
    };
    const context = { source: 'test' };

    await expect(faculty.reviewPlan(plan, context)).resolves.toBe(result);
    expect(critique.reviewPlan).toHaveBeenCalledWith(plan, context);
    expect(faculty).toMatchObject({ kind: 'reasoning', configured: true });
    const verdictEpisode = brain.episodic.recall('reasoning verdict warn').find(
      (episode) => episode.step === 'reasoning:critique',
    );
    expect(verdictEpisode).toEqual(expect.objectContaining({
      type: 'decision',
      step: 'reasoning:critique',
      summary: 'Reasoning verdict: warn',
      createdAt: '2026-07-24T12:00:00.000Z',
      details: expect.objectContaining({
          verdict: 'warn',
          score: 0.75,
          findingCount: 1,
          severities: ['medium'],
          taskCount: 1,
      }),
    }));
    const consultationEpisode = brain.episodic.recent().find(
      (episode) => episode.step === 'reasoning:lesson-consultation',
    );
    expect(consultationEpisode).toMatchObject({
      type: 'observation',
      details: {
        category: 'lesson-consultation',
        faculty: 'reasoning',
        query: 'Check the claim',
        lessonCount: 0,
        lessonKeys: [],
      },
    });
    expect(consultationEpisode!.id).toBeLessThan(verdictEpisode!.id!);
  });

  it('records a failed verdict as a decision rather than an execution failure', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const faculty = new ReasoningFacultyAdapter(
      { reviewPlan: async () => ({ verdict: 'fail', findings: [], score: 0 }) },
      brain,
      () => new Date('2026-07-24T12:00:00.000Z'),
    );

    await faculty.reviewPlan({ tasks: [] });

    expect(brain.episodic.recentFailures()).toEqual([]);
    expect(brain.episodic.recall('reasoning verdict fail').find(
      (episode) => episode.step === 'reasoning:critique',
    )).toEqual(expect.objectContaining({
      type: 'decision',
      summary: expect.stringContaining('Reasoning verdict: fail'),
    }));
  });

  it('coalesces automatic bounded consolidation after negative verdicts', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const consolidate = vi.fn((options) => brain.learning.consolidate(options));
    const faculty = new ReasoningFacultyAdapter(
      { reviewPlan: async () => ({
        verdict: 'fail',
        findings: [{ evaluator: 'verification', severity: 'high', message: 'Build failed' }],
        score: 0,
      }) },
      {
        episodic: brain.episodic,
        learning: {
          kind: 'learning',
          configured: true,
          consolidate,
          relevantLessons: brain.learning.relevantLessons,
        },
      },
      () => new Date('2026-07-24T12:00:00.000Z'),
    );

    await faculty.reviewPlan({ tasks: [] });
    await faculty.reviewPlan({ tasks: [] });
    await faculty.reviewPlan({ tasks: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(consolidate).toHaveBeenLastCalledWith({
      threshold: 3,
      lookback: 100,
      similarityThreshold: 0.5,
    });
    expect(brain.learning.relevantLessons('reasoning verdict fail')).toEqual([
      expect.objectContaining({
        occurrenceCount: 3,
        evidenceEventIds: [2, 4, 6],
      }),
    ]);
  });

  it('keeps failed reasoning lesson patterns relevant to later objective consultations', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const result: CritiqueResult = {
      verdict: 'fail',
      findings: [],
      score: 0.2,
    };
    const critique: ICritiqueModule = { reviewPlan: vi.fn().mockResolvedValue(result) };
    const faculty = new ReasoningFacultyAdapter(
      critique,
      brain,
      () => new Date('2025-01-01T00:00:00.000Z'),
    );
    const plan = {
      tasks: [{
        id: 'task-1',
        objective: 'Verify workspace declaration output',
        requiredSkills: [],
        dependsOn: [],
      }],
    };

    await faculty.reviewPlan(plan);
    await faculty.reviewPlan(plan);
    await faculty.reviewPlan(plan);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(brain.learning.relevantLessons('workspace declaration output')).toEqual([
      expect.objectContaining({ occurrenceCount: 3 }),
    ]);
  });

  it('stops reading objectives once the bounded consultation prefix is full', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const critique: ICritiqueModule = {
      reviewPlan: vi.fn(async () => ({ verdict: 'pass' as const, findings: [], score: 1 })),
    };
    const faculty = new ReasoningFacultyAdapter(
      critique,
      brain,
      () => new Date('2025-01-01T00:00:00.000Z'),
    );
    const unreadTask = {
      id: 'unread',
      get objective(): string {
        throw new Error('objective beyond bounded prefix was read');
      },
      requiredSkills: [],
      dependsOn: [],
    };

    await expect(faculty.reviewPlan({
      tasks: [{
        id: 'prefix',
        objective: 'x'.repeat(3_000),
        requiredSkills: [],
        dependsOn: [],
      }, unreadTask],
    })).resolves.toEqual({ verdict: 'pass', findings: [], score: 1 });
  });

  it('can delegate without recording when memory is disabled', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const critique: ICritiqueModule = {
      reviewPlan: vi.fn(async () => ({ verdict: 'pass' as const, findings: [], score: 1 })),
    };
    const faculty = new ReasoningFacultyAdapter(
      critique,
      brain,
      () => new Date('2026-07-24T12:00:00.000Z'),
      { recordEpisodes: false },
    );
    const planWithUnreadObjective = {
      tasks: [{
        id: 'disabled',
        get objective(): string {
          throw new Error('disabled memory must not inspect objectives');
        },
        requiredSkills: [],
        dependsOn: [],
      }],
    };

    await expect(faculty.reviewPlan(planWithUnreadObjective)).resolves.toMatchObject({ verdict: 'pass' });
    expect(critique.reviewPlan).toHaveBeenCalledOnce();
    expect(brain.episodic.count()).toBe(0);
  });

  it('checks health through the wrapped critique without recording an episode', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const critique: ICritiqueModule = {
      reviewPlan: vi.fn(async () => ({ verdict: 'pass' as const, findings: [], score: 1 })),
    };
    const faculty = new ReasoningFacultyAdapter(
      critique,
      brain,
      () => new Date('2026-07-24T12:00:00.000Z'),
    );

    await faculty.checkHealth();

    expect(critique.reviewPlan).toHaveBeenCalledWith({ tasks: [] });
    expect(brain.episodic.count()).toBe(0);
  });
});
