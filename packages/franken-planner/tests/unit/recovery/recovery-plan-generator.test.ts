import { describe, it, expect } from 'vitest';
import { RecoveryPlanGenerator } from '../../../src/recovery/recovery-plan-generator';
import { PlanGraph } from '../../../src/core/dag';
import { createTaskId } from '../../../src/core/types';
import type { Task, KnownError } from '../../../src/core/types';

function makeTask(id: string): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
  };
}

function makeKnownError(fix = 'apply the fix'): KnownError {
  return { pattern: 'some error', description: 'A known error', fixSuggestion: fix };
}

describe('RecoveryPlanGenerator', () => {
  it('returns a new graph with one additional task', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = new RecoveryPlanGenerator().generate(createTaskId('a'), makeKnownError(), graph, 1);
    expect(g2.size()).toBe(2);
  });

  it('original graph is unchanged (immutable)', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    new RecoveryPlanGenerator().generate(createTaskId('a'), makeKnownError(), graph, 1);
    expect(graph.size()).toBe(1);
  });

  it('fix task objective is derived from knownError.fixSuggestion', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const ke = makeKnownError('restart the service');
    const g2 = new RecoveryPlanGenerator().generate(createTaskId('a'), ke, graph, 1);
    const fixTask = g2.getTasks().find((t) => t.id !== createTaskId('a'));
    expect(fixTask?.objective).toBe('restart the service');
  });

  it('fix task is sorted before the failed task in topoSort', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = new RecoveryPlanGenerator().generate(createTaskId('a'), makeKnownError(), graph, 1);
    const sorted = g2.topoSort().map((t) => t.id);
    const fixIdx = sorted.findIndex((id) => id !== createTaskId('a'));
    const aIdx = sorted.indexOf(createTaskId('a'));
    expect(fixIdx).toBeLessThan(aIdx);
  });

  it('new graph has an incremented version', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = new RecoveryPlanGenerator().generate(createTaskId('a'), makeKnownError(), graph, 1);
    expect(g2.version).toBe(graph.version + 1);
  });

  it('each attempt produces a unique fix task id', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const gen = new RecoveryPlanGenerator();
    const ke = makeKnownError();
    const g2 = gen.generate(createTaskId('a'), ke, graph, 1);
    const g3 = gen.generate(createTaskId('a'), ke, graph, 2);
    const fixId1 = g2.getTasks().find((t) => t.id !== createTaskId('a'))?.id;
    const fixId2 = g3.getTasks().find((t) => t.id !== createTaskId('a'))?.id;
    expect(fixId1).not.toBe(fixId2);
  });

  it('works in a chain: fix task inherits failed task original dependencies', () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const g2 = new RecoveryPlanGenerator().generate(createTaskId('b'), makeKnownError(), graph, 1);
    // fix task should have 'a' as a dependency (inherited from b)
    const fixTask = g2.getTasks().find((t) => t.id !== createTaskId('a') && t.id !== createTaskId('b'));
    expect(fixTask).toBeDefined();
    if (!fixTask) throw new Error('no fix task');
    expect(g2.getDependencies(fixTask.id)).toContain(createTaskId('a'));
  });
});
