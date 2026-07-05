import { describe, expect, it } from 'vitest';
import { PlanGraph } from '../../../src/core/dag';
import { DuplicateTaskError, TaskNotFoundError } from '../../../src/core/errors';
import { createTaskId } from '../../../src/core/types';
import type { Task } from '../../../src/core/types';
import { insertFixItTask } from '../../../src/recovery/fix-it-injector';

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

describe('insertFixItTask', () => {
  it('inserts fix before the failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const fix = makeTask('fix-b');
    const g2 = insertFixItTask(g, createTaskId('b'), fix);

    expect(g2.size()).toBe(3);
    expect(g2.getDependencies(createTaskId('fix-b'))).toContain(createTaskId('a'));
    expect(g2.getDependencies(createTaskId('b'))).toContain(createTaskId('fix-b'));
    expect(g2.getDependencies(createTaskId('b'))).not.toContain(createTaskId('a'));
  });

  it('is immutable — original graph unchanged', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    insertFixItTask(g, createTaskId('a'), makeTask('fix-a'));
    expect(g.size()).toBe(1);
  });

  it('increments version and sets a recovery reason', () => {
    const g = PlanGraph.empty().addTask(makeTask('a'));
    const g2 = insertFixItTask(g, createTaskId('a'), makeTask('fix-a'));
    expect(g2.version).toBe(g.version + 1);
    expect(g2.reason).toMatch(/recovery/i);
  });

  it('throws TaskNotFoundError when target does not exist', () => {
    expect(() =>
      insertFixItTask(PlanGraph.empty(), createTaskId('missing'), makeTask('fix'))
    ).toThrowError(TaskNotFoundError);
  });

  it('throws DuplicateTaskError when fix task id already exists', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    expect(() => insertFixItTask(g, createTaskId('b'), makeTask('a'))).toThrowError(
      DuplicateTaskError
    );
  });

  it('fix task result is sorted before the failed task', () => {
    const g = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const g2 = insertFixItTask(g, createTaskId('b'), makeTask('fix-b'));
    const sorted = g2.topoSort().map((t) => t.id);
    expect(sorted.indexOf(createTaskId('fix-b'))).toBeLessThan(
      sorted.indexOf(createTaskId('b'))
    );
  });
});
