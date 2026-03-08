/**
 * Integration tests: Planner with RecursivePlanner strategy.
 */
import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../../src/planner';
import { RecursivePlanner } from '../../src/planners/recursive';
import { StubHITLGate } from '../../src/hitl/stub-hitl-gate';
import { RecoveryController } from '../../src/recovery/recovery-controller';
import { PlanGraph } from '../../src/core/dag';
import { createTaskId } from '../../src/core/types';
import type { Task, TaskResult } from '../../src/core/types';
import type { GuardrailsModule } from '../../src/modules/mod01';
import type { GraphBuilder, TaskExecutor } from '../../src/planners/types';
import type { MemoryModule } from '../../src/modules/mod03';

function makeTask(id: string): Task {
  return { id: createTaskId(id), objective: `Objective for ${id}`, requiredSkills: [], dependsOn: [], status: 'pending' };
}
function ok(id: string): TaskResult { return { status: 'success', taskId: createTaskId(id) }; }
function expand(id: string, newTasks: Task[]): TaskResult {
  return { status: 'success', taskId: createTaskId(id), expand: true, newTasks };
}

function stubGuardrails(): GuardrailsModule {
  return { getSanitizedIntent: vi.fn().mockResolvedValue({ goal: 'integration-test' }) };
}
function stubGraphBuilder(graph: PlanGraph): GraphBuilder {
  return { build: vi.fn().mockResolvedValue(graph) };
}
function stubMemory(): MemoryModule {
  return {
    getADRs: vi.fn().mockResolvedValue([]),
    getKnownErrors: vi.fn().mockResolvedValue([]),
    getProjectContext: vi.fn().mockResolvedValue({ projectName: 'test', adrs: [], rules: [] }),
  };
}

function buildRecursivePlanner(graph: PlanGraph, executor: TaskExecutor, maxDepth?: number): Planner {
  const recovery = new RecoveryController(stubMemory());
  return new Planner(
    stubGuardrails(),
    stubGraphBuilder(graph),
    executor,
    new StubHITLGate(),
    new RecursivePlanner(maxDepth),
    recovery
  );
}

describe('Integration — RecursivePlanner', () => {
  it('completes a non-expanding plan end-to-end', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1')).addTask(makeTask('t-2'));
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));

    const result = await buildRecursivePlanner(graph, executor).plan('...');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(2);
  });

  it('expands a parent task into sub-tasks and executes them', async () => {
    const sub1 = makeTask('sub-1');
    const sub2 = makeTask('sub-2');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [sub1, sub2]))
      .mockResolvedValueOnce(ok('sub-1'))
      .mockResolvedValueOnce(ok('sub-2'));

    const result = await buildRecursivePlanner(graph, executor).plan('...');

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it('collects results for parent and all sub-tasks', async () => {
    const sub = makeTask('sub');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [sub]))
      .mockResolvedValueOnce(ok('sub'));

    const result = await buildRecursivePlanner(graph, executor).plan('...');

    if (result.status !== 'completed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(2); // expand result + sub result
  });

  it('handles two levels of expansion (depth 2)', async () => {
    const grandchild = makeTask('grandchild');
    const child = makeTask('child');
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const executor = vi.fn()
      .mockResolvedValueOnce(expand('parent', [child]))
      .mockResolvedValueOnce(expand('child', [grandchild]))
      .mockResolvedValueOnce(ok('grandchild'));

    const result = await buildRecursivePlanner(graph, executor).plan('...');

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it('sub-tasks respect their declared dependency order', async () => {
    const sub1 = makeTask('sub-1');
    const sub2: Task = { ...makeTask('sub-2'), dependsOn: [createTaskId('sub-1')] };
    const parent = makeTask('parent');
    const graph = PlanGraph.empty().addTask(parent);

    const callOrder: string[] = [];
    const executor = vi.fn().mockImplementation((t: Task) => {
      callOrder.push(t.id);
      if (t.id === createTaskId('parent')) return Promise.resolve(expand('parent', [sub1, sub2]));
      return Promise.resolve(ok(t.id));
    });

    await buildRecursivePlanner(graph, executor).plan('...');

    expect(callOrder.indexOf(createTaskId('sub-1'))).toBeLessThan(
      callOrder.indexOf(createTaskId('sub-2'))
    );
  });
});
