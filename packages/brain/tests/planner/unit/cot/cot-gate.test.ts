import { describe, it, expect, vi } from 'vitest';
import { buildCoTExecutor } from '../../../../src/planner/cot/cot-gate';
import { RationaleEnforcer } from '../../../../src/planner/cot/rationale-enforcer';
import { RationaleRejectedError } from '../../../../src/planner/core/errors';
import { LinearPlanner } from '../../../../src/planner/planners/linear';
import { PlanGraph } from '../../../../src/planner/core/dag';
import { createTaskId } from '../../../../src/planner/core/types';
import type { Task, TaskResult } from '../../../../src/planner/core/types';
import type { SelfCritiqueModule } from '../../../../src/planner/modules/mod07';

function makeTask(id: string): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
  };
}

function success(id: string): TaskResult {
  return { status: 'success', taskId: createTaskId(id) };
}

function approved(): SelfCritiqueModule {
  return { verifyRationale: vi.fn().mockResolvedValue({ verdict: 'approved' }) };
}

function rejected(reason = 'bad reasoning'): SelfCritiqueModule {
  return {
    verifyRationale: vi.fn().mockResolvedValue({ verdict: 'rejected', reason }),
  };
}

// ─── Approved path ────────────────────────────────────────────────────────────

describe('buildCoTExecutor — approved', () => {
  it('calls verifyRationale before dispatching the task', async () => {
    const selfCritique = approved();
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const task = makeTask('t-1');

    const wrapped = buildCoTExecutor(executor, selfCritique);
    await wrapped(task);

    expect(selfCritique.verifyRationale).toHaveBeenCalledOnce();
  });

  it('passes a RationaleBlock with the correct taskId to verifyRationale', async () => {
    const selfCritique = approved();
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const task = makeTask('t-1');

    const wrapped = buildCoTExecutor(executor, selfCritique);
    await wrapped(task);

    expect(selfCritique.verifyRationale).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: createTaskId('t-1') })
    );
  });

  it('forwards the task to the underlying executor when approved', async () => {
    const selfCritique = approved();
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const task = makeTask('t-1');

    const wrapped = buildCoTExecutor(executor, selfCritique);
    await wrapped(task);

    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith(task);
  });

  it('returns the executor result when approved', async () => {
    const selfCritique = approved();
    const executor = vi.fn().mockResolvedValue(success('t-1'));

    const wrapped = buildCoTExecutor(executor, selfCritique);
    const result = await wrapped(makeTask('t-1'));

    expect(result.status).toBe('success');
  });

  it('uses the injected RationaleEnforcer to generate the rationale', async () => {
    const selfCritique = approved();
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const enforcer = new RationaleEnforcer();
    const generateSpy = vi.spyOn(enforcer, 'generate');

    const wrapped = buildCoTExecutor(executor, selfCritique, enforcer);
    await wrapped(makeTask('t-1'));

    expect(generateSpy).toHaveBeenCalledOnce();
  });
});

// ─── Rejected path ────────────────────────────────────────────────────────────

describe('buildCoTExecutor — rejected', () => {
  it('throws RationaleRejectedError when rationale is rejected', async () => {
    const selfCritique = rejected('reasoning is insufficient');
    const executor = vi.fn();
    const task = makeTask('t-1');

    const wrapped = buildCoTExecutor(executor, selfCritique);

    await expect(wrapped(task)).rejects.toThrowError(RationaleRejectedError);
  });

  it('does not call executor when rationale is rejected', async () => {
    const selfCritique = rejected();
    const executor = vi.fn();
    const task = makeTask('t-1');

    const wrapped = buildCoTExecutor(executor, selfCritique);
    await wrapped(task).catch(() => undefined);

    expect(executor).not.toHaveBeenCalled();
  });

  it('RationaleRejectedError carries the taskId', async () => {
    const selfCritique = rejected('bad');
    const executor = vi.fn();
    const task = makeTask('t-1');

    const wrapped = buildCoTExecutor(executor, selfCritique);

    const err = await wrapped(task).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RationaleRejectedError);
    expect((err as RationaleRejectedError).taskId).toBe(createTaskId('t-1'));
  });

  it('RationaleRejectedError carries the rejection reason', async () => {
    const selfCritique = rejected('reasoning is insufficient');
    const executor = vi.fn();

    const wrapped = buildCoTExecutor(executor, selfCritique);
    const err = await wrapped(makeTask('t-1')).catch((e: unknown) => e);

    expect((err as RationaleRejectedError).rejectionReason).toBe(
      'reasoning is insufficient'
    );
  });
});

// ─── Integration: propagation through LinearPlanner ──────────────────────────

describe('CoT gate — propagation through LinearPlanner', () => {
  it('RationaleRejectedError propagates out of LinearPlanner.execute', async () => {
    const task = makeTask('t-1');
    const graph = PlanGraph.empty().addTask(task);
    const selfCritique = rejected('bad rationale');
    const rawExecutor = vi.fn().mockResolvedValue(success('t-1'));
    const cotExecutor = buildCoTExecutor(rawExecutor, selfCritique);

    await expect(
      new LinearPlanner().execute(graph, { executor: cotExecutor })
    ).rejects.toThrowError(RationaleRejectedError);
  });

  it('raw executor is never called when rationale is rejected', async () => {
    const task = makeTask('t-1');
    const graph = PlanGraph.empty().addTask(task);
    const selfCritique = rejected();
    const rawExecutor = vi.fn();
    const cotExecutor = buildCoTExecutor(rawExecutor, selfCritique);

    await new LinearPlanner().execute(graph, { executor: cotExecutor }).catch(() => undefined);

    expect(rawExecutor).not.toHaveBeenCalled();
  });
});
