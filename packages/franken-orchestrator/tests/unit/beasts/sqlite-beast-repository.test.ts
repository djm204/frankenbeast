import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
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
    initConfig: { identity: { name: 'Corruption test agent' },
        agentRole: 'coding',
        requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'],},
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

function corruptJsonColumn(
  dbPath: string,
  table: string,
  column: string,
  rowId: string,
  value = '{malformed json',
): void {
  const db = new Database(dbPath);
  try {
    db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(value, rowId);
  } finally {
    db.close();
  }
}

function startConcurrentEventInsert(
  dbPath: string,
  sql: string,
  parameters: readonly unknown[],
): { readonly inserted: Promise<void>; readonly completed: Promise<void> } {
  let resolveInserted!: () => void;
  let rejectInserted!: (error: Error) => void;
  const inserted = new Promise<void>((resolve, reject) => {
    resolveInserted = resolve;
    rejectInserted = reject;
  });

  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const Database = require('better-sqlite3');
    const db = new Database(workerData.dbPath);
    db.pragma('busy_timeout = 5000');
    db.prepare('BEGIN IMMEDIATE').run();
    db.prepare(workerData.sql).run(...workerData.parameters);
    parentPort.postMessage('inserted');
    setTimeout(() => {
      db.prepare('COMMIT').run();
      db.close();
      parentPort.postMessage('committed');
    }, 100);
  `, {
    eval: true,
    workerData: { dbPath, sql, parameters },
  });

  const completed = new Promise<void>((resolve, reject) => {
    worker.on('message', (message: unknown) => {
      if (message === 'inserted') resolveInserted();
      if (message === 'committed') resolve();
    });
    worker.once('error', (error) => {
      rejectInserted(error);
      reject(error);
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        const error = new Error(`concurrent event writer exited with code ${code}`);
        rejectInserted(error);
        reject(error);
      }
    });
  });

  return { inserted, completed };
}
 
describe('SQLiteBeastRepository', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('uses insertion order to break latest-context timestamp ties', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(dbPath);
    const createdAt = '2026-03-10T00:00:00.000Z';
    const oldRun = repo.createRun({
      definitionId: 'martin-loop', definitionVersion: 1, executionMode: 'process',
      configSnapshot: { generation: 'old' }, dispatchedBy: 'api', dispatchedByUser: 'operator', createdAt,
    });
    const newRun = repo.createRun({
      definitionId: 'martin-loop', definitionVersion: 1, executionMode: 'process',
      configSnapshot: { generation: 'new' }, dispatchedBy: 'api', dispatchedByUser: 'operator', createdAt,
    });
    const createAgent = (name: string) => repo.createTrackedAgent({
      definitionId: 'martin-loop', source: 'api', status: 'completed', createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { name }, createdAt, updatedAt: createdAt,
    });
    const oldAgent = createAgent('old');
    const newAgent = createAgent('new');
    const database = new Database(dbPath);
    database.prepare('UPDATE beast_runs SET id = ? WHERE id = ?').run('run_z_old', oldRun.id);
    database.prepare('UPDATE beast_runs SET id = ? WHERE id = ?').run('run_a_new', newRun.id);
    database.prepare('UPDATE tracked_agents SET id = ? WHERE id = ?').run('agent_z_old', oldAgent.id);
    database.prepare('UPDATE tracked_agents SET id = ? WHERE id = ?').run('agent_a_new', newAgent.id);
    database.close();

    expect(repo.getLatestRunForDefinition('martin-loop')?.id).toBe('run_a_new');
    expect(repo.getLatestTrackedAgentForDefinition('martin-loop')?.id).toBe('agent_a_new');
    repo.close();
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

  it('paginates Beast runs over a stable snapshot and enforces page limits', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(dbPath);
    let sequence = 0;
    const createRun = () => repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: new Date(Date.UTC(2026, 2, 10, 0, 0, sequence++)).toISOString(),
    });
    const originalIds = [createRun().id, createRun().id, createRun().id];

    const first = repo.listRunPage({ limit: 2 });
    expect(first.runs).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));

    const insertedBetweenPages = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      // A row inserted after page one but sorted into the remaining window must
      // still be excluded from the snapshot.
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const second = repo.listRunPage({ limit: 2, cursor: first.nextCursor });
    expect(second.runs).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    expect([...first.runs, ...second.runs].map(({ id }) => id).sort()).toEqual(originalIds.sort());
    expect([...first.runs, ...second.runs]).not.toContainEqual(expect.objectContaining({ id: insertedBetweenPages.id }));
    expect(() => repo.listRunPage({ limit: 201 })).toThrow(RangeError);
    expect(() => repo.listRunPage({ limit: 1, cursor: 'not-a-cursor' })).toThrow('Invalid Beast run pagination cursor');

    const db = new Database(dbPath, { readonly: true });
    const firstPlan = db.prepare(
      `EXPLAIN QUERY PLAN SELECT * FROM beast_runs INDEXED BY idx_beast_runs_created_at_id
        WHERE rowid <= ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).all(3, 3) as Array<{ detail: string }>;
    const cursorPlan = db.prepare(
      `EXPLAIN QUERY PLAN SELECT * FROM beast_runs INDEXED BY idx_beast_runs_created_at_id
        WHERE rowid <= ?
          AND (created_at < ? OR (created_at = ? AND id < ?))
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    ).all(
      3,
      '2026-03-10T00:00:01.000Z',
      '2026-03-10T00:00:01.000Z',
      originalIds[1],
      3,
    ) as Array<{ detail: string }>;
    const plan = [...firstPlan, ...cursorPlan].map(({ detail }) => detail).join('\n');
    expect(plan).toContain('idx_beast_runs_created_at_id');
    expect(plan).not.toContain('USE TEMP B-TREE');
    db.close();
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

  it('migrates the run-attempt lookup index idempotently', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const initialRepo = new SQLiteBeastRepository(dbPath);
    const run = initialRepo.createRun({
      definitionId: 'chunk-plan',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    initialRepo.createAttempt(run.id, { status: 'failed' });
    initialRepo.restartAttempt(run.id, { status: 'running' });
    initialRepo.close();

    const legacyDatabase = new Database(dbPath);
    legacyDatabase.prepare('DROP INDEX IF EXISTS idx_beast_run_attempts_run_id_attempt_number').run();
    legacyDatabase.close();

    const migratedRepo = new SQLiteBeastRepository(dbPath);
    expect(migratedRepo.listAttempts(run.id).map(({ attemptNumber }) => attemptNumber)).toEqual([1, 2]);
    migratedRepo.close();

    // Opening an already-migrated database must remain safe.
    const reopenedRepo = new SQLiteBeastRepository(dbPath);
    reopenedRepo.close();

    const database = new Database(dbPath, { readonly: true });
    const indexes = database.pragma("index_list('beast_run_attempts')") as Array<{ name: string }>;
    expect(indexes.map(({ name }) => name)).toContain('idx_beast_run_attempts_run_id_attempt_number');
    const indexColumns = database.pragma(
      "index_info('idx_beast_run_attempts_run_id_attempt_number')",
    ) as Array<{
      name: string;
    }>;
    expect(indexColumns.map(({ name }) => name)).toEqual(['run_id', 'attempt_number']);
    const plan = database.prepare(
      'EXPLAIN QUERY PLAN SELECT * FROM beast_run_attempts WHERE run_id = ? ORDER BY attempt_number ASC',
    ).all(run.id) as Array<{ detail: string }>;
    expect(plan.map(({ detail }) => detail).join('\n')).toContain(
      'idx_beast_run_attempts_run_id_attempt_number',
    );
    database.close();
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

  it('increments heartbeat sequence and logs duplicate or regressive heartbeat writes', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const run = repo.createRun({
      definitionId: 'heartbeat-worker',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { workerId: 't_worker_1' },
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    const first = repo.updateRun(run.id, {
      lastHeartbeatAt: '2026-03-10T00:01:00.000Z',
      heartbeatSource: 'kanban-heartbeat-writer',
    });
    const duplicate = repo.updateRun(run.id, {
      lastHeartbeatAt: '2026-03-10T00:01:00.000Z',
      heartbeatSource: 'kanban-heartbeat-writer',
    });
    const regressive = repo.updateRun(run.id, {
      lastHeartbeatAt: '2026-03-10T00:00:59.000Z',
      heartbeatSource: 'kanban-heartbeat-writer',
    });

    expect(first.lastHeartbeatSequence).toBe(1);
    expect(duplicate.lastHeartbeatSequence).toBe(2);
    expect(regressive.lastHeartbeatSequence).toBe(3);
    expect(repo.getRun(run.id)).toMatchObject({
      lastHeartbeatAt: '2026-03-10T00:00:59.000Z',
      lastHeartbeatSequence: 3,
    });
    expect(repo.listEvents(run.id).map(event => ({ type: event.type, payload: event.payload }))).toEqual([
      {
        type: 'run.heartbeat.anomaly',
        payload: {
          code: 'duplicate-heartbeat',
          workerId: run.id,
          source: 'kanban-heartbeat-writer',
          priorSequence: 1,
          newSequence: 2,
          priorHeartbeatAt: '2026-03-10T00:01:00.000Z',
          newHeartbeatAt: '2026-03-10T00:01:00.000Z',
        },
      },
      {
        type: 'run.heartbeat.anomaly',
        payload: {
          code: 'regressive-heartbeat',
          workerId: run.id,
          source: 'kanban-heartbeat-writer',
          priorSequence: 2,
          newSequence: 3,
          priorHeartbeatAt: '2026-03-10T00:01:00.000Z',
          newHeartbeatAt: '2026-03-10T00:00:59.000Z',
        },
      },
    ]);
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
    expect(repo.listEvents(run.id, { afterSequence: 1, limit: 1 })).toEqual([event2]);
    expect(repo.getRun(run.id)).toMatchObject({
      status: 'stopped',
      latestExitCode: 137,
      stopReason: 'operator_kill',
    });
  });

  it('allocates a run-event sequence after a concurrent writer commits', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const databasePath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(databasePath);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const concurrent = startConcurrentEventInsert(
      databasePath,
      `INSERT INTO beast_run_events
        (id, run_id, attempt_id, sequence, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['event_concurrent', run.id, null, 1, 'run.concurrent', '{}', '2026-03-10T00:00:01.000Z'],
    );
    await concurrent.inserted;

    const appended = repo.transaction(() => {
      expect(repo.getRun(run.id)).toBeDefined();
      return repo.appendEvent(run.id, {
        type: 'run.local',
        payload: {},
        createdAt: '2026-03-10T00:00:02.000Z',
      });
    });
    await concurrent.completed;

    expect(appended.sequence).toBe(2);
    expect(repo.listEvents(run.id).map((event) => event.sequence)).toEqual([1, 2]);
  });

  it('bounds recovered event pages by raw rows scanned and indexes the cursor query', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const databasePath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(databasePath);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-10T00:00:00.000Z',
    });
    const events = Array.from({ length: 4 }, (_, index) => repo.appendEvent(run.id, {
      type: `run.event.${index + 1}`,
      payload: { sequence: index + 1 },
      createdAt: `2026-03-10T00:00:0${index + 1}.000Z`,
    }));
    const database = new Database(databasePath);
    database.prepare('UPDATE beast_run_events SET payload = ? WHERE id = ?').run('{invalid', events[1]!.id);

    expect(repo.listEvents(run.id, { recoverCorruptJson: true, limit: 3 }).map((event) => event.sequence))
      .toEqual([1, 3]);
    const indexes = database.pragma("index_list('beast_run_events')") as Array<{ name: string; unique: 0 | 1 }>;
    expect(indexes.map((index) => index.name)).toContain('idx_beast_run_events_run_sequence');
    expect(indexes).toContainEqual(expect.objectContaining({
      name: 'uq_beast_run_events_run_sequence',
      unique: 1,
    }));
    database.close();
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
      initConfig: { goal: 'Map the lifecycle', agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'] },
      chatSessionId: 'sess-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });

    expect(agent.id).toMatch(/^agent_/);
    expect(repo.getTrackedAgent(agent.id)).toEqual(agent);
    expect(repo.listTrackedAgents()).toEqual([agent]);
  });

  it('paginates tracked agents with stable same-timestamp boundaries and snapshots', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const createAgent = () => repo.createTrackedAgent({
      definitionId: 'design-interview',
      source: 'dashboard',
      status: 'initializing',
      createdByUser: 'operator',
      initAction: { kind: 'design-interview', command: '/interview', config: {} },
      initConfig: {},
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });
    const originalIds = [createAgent().id, createAgent().id, createAgent().id];
    const first = repo.listTrackedAgentPage({ limit: 2 });
    expect(first.agents).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));

    const insertedBetweenPages = createAgent();
    const second = repo.listTrackedAgentPage({ limit: 2, cursor: first.nextCursor });
    expect(second.agents).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    expect([...first.agents, ...second.agents].map(({ id }) => id).sort()).toEqual(originalIds.sort());
    expect([...first.agents, ...second.agents]).not.toContainEqual(expect.objectContaining({ id: insertedBetweenPages.id }));
    expect(() => repo.listTrackedAgentPage({ limit: 201 })).toThrow(RangeError);
    expect(() => repo.listTrackedAgentPage({ limit: 1, cursor: 'not-a-cursor' })).toThrow('Invalid tracked-agent pagination cursor');
  });

  it('treats healthy legacy agents as operationally recovered while retaining redaction history', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      status: 'failed',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { provider: 'claude', objective: 'Retry safely', chunkDirectory: 'docs/chunks' },
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });
    repo.appendTrackedAgentEvent(agent.id, {
      level: 'error',
      type: 'agent.dispatch.failed',
      message: 'Worker process could not be spawned.',
      payload: {},
      createdAt: '2026-03-11T00:00:01.000Z',
    });

    expect(repo.hasActiveDispatchFailure(agent.id)).toBe(true);
    expect(repo.listActiveDispatchFailureAgentIds()).toEqual([agent.id]);
    expect(repo.hasDispatchFailureHistory(agent.id)).toBe(true);
    expect(repo.listDispatchFailureHistoryAgentIds()).toEqual([agent.id]);

    repo.updateTrackedAgent(agent.id, {
      status: 'completed',
      updatedAt: '2026-03-11T00:01:00.000Z',
    });

    expect(repo.hasActiveDispatchFailure(agent.id)).toBe(false);
    expect(repo.listActiveDispatchFailureAgentIds()).toEqual([]);
    expect(repo.hasDispatchFailureHistory(agent.id)).toBe(true);
    expect(repo.listDispatchFailureHistoryAgentIds()).toEqual([agent.id]);
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
        agentRole: 'coding',
        requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'],},
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

  it('allocates a tracked-agent-event sequence after a concurrent writer commits', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const databasePath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(databasePath);
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      status: 'initializing',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: {},
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });
    const concurrent = startConcurrentEventInsert(
      databasePath,
      `INSERT INTO tracked_agent_events
        (id, agent_id, sequence, level, type, message, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'agent_event_concurrent',
        agent.id,
        1,
        'info',
        'agent.concurrent',
        'Concurrent event',
        '{}',
        '2026-03-11T00:00:01.000Z',
      ],
    );
    await concurrent.inserted;

    const appended = repo.appendTrackedAgentEvent(agent.id, {
      level: 'info',
      type: 'agent.local',
      message: 'Local event',
      payload: {},
      createdAt: '2026-03-11T00:00:02.000Z',
    });
    await concurrent.completed;

    expect(appended.sequence).toBe(2);
    expect(repo.listTrackedAgentEvents(agent.id).map((event) => event.sequence)).toEqual([1, 2]);
    const database = new Database(databasePath);
    const indexes = database.pragma("index_list('tracked_agent_events')") as Array<{ name: string; unique: 0 | 1 }>;
    expect(indexes).toContainEqual(expect.objectContaining({
      name: 'uq_tracked_agent_events_agent_sequence',
      unique: 1,
    }));
    database.close();
  });

  it('repairs duplicate event sequences before enforcing unique indexes', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const databasePath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(databasePath);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-12T00:00:00.000Z',
    });
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      status: 'initializing',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: {},
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z',
    });
    const database = new Database(databasePath);
    database.prepare('DROP INDEX uq_beast_run_events_run_sequence').run();
    database.prepare('DROP INDEX uq_tracked_agent_events_agent_sequence').run();
    database.prepare(
      `INSERT INTO beast_run_events
        (id, run_id, attempt_id, sequence, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'event_duplicate_a', run.id, null, 1, 'run.first', '{}', '2026-03-12T00:00:01.000Z',
      'event_duplicate_b', run.id, null, 1, 'run.second', '{}', '2026-03-12T00:00:02.000Z',
    );
    database.prepare(
      `INSERT INTO beast_run_events
        (id, run_id, attempt_id, sequence, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('event_later', run.id, null, 1_000, 'run.later', '{}', '2026-03-12T00:00:03.000Z');
    database.prepare(
      `INSERT INTO tracked_agent_events
        (id, agent_id, sequence, level, type, message, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'agent_event_duplicate_a', agent.id, 1, 'error', 'agent.dispatch.failed', 'First failure', '{}', '2026-03-12T00:00:01.000Z',
      'agent_event_duplicate_b', agent.id, 1, 'info', 'agent.dispatch.recovered', 'Recovered', '{}', '2026-03-12T00:00:02.000Z',
    );
    database.prepare(
      `INSERT INTO tracked_agent_events
        (id, agent_id, sequence, level, type, message, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'agent_event_later', agent.id, 1_000, 'error', 'agent.dispatch.failed', 'Later failure', '{}', '2026-03-12T00:00:03.000Z',
    );
    database.close();

    const migrated = new SQLiteBeastRepository(databasePath);

    expect(migrated.listEvents(run.id).map((event) => [event.sequence, event.type])).toEqual([
      [1, 'run.first'],
      [2, 'run.second'],
      [1_000, 'run.later'],
    ]);
    expect(migrated.listTrackedAgentEvents(agent.id).map((event) => [event.sequence, event.type])).toEqual([
      [1, 'agent.dispatch.failed'],
      [2, 'agent.dispatch.recovered'],
      [1_000, 'agent.dispatch.failed'],
    ]);
    expect(migrated.hasUnrecoveredDispatchFailure(agent.id)).toBe(true);
    const migratedDatabase = new Database(databasePath);
    expect(migratedDatabase.pragma("index_list('beast_run_events')")).toContainEqual(expect.objectContaining({
      name: 'uq_beast_run_events_run_sequence',
      unique: 1,
    }));
    expect(migratedDatabase.pragma("index_list('tracked_agent_events')")).toContainEqual(expect.objectContaining({
      name: 'uq_tracked_agent_events_agent_sequence',
      unique: 1,
    }));
    migratedDatabase.close();
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
      recovers: true,
      strictExercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listAttempts(ids.runId),
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listAttempts(
        ids.runId,
        { recoverCorruptJson: true },
      ),
    },
    {
      name: 'beast_run_events.payload',
      table: 'beast_run_events',
      column: 'payload',
      recovers: true,
      strictExercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listEvents(ids.runId),
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listEvents(
        ids.runId,
        { recoverCorruptJson: true },
      ),
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
      recovers: true,
      strictExercise: (repo: SQLiteBeastRepository) => () => repo.listTrackedAgents(),
      exercise: (repo: SQLiteBeastRepository) => () => repo.listTrackedAgents({ recoverCorruptJson: true }),
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
      recovers: true,
      strictExercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => (
        repo.listTrackedAgentEvents(ids.agentId)
      ),
      exercise: (repo: SQLiteBeastRepository, ids: CorruptJsonFixtureIds) => () => repo.listTrackedAgentEvents(
        ids.agentId,
        { recoverCorruptJson: true },
      ),
    },
  ])('handles corrupt $name JSON with structured diagnostics', async ({
    table,
    column,
    exercise,
    recovers,
    strictExercise,
  }) => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(dbPath);
    const ids = seedCorruptJsonFixture(repo);
    corruptJsonColumn(dbPath, table, column, ids.rowIdFor(table));

    if (recovers) {
      if (!strictExercise) throw new Error(`missing strict exercise for ${table}.${column}`);
      expect(strictExercise(repo, ids)).toThrow(BeastRepositoryJsonCorruptionError);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(exercise(repo, ids)()).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${table}.${column} for row ${ids.rowIdFor(table)}`));
      warn.mockRestore();
    } else {
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
          valueSnippet: '[redacted]',
        });
        expect(corruption.message).toContain(`${table}.${column}`);
        expect(corruption.message).toContain(ids.rowIdFor(table));
      }
    }

    expect(repo.getRun(ids.healthyRunId)?.configSnapshot).toEqual({ healthy: true });
  });

  it('keeps healthy runs listable without leaking or mutating a corrupt JSON value', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beasts-repo-'));
    const dbPath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(dbPath);
    const ids = seedCorruptJsonFixture(repo);
    const corruptValue = 'super-secret-token';
    corruptJsonColumn(dbPath, 'beast_runs', 'config_snapshot', ids.runId, corruptValue);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => repo.listRuns()).toThrow(BeastRepositoryJsonCorruptionError);
    expect(repo.listRuns({ recoverCorruptJson: true }).map((run) => run.id)).toEqual([ids.healthyRunId]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`beast_runs.config_snapshot for row ${ids.runId}`));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('super-secret-token'));

    const db = new Database(dbPath);
    try {
      const stored = db.prepare('SELECT config_snapshot FROM beast_runs WHERE id = ?').get(ids.runId) as {
        config_snapshot: string;
      };
      expect(stored.config_snapshot).toBe(corruptValue);
    } finally {
      db.close();
    }

    expect(() => repo.getRun(ids.runId)).toThrow(BeastRepositoryJsonCorruptionError);
    try {
      repo.getRun(ids.runId);
    } catch (error) {
      const corruption = error as BeastRepositoryJsonCorruptionError;
      expect(corruption.context.valueSnippet).not.toContain('super-secret-token');
      expect(corruption.message).not.toContain('super-secret-token');
      expect((corruption as Error & { cause?: unknown }).cause).toBeUndefined();
    }

    warn.mockRestore();
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
