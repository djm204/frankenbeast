import { describe, it, expect } from 'vitest';
import { PlanExporter } from '../../../../src/planner/hitl/plan-exporter';
import { PlanGraph } from '../../../../src/planner/core/dag';
import { createTaskId } from '../../../../src/planner/core/types';
import type { Task } from '../../../../src/planner/core/types';

function makeTask(id: string): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
  };
}

describe('PlanExporter.toMarkdown', () => {
  it('returns a heading line for an empty graph', () => {
    const md = new PlanExporter().toMarkdown(PlanGraph.empty());
    expect(md).toContain('# Plan');
  });

  it('returns a "no tasks" marker for an empty graph', () => {
    const md = new PlanExporter().toMarkdown(PlanGraph.empty());
    expect(md).toContain('No tasks');
  });

  it('includes a checkbox item for each task', () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1')).addTask(makeTask('t-2'));
    const md = new PlanExporter().toMarkdown(graph);
    expect(md).toContain('- [ ]');
    expect((md.match(/- \[ \]/g) ?? []).length).toBe(2);
  });

  it('includes the task id in each item', () => {
    const graph = PlanGraph.empty().addTask(makeTask('alpha'));
    const md = new PlanExporter().toMarkdown(graph);
    expect(md).toContain('alpha');
  });

  it('includes the task objective in each item', () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const md = new PlanExporter().toMarkdown(graph);
    expect(md).toContain('Objective for t-1');
  });

  it('omits dependency annotation when a task has no deps', () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const md = new PlanExporter().toMarkdown(graph);
    expect(md).not.toContain('depends on');
  });

  it('includes dependency annotation when a task has deps', () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const md = new PlanExporter().toMarkdown(graph);
    expect(md).toContain('depends on');
    expect(md).toContain('a');
  });

  it('lists tasks in topological order', () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')])
      .addTask(makeTask('c'), [createTaskId('b')]);
    const md = new PlanExporter().toMarkdown(graph);
    const idxA = md.indexOf('a');
    const idxB = md.indexOf('**b**');
    const idxC = md.indexOf('**c**');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it('output is deterministic (same graph → same string)', () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')]);
    const exporter = new PlanExporter();
    expect(exporter.toMarkdown(graph)).toBe(exporter.toMarkdown(graph));
  });

  it('matches snapshot for a 3-task linear chain', () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')])
      .addTask(makeTask('c'), [createTaskId('a'), createTaskId('b')]);
    const md = new PlanExporter().toMarkdown(graph);
    expect(md).toBe(
      '# Plan\n\n## Tasks\n\n' +
        '- [ ] **a**: Objective for a\n' +
        '- [ ] **b**: Objective for b _(depends on: a)_\n' +
        '- [ ] **c**: Objective for c _(depends on: a, b)_\n'
    );
  });
});
