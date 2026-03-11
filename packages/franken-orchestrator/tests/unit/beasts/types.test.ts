import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  TRACKED_AGENT_INIT_ACTION_KINDS,
  TRACKED_AGENT_STATUSES,
} from '../../../src/beasts/agent-types.js';
import type {
  BeastDefinition,
  BeastDispatchSource,
  BeastExecutionMode,
  TrackedAgent,
  TrackedAgentEvent,
  TrackedAgentInitAction,
  TrackedAgentStatus,
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

  it('supports the tracked agent init lifecycle statuses', () => {
    const statuses: TrackedAgentStatus[] = [...TRACKED_AGENT_STATUSES];

    expect(statuses).toHaveLength(7);
    expect(statuses).toEqual([
      'initializing',
      'awaiting_approval',
      'dispatching',
      'running',
      'completed',
      'failed',
      'stopped',
    ]);
    expectTypeOf<TrackedAgentStatus>().toEqualTypeOf<
      | 'initializing'
      | 'awaiting_approval'
      | 'dispatching'
      | 'running'
      | 'completed'
      | 'failed'
      | 'stopped'
    >();
  });

  it('defines tracked agent records with chat-backed init metadata and run linkage', () => {
    expect(TRACKED_AGENT_INIT_ACTION_KINDS).toEqual([
      'design-interview',
      'chunk-plan',
      'martin-loop',
    ]);

    const initAction: TrackedAgentInitAction = {
      kind: 'design-interview',
      command: '/interview',
      chatSessionId: 'sess-1',
      config: {
        goal: 'Design the tracked agent flow',
      },
    };

    const agent: TrackedAgent = {
      id: 'agent-1',
      definitionId: 'design-interview',
      status: 'initializing',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction,
      initConfig: {
        goal: 'Design the tracked agent flow',
      },
      chatSessionId: 'sess-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:01.000Z',
    };

    const event: TrackedAgentEvent = {
      id: 'agent-event-1',
      agentId: agent.id,
      sequence: 1,
      level: 'info',
      type: 'agent.initialized',
      message: 'Tracked agent created.',
      payload: {
        status: agent.status,
      },
      createdAt: '2026-03-11T00:00:01.000Z',
    };

    const dispatchedAgent: TrackedAgent = {
      ...agent,
      status: 'dispatching',
      dispatchRunId: 'run-1',
      updatedAt: '2026-03-11T00:00:02.000Z',
    };

    expect(initAction.chatSessionId).toBe('sess-1');
    expect(event.type).toBe('agent.initialized');
    expect(dispatchedAgent.dispatchRunId).toBe('run-1');
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
