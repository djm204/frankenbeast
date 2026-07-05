import { describe, expect, it } from 'vitest';
import { ProcessBeastExecutor } from '../../src/beasts/execution/process-beast-executor.js';
import type { ProcessCallbacks, ProcessSupervisorLike } from '../../src/beasts/execution/process-supervisor.js';
import type { BeastLogStore } from '../../src/beasts/events/beast-log-store.js';
import type { BeastEventBus } from '../../src/beasts/events/beast-event-bus.js';
import type { SQLiteBeastRepository } from '../../src/beasts/repository/sqlite-beast-repository.js';
import type { BeastDefinition, BeastRun, BeastRunAttempt, BeastRunEvent } from '../../src/beasts/types.js';

type LogEntry = {
  runId: string;
  attemptId: string;
  stream: 'stdout' | 'stderr';
  message: string;
};

type PublishedEvent = {
  type: string;
  data: Record<string, unknown>;
};

function createRun(): BeastRun {
  return {
    id: 'run-early-redaction',
    definitionId: 'test-beast',
    definitionVersion: 1,
    status: 'queued',
    executionMode: 'process',
    configSnapshot: {},
    dispatchedBy: 'api',
    dispatchedByUser: 'test',
    createdAt: '2026-07-05T00:00:00.000Z',
    attemptCount: 0,
  };
}

function createDefinition(): BeastDefinition {
  return {
    id: 'test-beast',
    version: 1,
    label: 'Test Beast',
    description: 'Test definition',
    executionModeDefault: 'process',
    configSchema: {} as BeastDefinition['configSchema'],
    interviewPrompts: [],
    buildProcessSpec: () => ({ command: 'node', args: ['beast.js'], cwd: process.cwd() }),
    telemetryLabels: {},
  };
}

function createRepository() {
  const attempts = new Map<string, BeastRunAttempt>();
  const events: Array<Omit<BeastRunEvent, 'id' | 'runId' | 'sequence'>> = [];
  return {
    events,
    createAttempt(runId: string, fields: Omit<BeastRunAttempt, 'id' | 'runId' | 'attemptNumber'>): BeastRunAttempt {
      const attempt: BeastRunAttempt = {
        id: 'attempt-1',
        runId,
        attemptNumber: 1,
        ...fields,
      };
      attempts.set(attempt.id, attempt);
      return attempt;
    },
    getAttempt(attemptId: string): BeastRunAttempt | undefined {
      return attempts.get(attemptId);
    },
    updateAttempt(attemptId: string, fields: Partial<BeastRunAttempt>): BeastRunAttempt {
      const current = attempts.get(attemptId);
      if (!current) throw new Error(`missing attempt ${attemptId}`);
      const updated = { ...current, ...fields };
      attempts.set(attemptId, updated);
      return updated;
    },
    updateRun: () => {},
    appendEvent(_runId: string, event: Omit<BeastRunEvent, 'id' | 'runId' | 'sequence'>): void {
      events.push(event);
    },
  };
}

describe('ProcessBeastExecutor log redaction', () => {
  it('redacts early stdout and stderr before flushing them to durable logs and events', async () => {
    const rawStdoutSecret = `${'sk'}-${'12345678901234567890'}`;
    const rawStderrSecret = `${'ghp'}_${'abcdefghijklmnopqrstuvwxyz1234567890'}`;
    const logs: LogEntry[] = [];
    const publishedEvents: PublishedEvent[] = [];
    const repository = createRepository();
    const logStore = {
      async append(
        runId: string,
        attemptId: string,
        stream: 'stdout' | 'stderr',
        message: string,
      ): Promise<void> {
        logs.push({ runId, attemptId, stream, message });
      },
    } as BeastLogStore;
    const eventBus = {
      publish(event: PublishedEvent): void {
        publishedEvents.push(event);
      },
    } as BeastEventBus;
    const supervisor: ProcessSupervisorLike = {
      async spawn(_spec, callbacks: ProcessCallbacks) {
        callbacks.onStdout(`booting with OPENAI_API_KEY=${rawStdoutSecret}`);
        callbacks.onStderr(`failed Authorization: Bearer ${rawStderrSecret}`);
        return { pid: 4242 };
      },
      async stop() {},
      async kill() {},
    };

    const executor = new ProcessBeastExecutor(
      repository as unknown as SQLiteBeastRepository,
      logStore,
      supervisor,
      { eventBus },
    );

    await executor.start(createRun(), createDefinition());

    const stdoutLog = logs.find((entry) => entry.stream === 'stdout')?.message ?? '';
    const stderrLog = logs.find((entry) => entry.stream === 'stderr')?.message ?? '';
    const publishedLogLines = publishedEvents
      .filter((event) => event.type === 'run.log')
      .map((event) => String(event.data.line));

    expect(stdoutLog).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(stderrLog).toContain('Authorization: Bearer [REDACTED]');
    expect([...logs.map((entry) => entry.message), ...publishedLogLines].join('\n')).not.toContain(rawStdoutSecret);
    expect([...logs.map((entry) => entry.message), ...publishedLogLines].join('\n')).not.toContain(rawStderrSecret);
  });
});
