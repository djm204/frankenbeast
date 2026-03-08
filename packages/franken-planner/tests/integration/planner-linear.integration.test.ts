/**
 * Integration tests: Planner with LinearPlanner strategy.
 * All real implementations; only external I/O (LLMs, disk) is stubbed.
 */
import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../../src/planner';
import { LinearPlanner } from '../../src/planners/linear';
import { StubHITLGate } from '../../src/hitl/stub-hitl-gate';
import { RecoveryController } from '../../src/recovery/recovery-controller';
import { PlanGraph } from '../../src/core/dag';
import { createTaskId } from '../../src/core/types';
import type { Task, TaskResult, KnownError } from '../../src/core/types';
import type { GuardrailsModule } from '../../src/modules/mod01';
import type { GraphBuilder, TaskExecutor } from '../../src/planners/types';
import type { MemoryModule } from '../../src/modules/mod03';
import type { HITLGate } from '../../src/hitl/types';
import type { TaskModification } from '../../src/hitl/types';

// ─── Test infrastructure ──────────────────────────────────────────────────────

function makeTask(id: string): Task {
  return { id: createTaskId(id), objective: `Objective for ${id}`, requiredSkills: [], dependsOn: [], status: 'pending' };
}
function ok(id: string): TaskResult {
  return { status: 'success', taskId: createTaskId(id) };
}
function fail(id: string, msg = 'error'): TaskResult {
  return { status: 'failure', taskId: createTaskId(id), error: new Error(msg) };
}
function stubGuardrails(): GuardrailsModule {
  return { getSanitizedIntent: vi.fn().mockResolvedValue({ goal: 'integration-test' }) };
}
function stubGraphBuilder(graph: PlanGraph): GraphBuilder {
  return { build: vi.fn().mockResolvedValue(graph) };
}
function stubMemory(knownErrors: KnownError[] = []): MemoryModule {
  return {
    getADRs: vi.fn().mockResolvedValue([]),
    getKnownErrors: vi.fn().mockResolvedValue(knownErrors),
    getProjectContext: vi.fn().mockResolvedValue({ projectName: 'test', adrs: [], rules: [] }),
  };
}

function buildLinearPlanner(
  graph: PlanGraph,
  executor: TaskExecutor,
  opts: { hitlGate?: HITLGate; memory?: MemoryModule; maxAttempts?: number } = {}
): Planner {
  const recovery = new RecoveryController(
    opts.memory ?? stubMemory(),
    undefined,
    undefined,
    opts.maxAttempts ?? 3
  );
  return new Planner(
    stubGuardrails(),
    stubGraphBuilder(graph),
    executor,
    opts.hitlGate ?? new StubHITLGate(),
    new LinearPlanner(),
    recovery
  );
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('Integration — LinearPlanner happy path', () => {
  it('completes a 3-task linear chain end-to-end', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')])
      .addTask(makeTask('t-3'), [createTaskId('t-2')]);
    const executor = vi.fn().mockImplementation((t: Task) => Promise.resolve(ok(t.id)));

    const result = await buildLinearPlanner(graph, executor).plan('build a thing');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('unexpected');
    expect(result.taskResults).toHaveLength(3);
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it('tasks execute in topological order', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('a'))
      .addTask(makeTask('b'), [createTaskId('a')])
      .addTask(makeTask('c'), [createTaskId('b')]);
    const order: string[] = [];
    const executor = vi.fn().mockImplementation((t: Task) => {
      order.push(t.id);
      return Promise.resolve(ok(t.id));
    });

    await buildLinearPlanner(graph, executor).plan('ordered work');

    expect(order).toEqual([createTaskId('a'), createTaskId('b'), createTaskId('c')]);
  });

  it('passes raw input through guardrails before building graph', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(ok('t-1'));
    const guardrails = stubGuardrails();
    const graphBuilder = stubGraphBuilder(graph);
    const recovery = new RecoveryController(stubMemory());
    const planner = new Planner(guardrails, graphBuilder, executor, new StubHITLGate(), new LinearPlanner(), recovery);

    await planner.plan('user raw input');

    expect(guardrails.getSanitizedIntent).toHaveBeenCalledWith('user raw input');
    expect(graphBuilder.build).toHaveBeenCalledOnce();
  });
});

// ─── HITL integration ─────────────────────────────────────────────────────────

describe('Integration — HITL gate wired into Planner', () => {
  it('abort decision stops all execution', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn();
    const hitlGate = new StubHITLGate({ decision: 'aborted', reason: 'not approved' });

    const result = await buildLinearPlanner(graph, executor, { hitlGate }).plan('...');

    expect(result.status).toBe('aborted');
    if (result.status !== 'aborted') throw new Error('unexpected');
    expect(result.reason).toBe('not approved');
    expect(executor).not.toHaveBeenCalled();
  });

  it('modified decision updates the graph before execution', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const changes: TaskModification[] = [{ taskId: createTaskId('t-1'), objective: 'Revised goal' }];
    const hitlGate = new StubHITLGate({ decision: 'modified', changes });

    const seenObjectives: string[] = [];
    const executor = vi.fn().mockImplementation((t: Task) => {
      seenObjectives.push(t.objective);
      return Promise.resolve(ok(t.id));
    });

    await buildLinearPlanner(graph, executor, { hitlGate }).plan('...');

    expect(seenObjectives).toContain('Revised goal');
    expect(seenObjectives).not.toContain('Objective for t-1');
  });

  it('HITL gate receives the rendered Markdown plan', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(ok('t-1'));
    const hitlGate: HITLGate = {
      requestApproval: vi.fn().mockResolvedValue({ decision: 'approved' }),
    };

    await buildLinearPlanner(graph, executor, { hitlGate }).plan('...');

    const [markdown] = (hitlGate.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(markdown).toContain('# Plan');
    expect(markdown).toContain('t-1');
  });
});

// ─── Recovery integration ─────────────────────────────────────────────────────

describe('Integration — self-correction loop wired into Planner', () => {
  it('recovers from a known failure and completes successfully', async () => {
    const graph = PlanGraph.empty()
      .addTask(makeTask('t-1'))
      .addTask(makeTask('t-2'), [createTaskId('t-1')]);
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'clean up disk' };
    const memory = stubMemory([ke]);

    const executor = vi.fn()
      .mockResolvedValueOnce(ok('t-1'))
      .mockResolvedValueOnce(fail('t-2', 'disk full'))      // first pass: t-2 fails
      .mockImplementation((t: Task) => Promise.resolve(ok(t.id))); // retry: all ok

    const result = await buildLinearPlanner(graph, executor, { memory }).plan('...');

    expect(result.status).toBe('completed');
  });

  it('returns failed when max recovery attempts exceeded', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ke: KnownError = { pattern: 'disk full', description: '', fixSuggestion: 'clean up' };
    const memory = stubMemory([ke]);
    // t-1 always fails
    const executor = vi.fn().mockImplementation((t: Task) => {
      if (t.id === createTaskId('t-1')) return Promise.resolve(fail('t-1', 'disk full'));
      return Promise.resolve(ok(t.id));
    });

    const result = await buildLinearPlanner(graph, executor, { memory, maxAttempts: 1 }).plan('...');

    expect(result.status).toBe('failed');
  });

  it('returns failed immediately when error has no known fix', async () => {
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const executor = vi.fn().mockResolvedValue(fail('t-1', 'quantum flux anomaly'));
    // no known errors in memory

    const result = await buildLinearPlanner(graph, executor).plan('...');

    expect(result.status).toBe('failed');
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
