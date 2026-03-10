/**
 * Integration tests: Planner with ParallelPlanner strategy.
 */
import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../../../src/planner/planner';
import { ParallelPlanner } from '../../../src/planner/planners/parallel';
import { StubHITLGate } from '../../../src/planner/hitl/stub-hitl-gate';
import { RecoveryController } from '../../../src/planner/recovery/recovery-controller';
import { PlanGraph } from '../../../src/planner/core/dag';
import { createTaskId } from '../../../src/planner/core/types';
import type { Task, TaskResult } from '../../../src/planner/core/types';
import type { GuardrailsModule } from '../../../src/planner/modules/mod01';
import type { GraphBuilder, TaskExecutor } from '../../../src/planner/planners/types';
import type { MemoryModule } from '../../../src/planner/modules/mod03';

function makeTask(id: string): Task {
  return { id: createTaskId(id), objective: `Objective for ${id}`, requiredSkills: [], dependsOn: [], status: 'pending' };
}
function ok(id: string): TaskResult { return { status: 'success', taskId: createTaskId(id) }; }
function fail(id: string, msg = 'error'): TaskResult {
  return { status: 'failure', taskId: createTaskId(id), error: new Error(msg) };
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

function buildParallelPlanner(graph: PlanGraph, executor: TaskExecutor): Planner {
  const recovery = new RecoveryController(stubMemory());
  return new Planner(
    stubGuardrails(),
    stubGraphBuilder(graph),
    executor,
    new StubHITLGate(),
    new ParallelPlanner(),
    recovery
  );
}

describe('Integration — ParallelPlanner', () => {
  it('completes a graph with no dependencies end-to-end', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'))
      .addTask(makeTask('t-3'));
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));

    const result = await buildParallelPlanner(graph, executor).plan('...');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(3);
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it('executes independent tasks concurrently in the same wave', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'))
      .addTask(makeTask('c'));

    const started: string[] = [];
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const executor = vi.fn().mockImplementation((t: Task) => {
      started.push(t.id);
      concurrentCount++;
      if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
      return Promise.resolve(ok(t.id)).then(r => {
        concurrentCount--;
        return r;
      });
    });

    await buildParallelPlanner(graph, executor).plan('...');

    // All three independent tasks should run in a single wave
    expect(maxConcurrent).toBe(3);
    expect(started).toHaveLength(3);
  });

  it('respects dependency ordering across waves', async () => {
    // a and b are independent; c depends on both
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'))
      .addTask(makeTask('c'), [createTaskId('a'), createTaskId('b')]);

    const completedOrder: string[] = [];
    const executor = vi.fn().mockImplementation((t: Task) => {
      return Promise.resolve(ok(t.id)).then(r => {
        completedOrder.push(t.id);
        return r;
      });
    });

    const result = await buildParallelPlanner(graph, executor).plan('...');

    expect(result.status).toBe('completed');
    // c must come after both a and b
    const cIdx = completedOrder.indexOf(createTaskId('c'));
    const aIdx = completedOrder.indexOf(createTaskId('a'));
    const bIdx = completedOrder.indexOf(createTaskId('b'));
    expect(cIdx).toBeGreaterThan(aIdx);
    expect(cIdx).toBeGreaterThan(bIdx);
  });

  it('returns failed when any task fails', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'));

    const executor = vi.fn()
      .mockResolvedValueOnce(ok('a'))
      .mockResolvedValueOnce(fail('b', 'network error'));

    const result = await buildParallelPlanner(graph, executor).plan('...');

    expect(result.status).toBe('failed');
  });

  it('collects results from all tasks in a completed plan', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('x'))
      .addTask(makeTask('y'))
      .addTask(makeTask('z'), [createTaskId('x')]);
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));

    const result = await buildParallelPlanner(graph, executor).plan('...');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(3);
  });
});
