/**
 * Integration tests: Planner with CoT (Chain-of-Thought) enforcement via SelfCritiqueModule.
 */
import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../../../src/planner/planner';
import { LinearPlanner } from '../../../src/planner/planners/linear';
import { StubHITLGate } from '../../../src/planner/hitl/stub-hitl-gate';
import { RecoveryController } from '../../../src/planner/recovery/recovery-controller';
import { PlanGraph } from '../../../src/planner/core/dag';
import { createTaskId } from '../../../src/planner/core/types';
import type { Task, TaskResult } from '../../../src/planner/core/types';
import type { GuardrailsModule } from '../../../src/planner/modules/mod01';
import type { SelfCritiqueModule } from '../../../src/planner/modules/mod07';
import type { GraphBuilder, TaskExecutor } from '../../../src/planner/planners/types';
import type { MemoryModule } from '../../../src/planner/modules/mod03';

function makeTask(id: string): Task {
  return { id: createTaskId(id), objective: `Objective for ${id}`, requiredSkills: [], dependsOn: [], status: 'pending' };
}
function ok(id: string): TaskResult { return { status: 'success', taskId: createTaskId(id) }; }

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

function buildCotPlanner(
  graph: PlanGraph,
  executor: TaskExecutor,
  selfCritique: SelfCritiqueModule
): Planner {
  const recovery = new RecoveryController(stubMemory());
  return new Planner(
    stubGuardrails(),
    stubGraphBuilder(graph),
    executor,
    new StubHITLGate(),
    new LinearPlanner(),
    recovery,
    selfCritique
  );
}

describe('Integration — CoT enforcement wired into Planner', () => {
  it('completes successfully when all rationales are approved', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'approved' }),
    };

    const result = await buildCotPlanner(graph, executor, selfCritique).plan('...');

    expect(result.status).toBe('completed');
    expect(selfCritique.verifyRationale).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('returns rationale_rejected when first task rationale is rejected', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(ok('t-1'));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'rejected', reason: 'insufficient reasoning' }),
    };

    const result = await buildCotPlanner(graph, executor, selfCritique).plan('...');

    expect(result.status).toBe('rationale_rejected');
    if (result.status !== 'rationale_rejected') throw new Error('unexpected');
    expect(result.taskId).toBe(createTaskId('t-1'));
  });

  it('stops execution at the rejected task — later tasks are not executed', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'rejected', reason: 'not good enough' }),
    };

    await buildCotPlanner(graph, executor, selfCritique).plan('...');

    // Rationale for t-1 is rejected before executor is called — executor never runs
    expect(executor).not.toHaveBeenCalled();
  });

  it('verifies rationale for each task independently', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')])
      .addTask(makeTask('c'), [createTaskId('b')]);
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'approved' }),
    };

    const result = await buildCotPlanner(graph, executor, selfCritique).plan('...');

    expect(result.status).toBe('completed');
    // One verifyRationale call per task
    expect(selfCritique.verifyRationale).toHaveBeenCalledTimes(3);
  });

  it('rejects on the second task when first is approved', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn()
        .mockResolvedValueOnce({ verdict: 'approved' })
        .mockResolvedValueOnce({ verdict: 'rejected', reason: 'second task fails critique' }),
    };

    const result = await buildCotPlanner(graph, executor, selfCritique).plan('...');

    expect(result.status).toBe('rationale_rejected');
    if (result.status !== 'rationale_rejected') throw new Error('unexpected');
    expect(result.taskId).toBe(createTaskId('t-2'));
    // t-1 ran, t-2 was rejected before execution
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
