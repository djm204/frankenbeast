import { describe, it, expect, vi } from 'vitest';
import { RecursivePlanner } from '../../../../src/planner/planners/recursive';
import { RecursionDepthExceededError } from '../../../../src/planner/core/errors';
import { PlanGraph } from '../../../../src/planner/core/dag';
import { createTaskId } from '../../../../src/planner/core/types';
import type { Task, TaskResult } from '../../../../src/planner/core/types';

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

function expand(id: string, newTasks: Task[]): TaskResult {
  return { status: 'success', taskId: createTaskId(id), expand: true, newTasks };
}

function failure(id: string, message = 'task failed'): TaskResult {
  return { status: 'failure', taskId: createTaskId(id), error: new Error(message) };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('RecursivePlanner — happy path', () => {
  it('has name "recursive"', () => {
    expect(new RecursivePlanner().name).toBe('recursive');
  });

  it('returns completed for an empty graph without calling executor', async () => {
    const executor = vi.fn();
    const result = await new RecursivePlanner().execute(PlanGraph.empty(), { executor });
    expect(result.status).toBe('completed');
    expect(executor).not.toHaveBeenCalled();
  });

  it('executes a single non-expanding task', async () => {
    const task = makeTask('t-1');
    const graph = PlanGraph.empty().addTask(task);
    const executor = vi.fn().mockResolvedValue(success('t-1'));

    const result = await new RecursivePlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith(task);
  });

  it('executes tasks in topological order (linear chain)', async () => {
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

    await new RecursivePlanner().execute(graph, { executor });

    expect(callOrder).toEqual([
      createTaskId('a'),
      createTaskId('b'),
      createTaskId('c'),
    ]);
  });

  it('expands a task into sub-tasks and executes them', async () => {
    const sub1 = makeTask('sub-1');
    const sub2 = makeTask('sub-2');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [sub1, sub2]))
      .mockResolvedValueOnce(success('sub-1'))
      .mockResolvedValueOnce(success('sub-2'));

    const result = await new RecursivePlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it('collects all results including sub-task results', async () => {
    const sub1 = makeTask('sub-1');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [sub1]))
      .mockResolvedValueOnce(success('sub-1'));

    const result = await new RecursivePlanner().execute(graph, { executor });

    if (result.status !== 'completed') throw new Error('unexpected');
    // expand result + sub-task result
    expect(result.taskResults).toHaveLength(2);
  });

  it('sub-tasks respect their own dependency order', async () => {
    const sub1 = makeTask('sub-1');
    const sub2: Task = {
      ...makeTask('sub-2'),
      dependsOn: [createTaskId('sub-1')],
    };
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const callOrder: string[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      callOrder.push(task.id);
      if (task.id === createTaskId('parent')) return Promise.resolve(expand('parent', [sub1, sub2]));
      return Promise.resolve(success(task.id));
    });

    await new RecursivePlanner().execute(graph, { executor });

    expect(callOrder.indexOf(createTaskId('sub-1'))).toBeLessThan(
      callOrder.indexOf(createTaskId('sub-2'))
    );
  });

  it('handles nested expansion (depth 2)', async () => {
    const grandchild = makeTask('grandchild');
    const child = makeTask('child');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [child]))
      .mockResolvedValueOnce(expand('child', [grandchild]))
      .mockResolvedValueOnce(success('grandchild'));

    const result = await new RecursivePlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(3);
  });
});

// ─── Failure handling ─────────────────────────────────────────────────────────

describe('RecursivePlanner — failure handling', () => {
  it('returns failed when a top-level task fails', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(failure('t-1', 'exploded'));

    const result = await new RecursivePlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('t-1'));
    expect(result.error.message).toBe('exploded');
  });

  it('stops execution after the first failure — subsequent tasks not called', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')])
      .addTask(makeTask('t-3'), [createTaskId('t-2')]);

    const executor = vi.fn()
      .mockResolvedValueOnce(success('t-1'))
      .mockResolvedValueOnce(failure('t-2'));

    await new RecursivePlanner().execute(graph, { executor });

    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('returns failed when a sub-task fails', async () => {
    const sub = makeTask('sub');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [sub]))
      .mockResolvedValueOnce(failure('sub', 'sub exploded'));

    const result = await new RecursivePlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.error.message).toBe('sub exploded');
  });

  it('throws RecursionDepthExceededError when maxDepth exceeded', async () => {
    const child = makeTask('child');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    // maxDepth=0: _exec starts at depth=0 (ok), expands → recurses at depth=1 which > 0
    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [child]))
      .mockResolvedValue(success('child'));

    await expect(
      new RecursivePlanner(0).execute(graph, { executor })
    ).rejects.toThrowError(RecursionDepthExceededError);
  });
});
