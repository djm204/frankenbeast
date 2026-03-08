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

  it('getTasks returns all tasks in insertion order', () => {
    const [a, b] = [makeTask('a'), makeTask('b')];
    const g = PlanGraph.empty().addTask(a).addTask(b);
    expect(g.getTasks()).toEqual([a, b]);
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
    expect(sorted[2]).toEqual(c);
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
    expect(sorted[3]).toEqual(d);
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

  it('throws TaskNotFoundError for unknown id', () => {
    expect(() => PlanGraph.empty().removeTask(createTaskId('x'))).toThrowError(
      TaskNotFoundError
    );
  });
});

describe('PlanGraph — insertFixItTask', () => {
  it('inserts fix before the failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const fix = makeTask('fix-b');
    const g2 = g.insertFixItTask(createTaskId('b'), fix);

    expect(g2.size()).toBe(3);
    expect(g2.getDependencies(createTaskId('fix-b'))).toContain(createTaskId('a'));
    expect(g2.getDependencies(createTaskId('b'))).toContain(createTaskId('fix-b'));
    expect(g2.getDependencies(createTaskId('b'))).not.toContain(createTaskId('a'));
  });

  it('is immutable — original graph unchanged', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    g.insertFixItTask(createTaskId('a'), makeTask('fix-a'));
    expect(g.size()).toBe(1);
  });

  it('increments version', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = g.insertFixItTask(createTaskId('a'), makeTask('fix-a'));
    expect(g2.version).toBe(g.version + 1);
  });

  it('sets a recovery reason on the new version', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = g.insertFixItTask(createTaskId('a'), makeTask('fix-a'));
    expect(g2.reason).toMatch(/recovery/i);
  });

  it('throws TaskNotFoundError when target does not exist', () => {
    expect(() =>
      PlanGraph.empty().insertFixItTask(createTaskId('missing'), makeTask('fix'))
    ).toThrowError(TaskNotFoundError);
  });

  it('fix task result is sorted before the failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const g2 = g.insertFixItTask(createTaskId('b'), makeTask('fix-b'));
    const sorted = g2.topoSort().map((t) => t.id);
    expect(sorted.indexOf(createTaskId('fix-b'))).toBeLessThan(
      sorted.indexOf(createTaskId('b'))
    );
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

  it('each insertFixItTask call increments version by 1', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = g.insertFixItTask(createTaskId('a'), makeTask('fix-a'));
    const g3 = g2.insertFixItTask(createTaskId('a'), makeTask('fix-a2'));
    expect(g2.version).toBe(1);
    expect(g3.version).toBe(2);
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
