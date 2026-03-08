import { describe, it, expect, vi } from 'vitest';
import { RecoveryController } from '../../../src/recovery/recovery-controller';
import { MaxRecoveryAttemptsError, UnknownErrorEscalatedError } from '../../../src/core/errors';
import { PlanGraph } from '../../../src/core/dag';
import { createTaskId } from '../../../src/core/types';
import type { Task, KnownError } from '../../../src/core/types';
import type { MemoryModule } from '../../../src/modules/mod03';

function makeTask(id: string): Task {
  return {
    id: createTaskId(id),
    objective: `Objective for ${id}`,
    requiredSkills: [],
    dependsOn: [],
    status: 'pending',
  };
}

function makeKnownError(pattern: string, fix = `fix for ${pattern}`): KnownError {
  return { pattern, description: `Desc for '${pattern}'`, fixSuggestion: fix };
}

function makeMemory(knownErrors: KnownError[] = []): MemoryModule {
  return {
    getADRs: vi.fn().mockResolvedValue([]),
    getKnownErrors: vi.fn().mockResolvedValue(knownErrors),
    getProjectContext: vi.fn().mockResolvedValue({ projectName: 'test', adrs: [], rules: [] }),
  };
}

const failedTaskId = createTaskId('t-1');
const someError = new Error('disk full error');

describe('RecoveryController — known error', () => {
  it('calls memory.getKnownErrors()', async () => {
    const memory = makeMemory([makeKnownError('disk full')]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    await ctrl.recover(failedTaskId, someError, graph, 1);

    expect(memory.getKnownErrors).toHaveBeenCalledOnce();
  });

  it('returns a new graph with fix-it task injected when error is known', async () => {
    const ke = makeKnownError('disk full', 'free up disk space');
    const memory = makeMemory([ke]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    const g2 = await ctrl.recover(failedTaskId, someError, graph, 1);

    expect(g2.size()).toBe(2);
    expect(g2.version).toBe(graph.version + 1);
  });

  it('original graph is unchanged', async () => {
    const memory = makeMemory([makeKnownError('disk full')]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    await ctrl.recover(failedTaskId, someError, graph, 1);

    expect(graph.size()).toBe(1);
  });

  it('fix task objective matches knownError.fixSuggestion', async () => {
    const ke = makeKnownError('disk full', 'clean up temporary files');
    const memory = makeMemory([ke]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    const g2 = await ctrl.recover(failedTaskId, someError, graph, 1);
    const fixTask = g2.getTasks().find((t) => t.id !== failedTaskId);

    expect(fixTask?.objective).toBe('clean up temporary files');
  });
});

describe('RecoveryController — unknown error escalation', () => {
  it('throws UnknownErrorEscalatedError when no pattern matches', async () => {
    const memory = makeMemory([makeKnownError('network timeout')]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    await expect(
      ctrl.recover(failedTaskId, new Error('disk full'), graph, 1)
    ).rejects.toThrowError(UnknownErrorEscalatedError);
  });

  it('throws UnknownErrorEscalatedError when known errors list is empty', async () => {
    const memory = makeMemory([]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    await expect(
      ctrl.recover(failedTaskId, someError, graph, 1)
    ).rejects.toThrowError(UnknownErrorEscalatedError);
  });

  it('UnknownErrorEscalatedError carries the taskId', async () => {
    const memory = makeMemory([]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    const err = await ctrl.recover(failedTaskId, someError, graph, 1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnknownErrorEscalatedError);
    expect((err as UnknownErrorEscalatedError).taskId).toBe(failedTaskId);
  });

  it('UnknownErrorEscalatedError carries the original error', async () => {
    const memory = makeMemory([]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory);

    const err = await ctrl.recover(failedTaskId, someError, graph, 1).catch((e: unknown) => e);

    expect((err as UnknownErrorEscalatedError).originalError).toBe(someError);
  });
});

describe('RecoveryController — max attempts circuit breaker', () => {
  it('throws MaxRecoveryAttemptsError when attempt exceeds maxAttempts', async () => {
    const memory = makeMemory([makeKnownError('disk full')]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory, undefined, undefined, 3);

    await expect(
      ctrl.recover(failedTaskId, someError, graph, 4)
    ).rejects.toThrowError(MaxRecoveryAttemptsError);
  });

  it('does not call memory when max attempts exceeded (short-circuit)', async () => {
    const memory = makeMemory([makeKnownError('disk full')]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory, undefined, undefined, 2);

    await ctrl.recover(failedTaskId, someError, graph, 3).catch(() => undefined);

    expect(memory.getKnownErrors).not.toHaveBeenCalled();
  });

  it('allows recovery at exactly maxAttempts', async () => {
    const memory = makeMemory([makeKnownError('disk full')]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory, undefined, undefined, 3);

    const g2 = await ctrl.recover(failedTaskId, someError, graph, 3);

    expect(g2.size()).toBe(2);
  });

  it('MaxRecoveryAttemptsError carries the taskId and maxAttempts', async () => {
    const memory = makeMemory([]);
    const graph = PlanGraph.empty().addTask(makeTask('t-1'));
    const ctrl = new RecoveryController(memory, undefined, undefined, 2);

    const err = await ctrl.recover(failedTaskId, someError, graph, 3).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MaxRecoveryAttemptsError);
    expect((err as MaxRecoveryAttemptsError).taskId).toBe(failedTaskId);
    expect((err as MaxRecoveryAttemptsError).maxAttempts).toBe(2);
  });
});
