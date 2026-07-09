import { describe, it, expect, vi } from 'vitest';
import { ParallelPlanner } from '../../../src/planners/parallel';
import { PlanGraph } from '../../../src/core/dag';
import {
  CyclicDependencyError,
  RationaleRejectedError,
  RecursionDepthExceededError,
} from '../../../src/core/errors';
import { createTaskId } from '../../../src/core/types';
import type { Task, TaskId, TaskResult } from '../../../src/core/types';

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

function cyclicGraph(): PlanGraph {
  const a = makeTask('a');
  const b = makeTask('b');
  const nodes = new Map<TaskId, Task>([
    [a.id, a],
    [b.id, b],
  ]);
  const edges = new Map<TaskId, Set<TaskId>>([
    [a.id, new Set<TaskId>([b.id])],
    [b.id, new Set<TaskId>([a.id])],
  ]);

  return PlanGraph.createWithRawEdges(nodes, edges);
}

function danglingDependencyGraph(): PlanGraph {
  const ready = makeTask('ready');
  const blocked = makeTask('blocked');
  const missing = createTaskId('missing');
  const nodes = new Map<TaskId, Task>([
    [ready.id, ready],
    [blocked.id, blocked],
  ]);
  const edges = new Map<TaskId, Set<TaskId>>([
    [ready.id, new Set<TaskId>()],
    [blocked.id, new Set<TaskId>([missing])],
  ]);

  return PlanGraph.createWithRawEdges(nodes, edges);
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

  it('limits same-wave task execution to the configured concurrency', async () => {
    const tasks = ['a', 'b', 'c', 'd'].map(makeTask);
    const graph = tasks.reduce(
      (currentGraph, task) => currentGraph.addTask(task),
      PlanGraph.empty()
    );
    let active = 0;
    let maxActive = 0;
    const executor = vi.fn().mockImplementation(async (task: Task) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return success(task.id);
    });

    const result = await new ParallelPlanner({ maxWaveConcurrency: 2 }).execute(graph, {
      executor,
    });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(4);
    expect(maxActive).toBe(2);
  });

  it('preserves maxExpansionDepth constructor compatibility while limiting waves', async () => {
    const tasks = ['a', 'b', 'c'].map(makeTask);
    const graph = tasks.reduce(
      (currentGraph, task) => currentGraph.addTask(task),
      PlanGraph.empty()
    );
    let active = 0;
    let maxActive = 0;
    const executor = vi.fn().mockImplementation(async (task: Task) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return success(task.id);
    });

    const result = await new ParallelPlanner(10, { maxWaveConcurrency: 1 }).execute(graph, {
      executor,
    });

    expect(result.status).toBe('completed');
    expect(maxActive).toBe(1);
  });

  it('rejects invalid wave concurrency limits', () => {
    expect(() => new ParallelPlanner({ maxWaveConcurrency: 0 })).toThrow(RangeError);
    expect(() => new ParallelPlanner({ maxWaveConcurrency: 1.5 })).toThrow(RangeError);
  });

  it('supports maxExpansionDepth in the options object', async () => {
    const child = makeTask('child');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);
    const executor = vi.fn().mockResolvedValueOnce(expand('parent', [child]));

    await expect(
      new ParallelPlanner({ maxExpansionDepth: 0, maxWaveConcurrency: 1 }).execute(graph, {
        executor,
      })
    ).rejects.toBeInstanceOf(RecursionDepthExceededError);
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

    expect(callOrder.indexOf(createTaskId('a'))).toBeLessThan(callOrder.indexOf(createTaskId('b')));
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

    const executor = vi.fn().mockImplementation((task: Task) => Promise.resolve(success(task.id)));

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(4);
  });

  it('collects all task results on full success', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1')).addTask(makeTask('t-2'));
    const executor = vi
      .fn()
      .mockResolvedValueOnce(success('t-1'))
      .mockResolvedValueOnce(success('t-2'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    if (result.status !== 'completed') throw new Error('unexpected status');
    expect(result.taskResults).toHaveLength(2);
  });

  it('skips tasks already completed by an earlier recovery iteration', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const executor = vi.fn().mockImplementation((task: Task) => Promise.resolve(success(task.id)));

    const result = await new ParallelPlanner().execute(graph, {
      executor,
      completedTaskIds: new Set([createTaskId('t-1')]),
    });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ id: createTaskId('t-2') }));
    if (result.status !== 'completed') throw new Error('unexpected status');
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual([createTaskId('t-2')]);
  });

  it('ignores completed ids that do not belong to the current graph', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockImplementation((task: Task) => Promise.resolve(success(task.id)));

    const result = await new ParallelPlanner().execute(graph, {
      executor,
      completedTaskIds: new Set([createTaskId('unrelated')]),
    });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledOnce();
  });

  it('executes expanded sub-tasks before starting dependent waves', async () => {
    const parent = makeTask('parent');
    const dependent = makeTask('dependent');
    const sub1 = makeTask('sub-1');
    const sub2: Task = { ...makeTask('sub-2'), dependsOn: [createTaskId('sub-1')] };
    const graph = PlanGraph.empty()
      .addTask(parent)
      .addTask(dependent, [createTaskId('parent')]);
    const callOrder: string[] = [];

    const executor = vi.fn().mockImplementation((task: Task) => {
      callOrder.push(task.id);
      if (task.id === createTaskId('parent')) {
        return Promise.resolve(expand('parent', [sub1, sub2]));
      }
      return Promise.resolve(success(task.id));
    });

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('completed');
    expect(callOrder).toEqual([
      createTaskId('parent'),
      createTaskId('sub-1'),
      createTaskId('sub-2'),
      createTaskId('dependent'),
    ]);
    if (result.status !== 'completed') throw new Error('unexpected status');
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual(callOrder);
  });

  it('starts same-wave expansion subgraphs concurrently', async () => {
    const parent1 = makeTask('parent-1');
    const parent2 = makeTask('parent-2');
    const sub1 = makeTask('sub-1');
    const sub2 = makeTask('sub-2');
    const graph = PlanGraph.empty().addTask(parent1).addTask(parent2);
    let sub2Started = false;
    let markSub1Started: (() => void) | undefined;
    let resolveSub1: ((result: TaskResult) => void) | undefined;
    const sub1Started = new Promise<void>((resolve) => {
      markSub1Started = resolve;
    });

    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('parent-1')) return Promise.resolve(expand('parent-1', [sub1]));
      if (task.id === createTaskId('parent-2')) return Promise.resolve(expand('parent-2', [sub2]));
      if (task.id === createTaskId('sub-1')) {
        markSub1Started?.();
        return new Promise<TaskResult>((resolve) => {
          resolveSub1 = resolve;
        });
      }
      if (task.id === createTaskId('sub-2')) {
        sub2Started = true;
      }
      return Promise.resolve(success(task.id));
    });

    const execution = new ParallelPlanner().execute(graph, { executor });
    await sub1Started;
    await Promise.resolve();

    expect(sub2Started).toBe(true);
    expect(resolveSub1).toBeDefined();
    resolveSub1?.(success('sub-1'));
    await expect(execution).resolves.toMatchObject({ status: 'completed' });
  });

  it('applies the wave concurrency cap across sibling expansion subgraphs', async () => {
    const parent1 = makeTask('parent-1');
    const parent2 = makeTask('parent-2');
    const sub1 = makeTask('sub-1');
    const sub2 = makeTask('sub-2');
    const graph = PlanGraph.empty().addTask(parent1).addTask(parent2);
    let active = 0;
    let maxActive = 0;

    const executor = vi.fn().mockImplementation(async (task: Task) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;

      if (task.id === createTaskId('parent-1')) return expand('parent-1', [sub1]);
      if (task.id === createTaskId('parent-2')) return expand('parent-2', [sub2]);
      return success(task.id);
    });

    const result = await new ParallelPlanner({ maxWaveConcurrency: 1 }).execute(graph, {
      executor,
    });

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(4);
    expect(maxActive).toBe(1);
  });

  it('waits for sibling expansions before propagating an expansion rejection', async () => {
    const parent1 = makeTask('parent-1');
    const parent2 = makeTask('parent-2');
    const sub1 = makeTask('sub-1');
    const sub2 = makeTask('sub-2');
    const graph = PlanGraph.empty().addTask(parent1).addTask(parent2);
    let resolveSub2: ((result: TaskResult) => void) | undefined;
    let rejected = false;

    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('parent-1')) return Promise.resolve(expand('parent-1', [sub1]));
      if (task.id === createTaskId('parent-2')) return Promise.resolve(expand('parent-2', [sub2]));
      if (task.id === createTaskId('sub-1')) {
        return Promise.reject(new RationaleRejectedError('sub-1', 'bad rationale'));
      }
      if (task.id === createTaskId('sub-2')) {
        return new Promise<TaskResult>((resolve) => {
          resolveSub2 = resolve;
        });
      }
      return Promise.resolve(success(task.id));
    });

    const execution = new ParallelPlanner().execute(graph, { executor });
    execution.catch(() => {
      rejected = true;
    });
    await vi.waitFor(() => expect(resolveSub2).toBeDefined());
    await Promise.resolve();

    expect(rejected).toBe(false);
    resolveSub2?.(success('sub-2'));
    await expect(execution).rejects.toBeInstanceOf(RationaleRejectedError);
  });
});

// ─── Cycle handling ───────────────────────────────────────────────────────────

describe('ParallelPlanner — cycle handling', () => {
  it('throws CyclicDependencyError before executing tasks when graph contains a cycle', async () => {
    const executor = vi.fn().mockResolvedValue(success('a'));

    await expect(new ParallelPlanner().execute(cyclicGraph(), { executor })).rejects.toBeInstanceOf(
      CyclicDependencyError
    );
    expect(executor).not.toHaveBeenCalled();
  });
});

// ─── Dangling dependency handling ─────────────────────────────────────────────

describe('ParallelPlanner — dangling dependency handling', () => {
  it('returns failed before executing tasks when a task depends on a missing task', async () => {
    const executor = vi.fn().mockResolvedValue(success('ready'));

    const result = await new ParallelPlanner().execute(danglingDependencyGraph(), { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('blocked'));
    expect(result.error.message).toContain("depends on unknown dependency node 'missing'");
    expect(result.taskResults).toEqual([]);
    expect(executor).not.toHaveBeenCalled();
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

    const executor = vi
      .fn()
      .mockResolvedValueOnce(success('a'))
      .mockResolvedValueOnce(failure('b'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(2);
    expect(result.taskResults[0]?.status).toBe('success');
    expect(result.taskResults[1]?.status).toBe('failure');
  });

  it('does not mark an unexpanded parent complete when a same-wave sibling fails', async () => {
    const parent = makeTask('parent');
    const sibling = makeTask('sibling');
    const child = makeTask('child');
    const graph = PlanGraph.empty().addTask(parent).addTask(sibling);
    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('parent')) return Promise.resolve(expand('parent', [child]));
      if (task.id === createTaskId('sibling')) return Promise.resolve(failure('sibling', 'boom'));
      return Promise.resolve(success(task.id));
    });

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('sibling'));
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual([
      createTaskId('sibling'),
    ]);
    expect(executor).not.toHaveBeenCalledWith(child);
  });

  it('returns the expanding parent as failed when an expanded sub-task fails', async () => {
    const parent = makeTask('parent');
    const sub = makeTask('sub');
    const graph = PlanGraph.empty().addTask(parent);
    const executor = vi
      .fn()
      .mockResolvedValueOnce(expand('parent', [sub]))
      .mockResolvedValueOnce(failure('sub', 'sub exploded'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('parent'));
    expect(result.error.message).toBe('sub exploded');
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual([
      createTaskId('sub'),
    ]);
  });

  it('finishes same-wave expansions before returning an expansion failure', async () => {
    const parent1 = makeTask('parent-1');
    const parent2 = makeTask('parent-2');
    const sub1 = makeTask('sub-1');
    const sub2 = makeTask('sub-2');
    const graph = PlanGraph.empty().addTask(parent1).addTask(parent2);
    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('parent-1')) return Promise.resolve(expand('parent-1', [sub1]));
      if (task.id === createTaskId('parent-2')) return Promise.resolve(expand('parent-2', [sub2]));
      if (task.id === createTaskId('sub-1')) return Promise.resolve(failure('sub-1', 'sub failed'));
      return Promise.resolve(success(task.id));
    });

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(executor).toHaveBeenCalledWith(sub2);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('parent-1'));
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual([
      createTaskId('sub-1'),
      createTaskId('parent-2'),
      createTaskId('sub-2'),
    ]);
  });

  it('throws RecursionDepthExceededError when nested expansions exceed max depth', async () => {
    const child = makeTask('child');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);
    const executor = vi
      .fn()
      .mockResolvedValueOnce(expand('parent', [child]))
      .mockResolvedValue(success('child'));

    await expect(new ParallelPlanner(0).execute(graph, { executor })).rejects.toBeInstanceOf(
      RecursionDepthExceededError
    );
  });

  it('returns first failure when multiple tasks fail in the same wave', async () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const graph = PlanGraph.empty().addTask(a).addTask(b);

    const executor = vi
      .fn()
      .mockResolvedValueOnce(failure('a', 'a-failed'))
      .mockResolvedValueOnce(failure('b', 'b-failed'));

    const result = await new ParallelPlanner().execute(graph, { executor });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    // Both results collected
    expect(result.taskResults).toHaveLength(2);
  });
});
