import { describe, it, expect, vi } from 'vitest';
import { LinearPlanner } from '../../../src/planners/linear';
import { PlanGraph } from '../../../src/core/dag';
import { createTaskId } from '../../../src/core/types';
import type { Task, TaskResult } from '../../../src/core/types';
import type { PlanContext } from '../../../src/planners/types';

function makeTask(id: string): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
  };
}

function success(id: string): TaskResult {
  return { status: 'success', taskId: createTaskId(id) };
}

function failure(id: string, message = 'task failed'): TaskResult {
  return { status: 'failure', taskId: createTaskId(id), error: new Error(message) };
}

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('LinearPlanner — happy path', () => {
  it('has name "linear"', () => {
    expect(new LinearPlanner().name).toBe('linear');
  });

  it('returns completed for an empty graph without calling executor', async () => {
    const executor = vi.fn();
    const result = await new LinearPlanner().execute(PlanGraph.empty(), { executor });
    expect(result.status).toBe('completed');
    expect(executor).not.toHaveBeenCalled();
  });

  it('executes a single task and returns completed', async () => {
    const task = makeTask('t-1');
    const graph = PlanGraph.empty().addTask(task);
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const context: PlanContext = { executor };

    const result = await new LinearPlanner().execute(graph, context);

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith(task);
  });

  it('executes tasks in topological order', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const c = makeTask('c');
    const graph = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')])
      .addTask(c, [createTaskId('b')]);

    const callOrder: string[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      callOrder.push(task.id);
      return Promise.resolve(success(task.id));
    });

    await new LinearPlanner().execute(graph, { executor });

    expect(callOrder).toEqual([createTaskId('a'), createTaskId('b'), createTaskId('c')]);
  });

  it('collects all task results on full success', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1')).addTask(makeTask('t-2'));
    const executor = vi.fn().mockResolvedValueOnce(success('t-1')).mockResolvedValueOnce(success('t-2'));

    const result = await new LinearPlanner().execute(graph, { executor });

    if (result.status !== 'completed') throw new Error('unexpected status');
    expect(result.taskResults).toHaveLength(2);
  });
});

// ─── Failure handling ────────────────────────────────────────────────────────

describe('LinearPlanner — failure handling', () => {
  it('returns failed when a task fails', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const executor = vi.fn().mockResolvedValueOnce(success('t-1')).mockResolvedValueOnce(failure('t-2', 'task exploded'));

    const result = await new LinearPlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('t-2'));
    expect(result.error.message).toBe('task exploded');
  });

  it('stops execution after the first failure — subsequent tasks not called', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')])
      .addTask(makeTask('t-3'), [createTaskId('t-2')]);
    const executor = vi.fn()
      .mockResolvedValueOnce(success('t-1'))
      .mockResolvedValueOnce(failure('t-2'));

    await new LinearPlanner().execute(graph, { executor });

    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('includes all results (success + failure) up to the failing task', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const executor = vi.fn()
      .mockResolvedValueOnce(success('t-1'))
      .mockResolvedValueOnce(failure('t-2'));

    const result = await new LinearPlanner().execute(graph, { executor });

    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(2);
    expect(result.taskResults[0]?.status).toBe('success');
    expect(result.taskResults[1]?.status).toBe('failure');
  });
});
