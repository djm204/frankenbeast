import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { UnknownTrackedAgentError } from '../../../src/beasts/errors.js';
import {
  BeastRepositoryJsonCorruptionError,
  SQLiteBeastRepository,
} from '../../../src/beasts/repository/sqlite-beast-repository.js';

type CorruptJsonTable =
  | 'beast_runs'
  | 'beast_run_attempts'
  | 'beast_run_events'
  | 'beast_interview_sessions'
  | 'tracked_agents'
  | 'tracked_agent_events';

interface CorruptJsonFixtureIds {
  readonly runId: string;
  readonly healthyRunId: string;
  readonly attemptId: string;
  readonly eventId: string;
  readonly interviewId: string;
  readonly agentId: string;
  readonly agentEventId: string;
  rowIdFor(table: string): string;
}

function seedCorruptJsonFixture(repo: SQLiteBeastRepository): CorruptJsonFixtureIds {
  const run = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { provider: 'claude' },
    dispatchedBy: 'dashboard',
    dispatchedByUser: 'pfk',
    createdAt: '2026-03-10T00:00:00.000Z',
  });
  const healthyRun = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { healthy: true },
    dispatchedBy: 'dashboard',
    dispatchedByUser: 'pfk',
    createdAt: '2026-03-10T00:00:01.000Z',
  });
  const attempt = repo.createAttempt(run.id, {
    status: 'running',
    executorMetadata: { backend: 'process' },
    startedAt: '2026-03-10T00:01:00.000Z',
  });
  const event = repo.appendEvent(run.id, {
    attemptId: attempt.id,
    type: 'attempt.started',
    payload: { pid: 101 },
    createdAt: '2026-03-10T00:01:01.000Z',
  });
  const interview = repo.createInterviewSession({
    definitionId: 'martin-loop',
    status: 'active',
    answers: { goal: 'hydrate safely' },
    createdAt: '2026-03-10T00:02:00.000Z',
    updatedAt: '2026-03-10T00:02:00.000Z',
  });
  const agent = repo.createTrackedAgent({
    definitionId: 'martin-loop',
    source: 'dashboard',
    status: 'initializing',
    createdByUser: 'operator',
    initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
    initConfig: { identity: { name: 'Corruption test agent' } },
    moduleConfig: { firewall: true },
    createdAt: '2026-03-10T00:03:00.000Z',
    updatedAt: '2026-03-10T00:03:00.000Z',
  });
  const agentEvent = repo.appendTrackedAgentEvent(agent.id, {
    level: 'info',
    type: 'agent.command.sent',
    message: 'Sent martin-loop command',
    payload: { command: 'martin-loop' },
    createdAt: '2026-03-10T00:03:01.000Z',
  });

  return {
    runId: run.id,
    healthyRunId: healthyRun.id,
    attemptId: attempt.id,
    eventId: event.id,
    interviewId: interview.id,
    agentId: agent.id,
    agentEventId: agentEvent.id,
    rowIdFor(table: string): string {
      switch (table as CorruptJsonTable) {
        case 'beast_runs':
          return run.id;
        case 'beast_run_attempts':
          return attempt.id;
        case 'beast_run_events':
          return event.id;
        case 'beast_interview_sessions':
          return interview.id;
        case 'tracked_agents':
          return agent.id;
        case 'tracked_agent_events':
          return agentEvent.id;
      }
    },
  };
}

function corruptJsonColumn(dbPath: string, table: string, column: string, rowId: string): void {
  const db = new Database(dbPath);
  try {
    db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run('{malformed json', rowId);
  } finally {
    db.close();
  }
}
 
describe('SQLiteBeastRepository', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('creates, loads, and lists durable beast runs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { provider: 'claude' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    expect(run.id).toMatch(/^run_/);
    expect(repo.getRun(run.id)).toEqual(run);
    expect(repo.listRuns()).toEqual([run]);
  });

  it('creates attempts and keeps run state in sync', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const run = repo.createRun({
      definitionId: 'chunk-plan',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { chunkSize: 3 },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    const attempt1 = repo.createAttempt(run.id, {
      status: 'running',
      pid: 101,
      startedAt: '2026-03-10T00:01:00.000Z',
      executorMetadata: { backend: 'process' },
    });
    const attempt2 = repo.restartAttempt(run.id, {
      status: 'running',
      pid: 202,
      startedAt: '2026-03-10T00:02:00.000Z',
      executorMetadata: { backend: 'process' },
    });

    expect(attempt1.attemptNumber).toBe(1);
    expect(attempt2.attemptNumber).toBe(2);
    expect(repo.listAttempts(run.id)).toEqual([attempt1, attempt2]);
    expect(repo.getRun(run.id)).toMatchObject({
      currentAttemptId: attempt2.id,
      attemptCount: 2,
    });
  });

  it('rolls back attempt insertion when the paired run update fails', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const run = repo.createRun({
      definitionId: 'chunk-plan',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { chunkSize: 3 },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const originalUpdateRun = repo.updateRun.bind(repo);
    repo.updateRun = (() => {
      throw new Error('simulated run update failure');
    }) as SQLiteBeastRepository['updateRun'];

    expect(() => repo.createAttempt(run.id, {
      status: 'running',
      pid: 101,
      startedAt: '2026-03-10T00:01:00.000Z',
      executorMetadata: { backend: 'process' },
    })).toThrow('simulated run update failure');

    repo.updateRun = originalUpdateRun;
    expect(repo.listAttempts(run.id)).toEqual([]);
    const storedRun = repo.getRun(run.id);
    expect(storedRun).toMatchObject({
      attemptCount: 0,
      status: 'queued',
    });
    expect(storedRun).not.toHaveProperty('currentAttemptId');
  });

  it('appends ordered run events and updates terminal status', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const run = repo.createRun({
      definitionId: 'design-interview',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { goal: 'Design the beasts section' },
      dispatchedBy: 'chat',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const attempt = repo.createAttempt(run.id, {
      status: 'running',
      startedAt: '2026-03-10T00:01:00.000Z',
      executorMetadata: { backend: 'process' },
    });

    const event1 = repo.appendEvent(run.id, {
      attemptId: attempt.id,
      type: 'attempt.started',
      payload: { pid: 333 },
      createdAt: '2026-03-10T00:01:00.000Z',
    });
    const event2 = repo.appendEvent(run.id, {
      attemptId: attempt.id,
      type: 'attempt.stdout',
      payload: { line: 'hello beast' },
      createdAt: '2026-03-10T00:01:01.000Z',
    });

    repo.updateAttempt(attempt.id, {
      status: 'stopped',
      finishedAt: '2026-03-10T00:02:00.000Z',
      exitCode: 137,
      stopReason: 'operator_kill',
    });
    repo.updateRun(run.id, {
      status: 'stopped',
      finishedAt: '2026-03-10T00:02:00.000Z',
      latestExitCode: 137,
      stopReason: 'operator_kill',
    });

    expect(event1.sequence).toBe(1);
    expect(event2.sequence).toBe(2);
    expect(repo.listEvents(run.id)).toEqual([event1, event2]);
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'stopped',
      latestExitCode: 137,
      stopReason: 'operator_kill',
    });
  });

  it('creates, lists, and loads tracked agents', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

    const agent = repo.createTrackedAgent({
      definitionId: 'design-interview',
      source: 'dashboard',
      status: 'initializing',
      createdByUser: 'operator',
      initAction: {
        kind: 'design-interview',
        command: '/interview',
        config: { goal: 'Map the lifecycle' },
        chatSessionId: 'sess-1',
      },
      initConfig: { goal: 'Map the lifecycle' },
      chatSessionId: 'sess-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });

    expect(agent.id).toMatch(/^agent_/);
    expect(repo.getTrackedAgent(agent.id)).toEqual(agent);
    expect(repo.listTrackedAgents()).toEqual([agent]);
  });

  it('appends tracked agent events and links tracked agents to beast runs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agent = repo.createTrackedAgent({
      definitionId: 'chunk-plan',
      source: 'chat',
      status: 'initializing',
      createdByUser: 'chat-session:sess-1',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: {
          designDocPath: 'docs/plans/design.md',
        },
        chatSessionId: 'sess-1',
      },
      initConfig: {
        designDocPath: 'docs/plans/design.md',
      },
      chatSessionId: 'sess-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });

    const event = repo.appendTrackedAgentEvent(agent.id, {
      level: 'info',
      type: 'agent.command.sent',
      message: 'Sent /plan --design-doc docs/plans/design.md',
      payload: {
        sessionId: 'sess-1',
      },
      createdAt: '2026-03-11T00:00:01.000Z',
    });

    const run = repo.createRun({
      definitionId: 'chunk-plan',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        designDocPath: 'docs/plans/design.md',
        outputDir: 'docs/chunks',
      },
      dispatchedBy: 'chat',
      dispatchedByUser: 'chat-session:sess-1',
      createdAt: '2026-03-11T00:00:02.000Z',
    });

    const linked = repo.updateTrackedAgent(agent.id, {
      status: 'dispatching',
      dispatchRunId: run.id,
      updatedAt: '2026-03-11T00:00:02.000Z',
    });

    expect(event.sequence).toBe(1);
    expect(repo.listTrackedAgentEvents(agent.id)).toEqual([event]);
    expect(linked.dispatchRunId).toBe(run.id);
    expect(repo.getTrackedAgent(agent.id)).toMatchObject({
      status: 'dispatching',
      dispatchRunId: run.id,
    });
  });

  it('rolls back linked run creation when the tracked agent is unknown', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

    expect(() => repo.transaction(() => {
      const missingAgentId = 'agent-missing';
      if (!repo.getTrackedAgent(missingAgentId)) {
        throw new UnknownTrackedAgentError(missingAgentId);
      }

      const run = repo.createRun({
        trackedAgentId: missingAgentId,
        definitionId: 'martin-loop',
        definitionVersion: 1,
        executionMode: 'process',
        configSnapshot: {
          provider: 'claude',
          objective: 'Reject invalid tracked agent ids',
          chunkDirectory: 'docs/chunks',
        },
        dispatchedBy: 'api',
        dispatchedByUser: 'operator',
        createdAt: '2026-03-11T00:00:02.000Z',
      });

      repo.appendEvent(run.id, {
        type: 'run.created',
        payload: {
          definitionId: run.definitionId,
        },
        createdAt: run.createdAt,
      });
    })).toThrow('Unknown tracked agent: agent-missing');

    expect(repo.listRuns()).toEqual([]);
  });

  it.each([
    {
      name: 'beast_runs.config_snapshot',
      table: 'beast_runs',
      column: 'config_snapshot',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.getRun(ids.runId),
    },
    {
      name: 'beast_run_attempts.executor_metadata',
      table: 'beast_run_attempts',
      column: 'executor_metadata',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listAttempts(ids.runId),
    },
    {
      name: 'beast_run_events.payload',
      table: 'beast_run_events',
      column: 'payload',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listEvents(ids.runId),
    },
    {
      name: 'beast_interview_sessions.answers',
      table: 'beast_interview_sessions',
      column: 'answers',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.getInterviewSession(ids.interviewId),
    },
    {
      name: 'tracked_agents.init_action',
      table: 'tracked_agents',
      column: 'init_action',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.getTrackedAgent(ids.agentId),
    },
    {
      name: 'tracked_agents.init_config',
      table: 'tracked_agents',
      column: 'init_config',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.getTrackedAgent(ids.agentId),
    },
    {
      name: 'tracked_agents.module_config',
      table: 'tracked_agents',
      column: 'module_config',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.getTrackedAgent(ids.agentId),
    },
    {
      name: 'tracked_agent_events.payload',
      table: 'tracked_agent_events',
      column: 'payload',
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listTrackedAgentEvents(ids.agentId),
    },
  ])('reports structured data-corruption details for corrupt $name JSON', async ({ table, column, exercise }) => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(dbPath);
    const ids = seedCorruptJsonFixture(repo);
    corruptJsonColumn(dbPath, table, column, ids.rowIdFor(table));

    expect(exercise(repo, ids)).toThrow(BeastRepositoryJsonCorruptionError);

    try {
      exercise(repo, ids)();
      throw new Error('expected corrupt JSON read to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BeastRepositoryJsonCorruptionError);
      const corruption = error as BeastRepositoryJsonCorruptionError;
      expect(corruption.context).toMatchObject({
        table,
        column,
        rowId: ids.rowIdFor(table),
        valueSnippet: '{malformed json',
      });
      expect(corruption.message).toContain(`${table}.${column}`);
      expect(corruption.message).toContain(ids.rowIdFor(table));
    }

    expect(repo.getRun(ids.healthyRunId)?.configSnapshot).toEqual({ healthy: true });
  });

  it('migrates legacy beast_runs tables that predate tracked_agent_id', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const legacyDb = new Database(dbPath);

    legacyDb.exec(`
      CREATE TABLE beast_runs (
        id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL,
        definition_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        execution_mode TEXT NOT NULL,
        config_snapshot TEXT NOT NULL,
        dispatched_by TEXT NOT NULL,
        dispatched_by_user TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        current_attempt_id TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_heartbeat_at TEXT,
        stop_reason TEXT,
        latest_exit_code INTEGER
      );
    `);
    legacyDb.close();

    const repo = new SQLiteBeastRepository(dbPath);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        provider: 'claude',
        objective: 'Migrate legacy schema',
        chunkDirectory: 'docs/chunks',
      },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-12T00:00:00.000Z',
    });

    expect(repo.getRun(run.id)).toEqual(run);
  });
});
