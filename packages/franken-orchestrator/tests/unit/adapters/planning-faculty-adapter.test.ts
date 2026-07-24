import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteBrain } from '@franken/brain';
import type { IPlannerModule, PlanGraph, PlanIntent, PlanTask } from '../../../src/deps.js';
import { PlanningFacultyAdapter } from '../../../src/adapters/planning-faculty-adapter.js';

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
