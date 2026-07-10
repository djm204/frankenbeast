import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../../src/planner';
import { LinearPlanner } from '../../src/planners/linear';
import { RecursivePlanner } from '../../src/planners/recursive';
import { StubHITLGate } from '../../src/hitl/stub-hitl-gate';
import { RecoveryController } from '../../src/recovery/recovery-controller';
import { PlanGraph } from '../../src/core/dag';
import {
  CyclicDependencyError,
  MaxRecoveryAttemptsError,
  RecursionDepthExceededError,
  TaskNotFoundError,
  UnknownErrorEscalatedError,
} from '../../src/core/errors';
import { createTaskId } from '../../src/core/types';
import type { Task, TaskResult, Intent, KnownError, TaskId } from '../../src/core/types';
import type { GuardrailsModule } from '../../src/modules/mod01';
import type { SelfCritiqueModule } from '../../src/modules/mod07';
import type { GraphBuilder, PlanningStrategy, TaskExecutor } from '../../src/planners/types';
import type { HITLGate } from '../../src/hitl/types';
import type { MemoryModule } from '../../src/modules/mod03';
import type { TaskModification } from '../../src/hitl/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function failure(id: string, message = 'task failed'): TaskResult {
  return { status: 'failure', taskId: createTaskId(id), error: new Error(message) };
}

function expand(id: string, newTasks: Task[]): TaskResult {
  return { status: 'success', taskId: createTaskId(id), expand: true, newTasks };
}

function makeGuardrails(goal = 'test goal'): GuardrailsModule {
  const intent: Intent = { goal };
  return { getSanitizedIntent: vi.fn().mockResolvedValue(intent) };
}

function makeGraphBuilder(graph: PlanGraph): GraphBuilder {
  return { build: vi.fn().mockResolvedValue(graph) };
}

function makeMemory(knownErrors: KnownError[] = []): MemoryModule {
  return {
    getADRs: vi.fn().mockResolvedValue([]),
    getKnownErrors: vi.fn().mockResolvedValue(knownErrors),
    getProjectContext: vi.fn().mockResolvedValue({ projectName: 'test', adrs: [], rules: [] }),
  };
}

interface PlannerOptions {
  graph?: PlanGraph;
  executor?: TaskExecutor;
  hitlGate?: HITLGate;
  memory?: MemoryModule;
  selfCritique?: SelfCritiqueModule;
  maxRecoveryAttempts?: number;
  strategy?: PlanningStrategy;
  recovery?: {
    recover(failedTaskId: TaskId, error: Error, graph: PlanGraph, attempt: number): Promise<PlanGraph>;
  };
}

function buildPlanner(opts: PlannerOptions = {}): {
  planner: Planner;
  guardrails: GuardrailsModule;
  graphBuilder: GraphBuilder;
} {
  const graph = opts.graph ?? PlanGraph.empty();
  const executor = opts.executor ?? vi.fn().mockResolvedValue(success('t-1'));
  const hitlGate = opts.hitlGate ?? new StubHITLGate();
  const memory = opts.memory ?? makeMemory();
  const recovery =
    opts.recovery ??
    new RecoveryController(memory, undefined, undefined, opts.maxRecoveryAttempts ?? 3);
  const guardrails = makeGuardrails();
  const graphBuilder = makeGraphBuilder(graph);

  const planner = new Planner(
    guardrails,
    graphBuilder,
    executor,
    hitlGate,
    opts.strategy ?? new LinearPlanner(),
    recovery,
    opts.selfCritique
  );

  return { planner, guardrails, graphBuilder };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('Planner — happy path', () => {
  it('returns completed for an empty graph', async () => {
    const { planner } = buildPlanner({ graph: PlanGraph.empty() });
    const result = await planner.plan('do something');
    expect(result.status).toBe('completed');
  });

  it('sanitizes rawInput through guardrails', async () => {
    const { planner, guardrails } = buildPlanner();
    await planner.plan('raw user input');
    expect(guardrails.getSanitizedIntent).toHaveBeenCalledWith('raw user input');
  });

  it('builds the graph from the sanitized intent', async () => {
    const { planner, guardrails, graphBuilder } = buildPlanner();
    await planner.plan('do something');
    const intent = await (guardrails.getSanitizedIntent as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(graphBuilder.build).toHaveBeenCalledWith(await intent);
  });

  it('executes all tasks and returns completed', async () => {
    const t1 = makeTask('t-1');
    const t2 = makeTask('t-2');
    const graph = PlanGraph.empty()
      .addTask(t1)
      .addTask(t2, [createTaskId('t-1')]);
    const executor = vi.fn().mockImplementation((task: Task) =>
      Promise.resolve(success(task.id))
    );
    const { planner } = buildPlanner({ graph, executor });

    const result = await planner.plan('do something');

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('passes the plan markdown to the HITL gate', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const hitlGate: HITLGate = { requestApproval: vi.fn().mockResolvedValue({ decision: 'approved' }) };
    const { planner } = buildPlanner({ graph, executor, hitlGate });

    await planner.plan('plan something');

    expect(hitlGate.requestApproval).toHaveBeenCalledWith(
      expect.stringContaining('# Plan')
    );
  });
});

// ─── HITL gate ────────────────────────────────────────────────────────────────

describe('Planner — HITL gate', () => {
  it('returns aborted when HITL gate aborts', async () => {
    const hitlGate = new StubHITLGate({ decision: 'aborted', reason: 'user cancelled' });
    const { planner } = buildPlanner({ hitlGate });

    const result = await planner.plan('do something');

    expect(result.status).toBe('aborted');
    if (result.status !== 'aborted') throw new Error('unexpected');
    expect(result.reason).toBe('user cancelled');
  });

  it('applies modifications before execution when HITL returns modified', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const changes: TaskModification[] = [
      { taskId: createTaskId('t-1'), objective: 'Modified objective' },
    ];
    const hitlGate = new StubHITLGate({ decision: 'modified', changes });

    const executedObjectives: string[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      executedObjectives.push(task.objective);
      return Promise.resolve(success(task.id));
    });

    const { planner } = buildPlanner({ graph, executor, hitlGate });
    await planner.plan('do something');

    expect(executedObjectives).toContain('Modified objective');
    expect(executedObjectives).not.toContain('Objective for t-1');
  });

  it('does not call the executor when HITL aborts', async () => {
    const hitlGate = new StubHITLGate({ decision: 'aborted', reason: 'cancelled' });
    const executor = vi.fn();
    const { planner } = buildPlanner({ hitlGate, executor });

    await planner.plan('do something');

    expect(executor).not.toHaveBeenCalled();
  });
});

// ─── Recovery path ────────────────────────────────────────────────────────────

describe('Planner — self-correction loop', () => {
  it('retries after a known failure and returns completed', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'free space' };
    const memory = makeMemory([ke]);
    const executor = vi.fn()
      .mockResolvedValueOnce(failure('t-1', 'disk full'))        // first pass: fails
      .mockImplementation((task: Task) => Promise.resolve(success(task.id))); // retry: all pass

    const { planner } = buildPlanner({ graph, executor, memory });
    const result = await planner.plan('do something');

    expect(result.status).toBe('completed');
  });

  it('does not replay completed predecessor tasks during self-correction retries', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'free space' };
    const memory = makeMemory([ke]);
    const executedTaskIds: TaskId[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      executedTaskIds.push(task.id);
      if (task.id === createTaskId('t-2') && !executedTaskIds.includes(createTaskId('fix-t-2-attempt-1'))) {
        return Promise.resolve(failure('t-2', 'disk full'));
      }
      return Promise.resolve(success(task.id));
    });

    const { planner } = buildPlanner({ graph, executor, memory });
    const result = await planner.plan('do something');

    expect(result.status).toBe('completed');
    expect(executedTaskIds).toEqual([
      createTaskId('t-1'),
      createTaskId('t-2'),
      createTaskId('fix-t-2-attempt-1'),
      createTaskId('t-2'),
    ]);
  });

  it('returns failed when max recovery attempts exceeded', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'free space' };
    const memory = makeMemory([ke]);
    // t-1 always fails
    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('t-1')) return Promise.resolve(failure('t-1', 'disk full'));
      return Promise.resolve(success(task.id));
    });

    const { planner } = buildPlanner({ graph, executor, memory, maxRecoveryAttempts: 1 });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
  });

  it('preserves completed predecessors in terminal failed recovery results', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'free space' };
    const memory = makeMemory([ke]);
    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('t-2')) return Promise.resolve(failure('t-2', 'disk full'));
      return Promise.resolve(success(task.id));
    });

    const { planner } = buildPlanner({ graph, executor, memory, maxRecoveryAttempts: 1 });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual([
      createTaskId('t-1'),
      createTaskId('fix-t-2-attempt-1'),
      createTaskId('t-2'),
    ]);
  });

  it('tracks recovery attempts independently for each failed task', async () => {
    const t1 = makeTask('t-1');
    const t2 = makeTask('t-2');
    const graph = PlanGraph.empty().addTask(t1).addTask(t2);
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'free space' };
    const memory = makeMemory([ke]);
    const failedOnce = new Set<string>();
    const executor = vi.fn().mockImplementation((task: Task) => {
      if ((task.id === createTaskId('t-1') || task.id === createTaskId('t-2')) && !failedOnce.has(task.id)) {
        failedOnce.add(task.id);
        return Promise.resolve(failure(task.id, 'disk full'));
      }
      return Promise.resolve(success(task.id));
    });

    const { planner } = buildPlanner({ graph, executor, memory, maxRecoveryAttempts: 1 });
    const result = await planner.plan('do something');

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ id: createTaskId('fix-t-1-attempt-1') })
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ id: createTaskId('fix-t-2-attempt-1') })
    );
  });

  it('counts recovery attempts by original failed-task lineage', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'free space' };
    const memory = makeMemory([ke]);
    const executor = vi.fn().mockImplementation((task: Task) => {
      if (task.id === createTaskId('fix-fix-t-1-attempt-1-attempt-1')) {
        return Promise.resolve(success(task.id));
      }
      return Promise.resolve(failure(task.id, 'disk full'));
    });

    const recoverCalls: Array<{ failedTaskId: TaskId; attempt: number }> = [];

    const recovery = {
      recover: vi.fn(async (failedTaskId: TaskId, _err: Error, graph: PlanGraph, attempt: number) => {
        recoverCalls.push({ failedTaskId, attempt });

        if (failedTaskId.startsWith('fix-') && attempt > 1) {
          throw new MaxRecoveryAttemptsError(failedTaskId, 1);
        }
        if (recoverCalls.length >= 3) {
          throw new MaxRecoveryAttemptsError(failedTaskId, 1);
        }

        const fixTask = {
          id: createTaskId(`fix-${failedTaskId}-attempt-${attempt}`),
          objective: `Attempt-${attempt} fix for ${failedTaskId}`,
          requiredSkills: [],
          dependsOn: [],
          status: 'pending' as const,
        };

        return graph.insertFixItTask(failedTaskId, fixTask);
      }),
    };

    const { planner } = buildPlanner({ graph, executor, memory, recovery });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
    expect(recoverCalls).toEqual([
      { failedTaskId: createTaskId('t-1'), attempt: 1 },
      { failedTaskId: createTaskId('fix-t-1-attempt-1'), attempt: 2 },
    ]);
  });

  it('returns failed when error is unknown (no known fix)', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const memory = makeMemory([]); // no known errors
    const executor = vi.fn().mockResolvedValue(failure('t-1', 'quantum flux anomaly'));

    const { planner } = buildPlanner({ graph, executor, memory });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
  });

  it('recovers failed dynamic sub-tasks within their recursive sub-graph', async () => {
    const parent = makeTask('parent');
    const child = makeTask('child');
    const sibling = makeTask('sibling');
    const graph = PlanGraph.empty().addTask(parent).addTask(sibling);
    const executedTaskIds: TaskId[] = [];
    const executor = vi.fn().mockImplementation((task: Task) => {
      executedTaskIds.push(task.id);
      if (task.id === createTaskId('parent')) {
        return Promise.resolve(expand('parent', [child]));
      }
      if (task.id === createTaskId('child') && !executedTaskIds.includes(createTaskId('fix-child-attempt-1'))) {
        return Promise.resolve(failure('child', 'disk full'));
      }
      return Promise.resolve(success(task.id));
    });
    const recovery = {
      recover: vi.fn(async (failedTaskId: TaskId, _err: Error, recoveryGraph: PlanGraph, attempt: number) => {
        const fixTask: Task = {
          id: createTaskId(`fix-${failedTaskId}-attempt-${attempt}`),
          objective: `Fix ${failedTaskId}`,
          requiredSkills: [],
          dependsOn: [],
          status: 'pending',
        };
        return recoveryGraph.insertFixItTask(failedTaskId, fixTask);
      }),
    };

    const { planner } = buildPlanner({ graph, executor, recovery, strategy: new RecursivePlanner() });
    const result = await planner.plan('do something');

    expect(result.status).toBe('completed');
    expect(recovery.recover).toHaveBeenCalledWith(
      createTaskId('child'),
      expect.any(Error),
      expect.objectContaining({ reason: 'recursive expansion' }),
      1
    );
    expect(executedTaskIds).toEqual([
      createTaskId('parent'),
      createTaskId('child'),
      createTaskId('fix-child-attempt-1'),
      createTaskId('child'),
      createTaskId('sibling'),
    ]);
    if (result.status !== 'completed') throw new Error('unexpected');
    expect(result.taskResults.map((taskResult) => taskResult.taskId)).toEqual([
      createTaskId('parent'),
      createTaskId('fix-child-attempt-1'),
      createTaskId('child'),
      createTaskId('sibling'),
    ]);
  });
});

describe('Planner — strategy domain exceptions', () => {
  it('converts cyclic dependency errors from strategies into failed plan results', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const error = new CyclicDependencyError('Graph contains a cycle');
    const strategy: PlanningStrategy = {
      name: 'linear',
      execute: vi.fn().mockRejectedValue(error),
    };
    const recovery = { recover: vi.fn() };

    const { planner } = buildPlanner({ graph, strategy, recovery });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('planner-domain-error'));
    expect(result.error).toBe(error);
    expect(result.taskResults).toEqual([
      {
        status: 'failure',
        taskId: createTaskId('planner-domain-error'),
        error,
      },
    ]);
    expect(recovery.recover).not.toHaveBeenCalled();
  });

  it('converts recursion depth errors from strategies into failed plan results', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const error = new RecursionDepthExceededError(11);
    const strategy: PlanningStrategy = {
      name: 'linear',
      execute: vi.fn().mockRejectedValue(error),
    };

    const { planner } = buildPlanner({ graph, strategy });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('planner-domain-error'));
    expect(result.error).toBe(error);
  });

  it('keeps executor rejections associated with the task that failed', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const error = new TaskNotFoundError('dependency');
    const executor = vi.fn().mockRejectedValue(error);
    const recovery = { recover: vi.fn().mockRejectedValue(new UnknownErrorEscalatedError('t-1', error)) };

    const { planner } = buildPlanner({ graph, executor, recovery });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('t-1'));
    expect(result.error).toBe(error);
    expect(recovery.recover).toHaveBeenCalledWith(createTaskId('t-1'), error, graph, 1);
  });

  it('converts dangling expansion dependencies into failed plan results', async () => {
    const parent = makeTask('parent');
    const child: Task = { ...makeTask('child'), dependsOn: [createTaskId('missing')] };
    const graph = PlanGraph.empty().addTask(parent);
    const executor = vi.fn().mockResolvedValue(expand('parent', [child]));
    const recovery = { recover: vi.fn() };

    const { planner } = buildPlanner({ graph, executor, recovery });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unexpected');
    expect(result.failedTaskId).toBe(createTaskId('planner-domain-error'));
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
    expect(recovery.recover).not.toHaveBeenCalled();
  });
});

// ─── CoT enforcement ──────────────────────────────────────────────────────────

describe('Planner — CoT enforcement', () => {
  it('returns rationale_rejected when selfCritique rejects the rationale', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'rejected', reason: 'insufficient reasoning' }),
    };

    const { planner } = buildPlanner({ graph, executor, selfCritique });
    const result = await planner.plan('do something');

    expect(result.status).toBe('rationale_rejected');
    if (result.status !== 'rationale_rejected') throw new Error('unexpected');
    expect(result.taskId).toBe(createTaskId('t-1'));
  });

  it('calls verifyRationale via the CoT gate when selfCritique is provided', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'approved' }),
    };

    const { planner } = buildPlanner({ graph, executor, selfCritique });
    await planner.plan('do something');

    expect(selfCritique.verifyRationale).toHaveBeenCalledOnce();
  });

  it('does not call verifyRationale when selfCritique is not provided', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(success('t-1'));
    const selfCritique: SelfCritiqueModule = {
      verifyRationale: vi.fn().mockResolvedValue({ verdict: 'approved' }),
    };

    // no selfCritique passed to buildPlanner
    const { planner } = buildPlanner({ graph, executor });
    await planner.plan('do something');

    expect(selfCritique.verifyRationale).not.toHaveBeenCalled();
  });
});
