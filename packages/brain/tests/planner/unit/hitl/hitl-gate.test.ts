import { describe, it, expect } from 'vitest';
import { StubHITLGate } from '../../../../src/planner/hitl/stub-hitl-gate';
import { applyModifications } from '../../../../src/planner/hitl/plan-modifier';
import { PlanGraph } from '../../../../src/planner/core/dag';
import { createTaskId } from '../../../../src/planner/core/types';
import type { Task } from '../../../../src/planner/core/types';
import type { TaskModification } from '../../../../src/planner/hitl/types';

function makeTask(id: string): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
  };
}

// ─── StubHITLGate ─────────────────────────────────────────────────────────────

describe('StubHITLGate', () => {
  it('returns "approved" by default', async () => {
    const gate = new StubHITLGate();
    const result = await gate.requestApproval('# Plan\n');
    expect(result.decision).toBe('approved');
  });

  it('returns the configured "modified" result', async () => {
    const changes: TaskModification[] = [
      { taskId: createTaskId('t-1'), objective: 'Updated objective' },
    ];
    const gate = new StubHITLGate({ decision: 'modified', changes });
    const result = await gate.requestApproval('# Plan\n');
    expect(result.decision).toBe('modified');
    if (result.decision !== 'modified') throw new Error('unexpected');
    expect(result.changes).toEqual(changes);
  });

  it('returns the configured "aborted" result', async () => {
    const gate = new StubHITLGate({ decision: 'aborted', reason: 'user cancelled' });
    const result = await gate.requestApproval('# Plan\n');
    expect(result.decision).toBe('aborted');
    if (result.decision !== 'aborted') throw new Error('unexpected');
    expect(result.reason).toBe('user cancelled');
  });

  it('receives the markdown string passed to requestApproval', async () => {
    // StubHITLGate ignores it but should accept any string without throwing
    const gate = new StubHITLGate();
    await expect(gate.requestApproval('## Custom Plan\n')).resolves.toBeDefined();
  });
});

// ─── applyModifications ───────────────────────────────────────────────────────

describe('applyModifications', () => {
  it('returns a graph of the same size when changes is empty', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = applyModifications(graph, []);
    expect(g2.size()).toBe(1);
  });

  it('updates a task objective from TaskModification', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const change: TaskModification = {
      taskId: createTaskId('a'),
      objective: 'New objective',
    };
    const g2 = applyModifications(graph, [change]);
    expect(g2.getTask(createTaskId('a'))?.objective).toBe('New objective');
  });

  it('updates requiredSkills from TaskModification', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const change: TaskModification = {
      taskId: createTaskId('a'),
      requiredSkills: ['bash', 'python'],
    };
    const g2 = applyModifications(graph, [change]);
    expect(g2.getTask(createTaskId('a'))?.requiredSkills).toEqual(['bash', 'python']);
  });

  it('preserves unmodified tasks', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a')).addTask(makeTask('b'));
    const change: TaskModification = {
      taskId: createTaskId('a'),
      objective: 'Changed',
    };
    const g2 = applyModifications(graph, [change]);
    expect(g2.getTask(createTaskId('b'))?.objective).toBe('Objective for b');
  });

  it('preserves edges between tasks', () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const change: TaskModification = { taskId: createTaskId('a'), objective: 'Changed' };
    const g2 = applyModifications(graph, [change]);
    expect(g2.getDependencies(createTaskId('b'))).toContain(createTaskId('a'));
  });

  it('ignores modifications for unknown task ids', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const change: TaskModification = {
      taskId: createTaskId('does-not-exist'),
      objective: 'Ghost',
    };
    const g2 = applyModifications(graph, [change]);
    expect(g2.size()).toBe(1);
  });

  it('original graph is unchanged (immutable)', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a'));
    const change: TaskModification = { taskId: createTaskId('a'), objective: 'Changed' };
    applyModifications(graph, [change]);
    expect(graph.getTask(createTaskId('a'))?.objective).toBe('Objective for a');
  });

  it('can apply multiple modifications in one call', () => {
    const graph = PlanGraph.empty().addTask(makeTask('a')).addTask(makeTask('b'));
    const changes: TaskModification[] = [
      { taskId: createTaskId('a'), objective: 'New A' },
      { taskId: createTaskId('b'), objective: 'New B' },
    ];
    const g2 = applyModifications(graph, changes);
    expect(g2.getTask(createTaskId('a'))?.objective).toBe('New A');
    expect(g2.getTask(createTaskId('b'))?.objective).toBe('New B');
  });
});
