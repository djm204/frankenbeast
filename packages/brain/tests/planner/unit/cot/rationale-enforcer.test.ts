import { describe, it, expect } from 'vitest';
import { RationaleEnforcer } from '../../../../src/planner/cot/rationale-enforcer';
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

describe('RationaleEnforcer', () => {
  it('sets taskId matching the task', () => {
    const task = makeTask('t-1');
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.taskId).toBe(createTaskId('t-1'));
  });

  it('sets reasoning to a non-empty string derived from the task objective', () => {
    const task = makeTask('t-1');
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.reasoning.length).toBeGreaterThan(0);
    expect(rationale.reasoning).toContain('Objective for t-1');
  });

  it('sets expectedOutcome to a non-empty string', () => {
    const task = makeTask('t-1');
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.expectedOutcome.length).toBeGreaterThan(0);
  });

  it('sets timestamp to a Date instance', () => {
    const task = makeTask('t-1');
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.timestamp).toBeInstanceOf(Date);
  });

  it('sets selectedTool from task.metadata.tool when present', () => {
    const task: Task = { ...makeTask('t-1'), metadata: { tool: 'bash' } };
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.selectedTool).toBe('bash');
  });

  it('does not set selectedTool when metadata is absent', () => {
    const task = makeTask('t-1');
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.selectedTool).toBeUndefined();
  });

  it('does not set selectedTool when metadata.tool is not a string', () => {
    const task: Task = { ...makeTask('t-1'), metadata: { tool: 42 } };
    const rationale = new RationaleEnforcer().generate(task);
    expect(rationale.selectedTool).toBeUndefined();
  });

  it('each call produces a new timestamp object', () => {
    const task = makeTask('t-1');
    const enforcer = new RationaleEnforcer();
    const r1 = enforcer.generate(task);
    const r2 = enforcer.generate(task);
    // each call must create a distinct Date — not the same reference
    expect(r1.timestamp).not.toBe(r2.timestamp);
  });
});
