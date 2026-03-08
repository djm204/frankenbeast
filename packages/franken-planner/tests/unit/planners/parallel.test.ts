import { describe, it, expect, vi } from 'vitest';
import { ParallelPlanner } from '../../../src/planners/parallel';
import { PlanGraph } from '../../../src/core/dag';
import { createTaskId } from '../../../src/core/types';
import type { Task, TaskResult } from '../../../src/core/types';

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

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('ParallelPlanner — happy path', () => {
  it('has name "parallel"', () => {
    expect(new ParallelPlanner().name).toBe('parallel');
  });

  it('returns completed for an empty graph without calling executor', async () => {
    const executor = vi.fn();
    const result = await new ParallelPlanner().execute(PlanGraph.empty(), { executor });
    expect(result.status).toBe('completed');
    expect(executor).not.toHaveBeenCalled();
  });

  it('executes a single task and returns completed', async () => {
    const task = makeTask('t-1');
    const graph = PlanGraph.empty().addTask(task);
    const executor = vi.fn().mockResolvedValue(success('t-1'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith(task);
  });

  it('executes independent tasks concurrently in the same wave', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const graph = PlanGraph.empty().addTask(a).addTask(b);

    const callOrder: string[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      callOrder.push(task.id);
      return Promise.resolve(success(task.id));
    });

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(2);
    expect(callOrder).toContain(createTaskId('a'));
    expect(callOrder).toContain(createTaskId('b'));
  });

  it('respects task dependencies — dependent runs after its prereq', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const graph = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')]);

    const callOrder: string[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      callOrder.push(task.id);
      return Promise.resolve(success(task.id));
    });

    await new ParallelPlanner().execute(graph, { executor });

    expect(callOrder.indexOf(createTaskId('a'))).toBeLessThan(
      callOrder.indexOf(createTaskId('b'))
    );
  });

  it('diamond A→{B,C}→D: B and C run concurrently', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const c = makeTask('c');
    const d = makeTask('d');
    const graph = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')])
      .addTask(c, [createTaskId('a')])
      .addTask(d, [createTaskId('b'), createTaskId('c')]);

    const executor = vi.fn().mockImplementation((task: Task) =>
      Promise.resolve(success(task.id))
    );

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(4);
  });

  it('collects all task results on full success', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1')).addTask(makeTask('t-2'));
    const executor = vi.fn()
      .mockResolvedValueOnce(success('t-1'))
      .mockResolvedValueOnce(success('t-2'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    if (result.status !== 'completed') throw new Error('unexpected status');
    expect(result.taskResults).toHaveLength(2);
  });
});

// ─── Failure handling ─────────────────────────────────────────────────────────

describe('ParallelPlanner — failure handling', () => {
  it('returns failed when a task fails', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(failure('t-1', 'boom'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('t-1'));
    expect(result.error.message).toBe('boom');
  });

  it('does not start next wave after failure in current wave', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const graph = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')]);

    const executor = vi.fn().mockResolvedValueOnce(failure('a'));

    await new ParallelPlanner().execute(graph, { executor });

    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('collects results including the failure', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const graph = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')]);

    const executor = vi.fn()
      .mockResolvedValueOnce(success('a'))
      .mockResolvedValueOnce(failure('b'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(2);
    expect(result.taskResults[0]?.status).toBe('success');
    expect(result.taskResults[1]?.status).toBe('failure');
  });

  it('returns first failure when multiple tasks fail in the same wave', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const graph = PlanGraph.empty().addTask(a).addTask(b);

    const executor = vi.fn()
      .mockResolvedValueOnce(failure('a', 'a-failed'))
      .mockResolvedValueOnce(failure('b', 'b-failed'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    // Both results collected
    expect(result.taskResults).toHaveLength(2);
  });
});
