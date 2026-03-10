import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../../../../src/planner/planner';
import { LinearPlanner } from '../../../../src/planner/planners/linear';
import { StubHITLGate } from '../../../../src/planner/hitl/stub-hitl-gate';
import { RecoveryController } from '../../../../src/planner/recovery/recovery-controller';
import { PlanGraph } from '../../../../src/planner/core/dag';
import { createTaskId } from '../../../../src/planner/core/types';
import type { Task, TaskResult, Intent, KnownError } from '../../../../src/planner/core/types';
import type { GuardrailsModule } from '../../../../src/planner/modules/mod01';
import type { SelfCritiqueModule } from '../../../../src/planner/modules/mod07';
import type { GraphBuilder, TaskExecutor } from '../../../../src/planner/planners/types';
import type { HITLGate } from '../../../../src/planner/hitl/types';
import type { MemoryModule } from '../../../../src/planner/modules/mod03';
import type { TaskModification } from '../../../../src/planner/hitl/types';

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
  const recovery = new RecoveryController(memory, undefined, undefined, opts.maxRecoveryAttempts ?? 3);
  const guardrails = makeGuardrails();
  const graphBuilder = makeGraphBuilder(graph);

  const planner = new Planner(
    guardrails,
    graphBuilder,
    executor,
    hitlGate,
    new LinearPlanner(),
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

  it('returns failed when error is unknown (no known fix)', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const memory = makeMemory([]); // no known errors
    const executor = vi.fn().mockResolvedValue(failure('t-1', 'quantum flux anomaly'));

    const { planner } = buildPlanner({ graph, executor, memory });
    const result = await planner.plan('do something');

    expect(result.status).toBe('failed');
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
