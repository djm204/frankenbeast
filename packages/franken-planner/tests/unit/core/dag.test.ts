import { describe, it, expect } from 'vitest';
import { PlanGraph, createPlanVersion } from '../../../src/core/dag';
import { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError } from '../../../src/core/errors';
import { createTaskId } from '../../../src/core/types';
import type { Task } from '../../../src/core/types';

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
    ...overrides,
  };
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('PlanGraph — construction', () => {
  it('empty() creates a graph with size 0', () => {
    const g = PlanGraph.empty();
    expect(g.size()).toBe(0);
    expect(g.getTasks()).toEqual([]);
    expect(g.version).toBe(0);
  });

  it('getTask returns undefined for an unknown id', () => {
    expect(PlanGraph.empty().getTask(createTaskId('x'))).toBeUndefined();
  });

  it('addTask increases size by 1 and getTask retrieves it', () => {
    const task = makeTask('t-1');
    const g = PlanGraph.empty().addTask(task);
    expect(g.size()).toBe(1);
    expect(g.getTask(createTaskId('t-1'))).toEqual(task);
  });

  it('addTask is immutable — original graph is unchanged', () => {
    const g0 = PlanGraph.empty();
    const g1 = g0.addTask(makeTask('t-1'));
    expect(g0.size()).toBe(0);
    expect(g1.size()).toBe(1);
  });

  it('throws DuplicateTaskError on duplicate id', () => {
    const g = PlanGraph.empty().addTask(makeTask('t-1'));
    expect(() => g.addTask(makeTask('t-1'))).toThrowError(DuplicateTaskError);
  });

  it('throws when a specified dependency does not exist', () => {
    expect(() =>
      PlanGraph.empty().addTask(makeTask('t-1'), [createTaskId('missing')])
    ).toThrow();
  });

  it('getDependencies returns the declared deps', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    expect(g.getDependencies(createTaskId('b'))).toContain(createTaskId('a'));
  });

  it('addTask synchronizes the stored task dependsOn with declared deps', () => {
    const b = makeTask('b');
    const g = PlanGraph.empty().addTask(makeTask('a')).addTask(b, [createTaskId('a')]);

    expect(g.getTask(createTaskId('b'))?.dependsOn).toEqual([createTaskId('a')]);
    expect(g.getTasks().find((task) => task.id === createTaskId('b'))?.dependsOn).toEqual([
      createTaskId('a'),
    ]);
    expect(b.dependsOn).toEqual([]);
  });

  it('getTasks returns all tasks in insertion order', () => {
    const [a, b] = [makeTask('a'), makeTask('b')];
    const g = PlanGraph.empty().addTask(a).addTask(b);
    expect(g.getTasks()).toEqual([a, b]);
  });

  it('isolates stored tasks from mutations to the original task object', () => {
    const task = makeTask('t-1', {
      requiredSkills: ['planner'],
      metadata: { nested: { priority: 'low' } },
    });
    const g = PlanGraph.empty().addTask(task);

    task.status = 'completed';
    task.requiredSkills.push('unexpected');
    (task.metadata as { nested: { priority: string } }).nested.priority = 'high';

    expect(g.getTask(createTaskId('t-1'))).toMatchObject({
      status: 'pending',
      requiredSkills: ['planner'],
      metadata: { nested: { priority: 'low' } },
    });
  });

  it('clones mutable metadata values and preserves __proto__ as data', () => {
    const task = makeTask('t-1', {
      metadata: {
        bytes: new Uint8Array([1, 2, 3]),
        ...JSON.parse('{"__proto__":{"polluted":true}}'),
      },
    });
    const g = PlanGraph.empty().addTask(task);

    (task.metadata?.bytes as Uint8Array)[0] = 9;
    const snapshot = g.getTask(createTaskId('t-1')) as Task;
    (snapshot.metadata?.bytes as Uint8Array)[1] = 8;

    const stored = g.getTask(createTaskId('t-1')) as Task;
    expect(Array.from(stored.metadata?.bytes as Uint8Array)).toEqual([1, 2, 3]);
    expect(Object.hasOwn(stored.metadata as object, '__proto__')).toBe(true);
    expect((stored.metadata as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects metadata objects that cannot be cloned without aliasing or semantic loss', () => {
    class CustomMetadata {
      readonly value = 'custom';
    }

    expect(() =>
      PlanGraph.empty().addTask(makeTask('custom', { metadata: { value: new CustomMetadata() } }))
    ).toThrow(/unsupported mutable object/);

    if (typeof SharedArrayBuffer !== 'undefined') {
      const shared = new Uint8Array(new SharedArrayBuffer(4));
      shared[0] = 1;
      const graph = PlanGraph.empty().addTask(makeTask('shared', { metadata: { bytes: shared } }));
      shared[0] = 9;
      const snapshot = graph.getTask(createTaskId('shared')) as Task;
      (snapshot.metadata?.bytes as Uint8Array)[0] = 8;

      const stored = graph.getTask(createTaskId('shared')) as Task;
      expect(Array.from(stored.metadata?.bytes as Uint8Array)).toEqual([1, 0, 0, 0]);
      expect((stored.metadata?.bytes as Uint8Array).buffer).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('preserves stateful RegExp metadata when cloning task snapshots', () => {
    const pattern = /work/g;
    pattern.lastIndex = 2;
    const graph = PlanGraph.empty().addTask(makeTask('regexp', { metadata: { pattern } }));
    pattern.lastIndex = 0;

    const snapshot = graph.getTask(createTaskId('regexp')) as Task;
    expect((snapshot.metadata?.pattern as RegExp).lastIndex).toBe(2);

    (snapshot.metadata?.pattern as RegExp).lastIndex = 0;
    const stored = graph.getTask(createTaskId('regexp')) as Task;
    expect((stored.metadata?.pattern as RegExp).lastIndex).toBe(2);
  });

  it('isolates stored tasks from mutations to getTask, getTasks, and topoSort results', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a', { requiredSkills: ['setup'] }))
      .addTask(makeTask('b'), [createTaskId('a')]);

    const fromGetTask = g.getTask(createTaskId('b')) as Task;
    fromGetTask.status = 'completed';
    fromGetTask.dependsOn.push(createTaskId('ghost'));

    const fromGetTasks = g.getTasks().find((task) => task.id === createTaskId('a')) as Task;
    fromGetTasks.requiredSkills.push('mutated');

    const fromTopoSort = g.topoSort().find((task) => task.id === createTaskId('b')) as Task;
    fromTopoSort.dependsOn.length = 0;

    expect(g.getTask(createTaskId('b'))?.status).toBe('pending');
    expect(g.getTask(createTaskId('a'))?.requiredSkills).toEqual(['setup']);
    expect(g.getTask(createTaskId('b'))?.dependsOn).toEqual([createTaskId('a')]);
    expect(g.getDependencies(createTaskId('b'))).toEqual([createTaskId('a')]);
    expect(g.topoSort().map((task) => task.id)).toEqual([createTaskId('a'), createTaskId('b')]);
  });
});

// ─── Topological Sort ────────────────────────────────────────────────────────

describe('PlanGraph — topoSort', () => {
  it('empty graph returns []', () => {
    expect(PlanGraph.empty().topoSort()).toEqual([]);
  });

  it('single task returns [task]', () => {
    const task = makeTask('t-1');
    expect(PlanGraph.empty().addTask(task).topoSort()).toEqual([task]);
  });

  it('linear chain A→B→C: A first, C last', () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const c = makeTask('c');
    const g = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')])
      .addTask(c, [createTaskId('b')]);
    const sorted = g.topoSort();
    expect(sorted[0]).toEqual(a);
    expect(sorted[2]?.id).toBe(c.id);
    expect(sorted).toHaveLength(3);
  });

  it('diamond A→{B,C}→D: A first, D last', () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const c = makeTask('c');
    const d = makeTask('d');
    const g = PlanGraph.empty()
      .addTask(a)
      .addTask(b, [createTaskId('a')])
      .addTask(c, [createTaskId('a')])
      .addTask(d, [createTaskId('b'), createTaskId('c')]);
    const sorted = g.topoSort();
    expect(sorted[0]).toEqual(a);
    expect(sorted[3]?.id).toBe(d.id);
  });

  it('two independent tasks both appear in result', () => {
    const [a, b] = [makeTask('a'), makeTask('b')];
    const g = PlanGraph.empty().addTask(a).addTask(b);
    const sorted = g.topoSort();
    expect(sorted).toHaveLength(2);
    expect(sorted).toContainEqual(a);
    expect(sorted).toContainEqual(b);
  });
});

// ─── Cycle Detection ─────────────────────────────────────────────────────────

describe('PlanGraph — cycle detection', () => {
  it('hasCycle returns false for a valid DAG', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    expect(g.hasCycle()).toBe(false);
  });

  it('hasCycle returns false for an empty graph', () => {
    expect(PlanGraph.empty().hasCycle()).toBe(false);
  });

  it('hasCycle returns true for a two-node cycle', () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const nodes = new Map([[a.id, a], [b.id, b]]);
    const edges = new Map([
      [a.id, new Set([b.id])], // a depends on b
      [b.id, new Set([a.id])], // b depends on a → cycle
    ]);
    const g = PlanGraph.createWithRawEdges(nodes, edges);
    expect(g.hasCycle()).toBe(true);
  });

  it('topoSort throws CyclicDependencyError on a cyclic graph', () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const nodes = new Map([[a.id, a], [b.id, b]]);
    const edges = new Map([
      [a.id, new Set([b.id])],
      [b.id, new Set([a.id])],
    ]);
    const g = PlanGraph.createWithRawEdges(nodes, edges);
    expect(() => g.topoSort()).toThrowError(CyclicDependencyError);
  });

  it('topoSort rejects raw edges whose task id is missing from nodes', () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const dangling = createTaskId('dangling');
    const nodes = new Map([[a.id, a], [b.id, b]]);
    const edges = new Map([
      [dangling, new Set([a.id])],
      [b.id, new Set([dangling])],
    ]);
    const g = PlanGraph.createWithRawEdges(nodes, edges);

    expect(() => g.topoSort()).toThrow(/unknown task node 'dangling'/);
  });

  it('topoSort rejects raw dependencies that are missing from nodes', () => {
    const a = makeTask('a');
    const missing = createTaskId('missing');
    const nodes = new Map([[a.id, a]]);
    const edges = new Map([[a.id, new Set([missing])]]);
    const g = PlanGraph.createWithRawEdges(nodes, edges);

    expect(() => g.topoSort()).toThrow(/unknown dependency node 'missing'/);
  });

  it('hasCycle rejects missing raw edge ids instead of reporting a spurious cycle', () => {
    const a = makeTask('a');
    const b = makeTask('b');
    const missing = createTaskId('missing');
    const nodes = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    const edges = new Map([
      [a.id, new Set<Task['id']>()],
      [b.id, new Set([missing])],
    ]);
    const g = PlanGraph.createWithRawEdges(nodes, edges);

    expect(() => g.hasCycle()).toThrow(/unknown dependency node 'missing'/);
  });
});

// ─── Mutations ───────────────────────────────────────────────────────────────

describe('PlanGraph — removeTask', () => {
  it('removes a task and decreases size', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = g.removeTask(createTaskId('a'));
    expect(g2.size()).toBe(0);
    expect(g.size()).toBe(1); // original unchanged
  });

  it('strips the removed task from dependents', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const g2 = g.removeTask(createTaskId('a'));
    expect(g2.getDependencies(createTaskId('b'))).toEqual([]);
  });

  it('synchronizes stored task dependsOn after stripping a removed dependency', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const g2 = g.removeTask(createTaskId('a'));

    expect(g2.getTask(createTaskId('b'))?.dependsOn).toEqual([]);
    expect(g2.getTasks()).toEqual([makeTask('b')]);
    expect(g.getTask(createTaskId('b'))?.dependsOn).toEqual([createTaskId('a')]);
  });

  it('throws TaskNotFoundError for unknown id', () => {
    expect(() => PlanGraph.empty().removeTask(createTaskId('x'))).toThrowError(
      TaskNotFoundError
    );
  });
});

describe('PlanGraph — insertFixItTask', () => {
  it('inserts a fix task before the failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);

    const g2 = g.insertFixItTask(createTaskId('b'), makeTask('fix-b'));

    expect(g2.size()).toBe(3);
    expect(g2.getDependencies(createTaskId('fix-b'))).toEqual([createTaskId('a')]);
    expect(g2.getDependencies(createTaskId('b'))).toEqual([createTaskId('fix-b')]);
    expect(g2.getTask(createTaskId('fix-b'))?.dependsOn).toEqual([createTaskId('a')]);
    expect(g2.getTask(createTaskId('b'))?.dependsOn).toEqual([createTaskId('fix-b')]);
  });

  it('preserves explicit fix task dependencies when inserting before a failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('setup'))
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const fix = makeTask('fix-b', { dependsOn: [createTaskId('setup')] });

    const g2 = g.insertFixItTask(createTaskId('b'), fix);

    expect(g2.getDependencies(createTaskId('fix-b'))).toEqual([
      createTaskId('a'),
      createTaskId('setup'),
    ]);
    expect(g2.getTask(createTaskId('fix-b'))?.dependsOn).toEqual([
      createTaskId('a'),
      createTaskId('setup'),
    ]);
    expect(g2.getDependencies(createTaskId('b'))).toEqual([createTaskId('fix-b')]);
    expect(g2.getTask(createTaskId('b'))?.dependsOn).toEqual([createTaskId('fix-b')]);
  });

  it('deduplicates failed task and explicit fix task dependencies', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('setup'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const fix = makeTask('fix-b', { dependsOn: [createTaskId('a'), createTaskId('setup')] });

    const g2 = g.insertFixItTask(createTaskId('b'), fix);

    expect(g2.getDependencies(createTaskId('fix-b'))).toEqual([
      createTaskId('a'),
      createTaskId('setup'),
    ]);
    expect(g2.getTask(createTaskId('fix-b'))?.dependsOn).toEqual([
      createTaskId('a'),
      createTaskId('setup'),
    ]);
    expect(g2.topoSort().map((task) => task.id)).toEqual([
      createTaskId('a'),
      createTaskId('setup'),
      createTaskId('fix-b'),
      createTaskId('b'),
    ]);
  });

  it('is immutable and increments the recovery version', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));

    const g2 = g.insertFixItTask(createTaskId('a'), makeTask('fix-a'));

    expect(g.size()).toBe(1);
    expect(g2.version).toBe(g.version + 1);
    expect(g2.reason).toMatch(/recovery/i);
  });

  it('throws when the target task is missing or the fix task id already exists', () => {
    expect(() =>
      PlanGraph.empty().insertFixItTask(createTaskId('missing'), makeTask('fix'))
    ).toThrowError(TaskNotFoundError);

    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    expect(() => g.insertFixItTask(createTaskId('b'), makeTask('a'))).toThrowError(
      DuplicateTaskError
    );
  });

  it('sorts the fix task before the failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);

    const sorted = g
      .insertFixItTask(createTaskId('b'), makeTask('fix-b'))
      .topoSort()
      .map((t) => t.id);

    expect(sorted.indexOf(createTaskId('fix-b'))).toBeLessThan(
      sorted.indexOf(createTaskId('b'))
    );
  });
});


describe('PlanGraph — fromTasks', () => {
  it('builds a graph from tasks supplied in dependency-last order', () => {
    const a = makeTask('a');
    const b = makeTask('b', { dependsOn: [createTaskId('a')] });
    const c = makeTask('c', { dependsOn: [createTaskId('b')] });

    const g = PlanGraph.fromTasks([c, b, a]);

    expect(g.topoSort()).toEqual([a, b, c]);
    expect(g.getDependencies(createTaskId('c'))).toEqual([createTaskId('b')]);
  });

  it('throws DuplicateTaskError when task ids are duplicated', () => {
    expect(() => PlanGraph.fromTasks([makeTask('a'), makeTask('a')])).toThrowError(
      DuplicateTaskError
    );
  });

  it('throws TaskNotFoundError when a task references an unknown dependency', () => {
    const task = makeTask('a', { dependsOn: [createTaskId('missing')] });

    expect(() => PlanGraph.fromTasks([task])).toThrowError(TaskNotFoundError);
  });

  it('throws CyclicDependencyError when tasks form a cycle', () => {
    const a = makeTask('a', { dependsOn: [createTaskId('b')] });
    const b = makeTask('b', { dependsOn: [createTaskId('a')] });

    expect(() => PlanGraph.fromTasks([a, b])).toThrowError(CyclicDependencyError);
  });
});

// ─── Versioning ──────────────────────────────────────────────────────────────

describe('PlanGraph — versioning', () => {
  it('starts at version 0', () => {
    expect(PlanGraph.empty().version).toBe(0);
  });

  it('addTask and removeTask preserve version', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    expect(g.version).toBe(0);
    expect(g.removeTask(createTaskId('a')).version).toBe(0);
  });

  it('fromTasks can carry a supplied version and reason', () => {
    const g = PlanGraph.fromTasks([makeTask('a')], { version: 3, reason: 'rebuilt' });
    expect(g.version).toBe(3);
    expect(g.reason).toBe('rebuilt');
  });
});

// ─── Clone ───────────────────────────────────────────────────────────────────

describe('createPlanVersion', () => {
  it('wraps a graph with a reason and timestamp', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const pv = createPlanVersion(g, 'test snapshot');
    expect(pv.version).toBe(g.version);
    expect(pv.graph).toBe(g);
    expect(pv.reason).toBe('test snapshot');
    expect(pv.timestamp).toBeInstanceOf(Date);
  });
});

describe('PlanGraph — clone', () => {
  it('produces an equivalent graph', () => {
    const task = makeTask('a');
    const g = PlanGraph.empty().addTask(task);
    const g2 = g.clone();
    expect(g2.getTasks()).toEqual(g.getTasks());
    expect(g2.version).toBe(g.version);
  });

  it('clone is structurally independent (further mutations diverge)', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = g.clone();
    const g3 = g2.addTask(makeTask('b'));
    expect(g.size()).toBe(1);
    expect(g3.size()).toBe(2);
  });
});
