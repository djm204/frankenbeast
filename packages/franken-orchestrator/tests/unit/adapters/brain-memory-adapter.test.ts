import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteBrain } from '@franken/brain';
import { SqliteBrainMemoryAdapter } from '../../../src/adapters/brain-memory-adapter.js';

describe('SqliteBrainMemoryAdapter', () => {
  const brains: SqliteBrain[] = [];

  afterEach(() => {
    for (const brain of brains.splice(0)) brain.close();
  });

  function makeBrain(): SqliteBrain {
    const brain = new SqliteBrain(':memory:');
    brains.push(brain);
    return brain;
  }

  function attachThrowingPlanningFaculty(
    brain: SqliteBrain,
    hook: 'recordStepCompleted' | 'recordStepFailed',
  ): void {
    brain.attachPlanningFaculty({
      kind: 'planning',
      configured: true,
      createPlan: vi.fn(async () => ({ tasks: [] })),
      recordPlanCreated: vi.fn(),
      recordStepCompleted: vi.fn(() => {
        if (hook === 'recordStepCompleted') throw new Error('completion telemetry unavailable');
      }),
      recordStepFailed: vi.fn(() => {
        if (hook === 'recordStepFailed') throw new Error('failure telemetry unavailable');
      }),
    });
  }

  it('preserves the generic success trace when completion lifecycle telemetry throws', async () => {
    const brain = makeBrain();
    attachThrowingPlanningFaculty(brain, 'recordStepCompleted');
    const adapter = new SqliteBrainMemoryAdapter(brain);

    await expect(adapter.recordTrace({
      taskId: 'task-success',
      summary: 'Completed requested work',
      outcome: 'success',
      timestamp: '2026-07-30T12:00:00.000Z',
    })).resolves.toBeUndefined();

    expect(brain.episodic.recent()).toContainEqual(expect.objectContaining({
      type: 'success',
      summary: '[task-success] Completed requested work',
      createdAt: '2026-07-30T12:00:00.000Z',
    }));
  });

  it('preserves the generic failure trace when failure lifecycle telemetry throws', async () => {
    const brain = makeBrain();
    attachThrowingPlanningFaculty(brain, 'recordStepFailed');
    const adapter = new SqliteBrainMemoryAdapter(brain);

    await expect(adapter.recordTrace({
      taskId: 'task-failure',
      objective: 'Compile the workspace',
      summary: 'Compiler exited with an error',
      outcome: 'failure',
      timestamp: '2026-07-30T12:01:00.000Z',
    })).resolves.toBeUndefined();

    expect(brain.episodic.recent()).toContainEqual(expect.objectContaining({
      type: 'failure',
      summary: '[task-failure] Compiler exited with an error',
      createdAt: '2026-07-30T12:01:00.000Z',
    }));
  });
});
