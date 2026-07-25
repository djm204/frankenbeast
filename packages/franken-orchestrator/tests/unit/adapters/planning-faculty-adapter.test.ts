import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteBrain } from '@franken/brain';
import type { IPlannerModule, PlanGraph, PlanIntent, PlanTask } from '../../../src/deps.js';
import {
  PlanningFacultyAdapter,
  type PlanningFacultyAdapterOptions,
} from '../../../src/adapters/planning-faculty-adapter.js';

function planTask(id: string, objective: string): PlanTask {
  return { id, objective, requiredSkills: [], dependsOn: [] };
}

describe('PlanningFacultyAdapter', () => {
  const brains: SqliteBrain[] = [];

  afterEach(() => {
    for (const brain of brains.splice(0)) brain.close();
  });

  function makeBrain(): SqliteBrain {
    const brain = new SqliteBrain(':memory:');
    brains.push(brain);
    return brain;
  }

  it('delegates without recording lifecycle episodes when recording is disabled', async () => {
    const brain = makeBrain();
    const delegate: IPlannerModule = {
      createPlan: vi.fn().mockResolvedValue({ tasks: [] }),
    };
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic, {
      recordEpisodes: false,
    });

    await expect(faculty.createPlan({ goal: 'Run without memory' })).resolves.toEqual({ tasks: [] });
    faculty.recordStepFailed(planTask('disabled', 'Do not persist'), new Error('must not persist'));

    expect(brain.episodic.recent()).toEqual([]);
  });

  it('delegates plan creation unchanged and records a recallable plan episode', async () => {
    const intent: PlanIntent = { goal: 'Ship the planning adapter' };
    const plan: PlanGraph = { tasks: [planTask('implement', 'Implement adapter')] };
    const delegate: IPlannerModule = { createPlan: vi.fn().mockResolvedValue(plan) };
    const brain = makeBrain();
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic);

    brain.attachPlanningFaculty(faculty);

    await expect(brain.planning.createPlan(intent)).resolves.toBe(plan);
    expect(delegate.createPlan).toHaveBeenCalledWith(intent);
    expect(brain.planning.kind).toBe('planning');
    expect(brain.planning.configured).toBe(true);

    const [episode] = brain.episodic.recall('plan created planning adapter');
    expect(episode).toMatchObject({
      type: 'decision',
      step: 'planning',
      details: { taskCount: 1, taskIds: ['implement'] },
    });
  });

  it('consults bounded relevant lessons before planning and records the consulted keys', async () => {
    const intent: PlanIntent = { goal: 'Repair the workspace TypeScript build' };
    const delegate: IPlannerModule = { createPlan: vi.fn().mockResolvedValue({ tasks: [] }) };
    const brain = makeBrain();
    const relevantLessons = vi.fn().mockReturnValue([
      {
        kind: 'consolidated-lesson',
        key: 'lesson.review.stale-declarations',
        status: 'approved',
        pattern: 'Build workspace declarations before package typecheck',
        keywords: ['build', 'workspace'],
        occurrenceCount: 3,
        confidence: 0.65,
        evidenceEventIds: [1, 2, 3],
        firstSeenAt: '2026-07-24T10:00:00.000Z',
        lastSeenAt: '2026-07-24T10:02:00.000Z',
        relevance: 0.75,
      },
    ]);
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic, {
      learning: {
        kind: 'learning',
        configured: true,
        consolidate: brain.learning.consolidate,
        relevantLessons,
      },
    } as PlanningFacultyAdapterOptions);

    await faculty.createPlan(intent);

    expect(relevantLessons).toHaveBeenCalledWith(intent.goal, { limit: 5 });
    expect(relevantLessons.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(delegate.createPlan).mock.invocationCallOrder[0]!,
    );
    expect(brain.episodic.recall('planning consulted relevant lessons').find(
      (episode) => episode.step === 'planning:lesson-consultation',
    )).toMatchObject({
      type: 'observation',
      details: {
        category: 'lesson-consultation',
        faculty: 'planning',
        query: intent.goal,
        lessonCount: 1,
        lessonKeys: ['lesson.review.stale-declarations'],
      },
    });
  });

  it('redacts and byte-bounds lesson queries without changing the delegated intent', async () => {
    const brain = makeBrain();
    const relevantLessons = vi.fn((_query: string) => []);
    const delegate: IPlannerModule = { createPlan: vi.fn().mockResolvedValue({ tasks: [] }) };
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic, {
      learning: {
        kind: 'learning',
        configured: true,
        consolidate: vi.fn(() => []),
        relevantLessons,
      },
    });
    const intent: PlanIntent = {
      goal: `Repair API_TOKEN=super-secret ${'workspace '.repeat(200)}`,
    };

    await faculty.createPlan(intent);

    expect(delegate.createPlan).toHaveBeenCalledWith(intent);
    const query = relevantLessons.mock.calls[0]![0];
    expect(query).not.toContain('super-secret');
    expect(query).toContain('API_TOKEN=<redacted>');
    expect(Buffer.byteLength(query, 'utf8')).toBeLessThanOrEqual(512);
    const consultation = brain.episodic.recent().find(
      (episode) => episode.step === 'planning:lesson-consultation',
    );
    expect(consultation?.details?.query).toBe(query);
  });

  it('does not record a created episode when the delegated planner rejects', async () => {
    const delegate: IPlannerModule = {
      createPlan: vi.fn().mockRejectedValue(new Error('planner unavailable')),
    };
    const brain = makeBrain();
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic);

    await expect(faculty.createPlan({ goal: 'Do not mask the failure' })).rejects.toThrow(
      'planner unavailable',
    );
    expect(brain.episodic.recall('plan created')).toEqual([]);
  });

  it('checks delegate health without recording a fake plan episode', async () => {
    const delegate: IPlannerModule = {
      createPlan: vi.fn().mockResolvedValue({ tasks: [] }),
      checkHealth: vi.fn().mockResolvedValue(undefined),
    };
    const brain = makeBrain();
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic);

    await faculty.checkHealth();

    expect(delegate.checkHealth).toHaveBeenCalledOnce();
    expect(delegate.createPlan).not.toHaveBeenCalled();
    expect(brain.episodic.recall('plan created health check')).toEqual([]);
  });

  it('preserves planner and execution behavior when lifecycle persistence rejects an event', async () => {
    const plan: PlanGraph = { tasks: [] };
    const delegate: IPlannerModule = { createPlan: vi.fn().mockResolvedValue(plan) };
    const brain = makeBrain();
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic);
    vi.spyOn(brain.episodic, 'record').mockImplementation(() => {
      throw new Error('episodic write blocked');
    });

    await expect(faculty.createPlan({ goal: 'Preserve planner result' })).resolves.toBe(plan);
    expect(() => faculty.recordStepCompleted(planTask('done', 'Complete work'))).not.toThrow();
    expect(() => faculty.recordStepFailed(planTask('failed', 'Handle failure'), new Error())).not.toThrow();
  });

  it('records completed and failed steps as queryable lifecycle episodes', () => {
    const delegate: IPlannerModule = { createPlan: vi.fn() };
    const brain = makeBrain();
    const faculty = new PlanningFacultyAdapter(delegate, brain.episodic);
    const completed = planTask('test', 'Run focused tests');
    const failed = planTask('build', 'Build packages');

    faculty.recordStepCompleted(completed);
    faculty.recordStepFailed(failed, new Error('compiler output must not be persisted'));

    expect(brain.episodic.recall('completed focused tests').some(
      (episode) => episode.type === 'success' && episode.step === 'test',
    )).toBe(true);
    const failure = brain.episodic.recall('failed build packages').find(
      (episode) => episode.type === 'failure' && episode.step === 'build',
    );
    expect(failure).toMatchObject({
      type: 'failure',
      step: 'build',
      details: { category: 'planning-lifecycle', taskId: 'build', errorName: 'Error' },
    });
    expect(JSON.stringify(failure)).not.toContain('compiler output must not be persisted');
  });
});
