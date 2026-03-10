import { describe, expect, it, expectTypeOf } from 'vitest';
import type {
  BeastDefinition,
  BeastDispatchSource,
  BeastExecutionMode,
  BeastRun,
  BeastRunAttempt,
  BeastRunEvent,
  BeastRunStatus,
} from '../../../src/beasts/types.js';

describe('beast types', () => {
  it('supports the approved run lifecycle statuses', () => {
    const statuses: BeastRunStatus[] = [
      'queued',
      'interviewing',
      'running',
      'pending_approval',
      'completed',
      'failed',
      'stopped',
    ];

    expect(statuses).toHaveLength(7);
    expectTypeOf<BeastRunStatus>().toEqualTypeOf<
      'queued'
      | 'interviewing'
      | 'running'
      | 'pending_approval'
      | 'completed'
      | 'failed'
      | 'stopped'
    >();
  });

  it('captures the fixed dispatch sources and execution modes', () => {
    const sources: BeastDispatchSource[] = ['cli', 'dashboard', 'chat', 'api'];
    const modes: BeastExecutionMode[] = ['process', 'container'];

    expect(sources).toEqual(['cli', 'dashboard', 'chat', 'api']);
    expect(modes).toEqual(['process', 'container']);
  });

  it('defines durable run, attempt, event, and catalog shapes', () => {
    const definition: BeastDefinition = {
      id: 'martin-loop',
      version: 1,
      label: 'Martin Loop',
      description: 'Run the martin loop executor',
      executionModeDefault: 'process',
      telemetryLabels: {
        family: 'martin-loop',
      },
    };

    const run: BeastRun = {
      id: 'run-1',
      definitionId: definition.id,
      definitionVersion: definition.version,
      status: 'queued',
      executionMode: 'process',
      configSnapshot: { provider: 'claude' },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
      attemptCount: 0,
    };

    const attempt: BeastRunAttempt = {
      id: 'attempt-1',
      runId: run.id,
      attemptNumber: 1,
      status: 'running',
      pid: 12345,
      startedAt: '2026-03-10T00:01:00.000Z',
      executorMetadata: { backend: 'process' },
    };

    const event: BeastRunEvent = {
      id: 'event-1',
      runId: run.id,
      attemptId: attempt.id,
      sequence: 1,
      type: 'attempt.started',
      payload: { pid: attempt.pid },
      createdAt: '2026-03-10T00:01:00.000Z',
    };

    expect(definition.executionModeDefault).toBe('process');
    expect(run.status).toBe('queued');
    expect(attempt.status).toBe('running');
    expect(event.type).toBe('attempt.started');
  });
});
