import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type {
  BeastDispatchSource,
  BeastExecutionMode,
  BeastInterviewSession,
  BeastRun,
  BeastRunAttempt,
  BeastRunEvent,
  BeastRunStatus,
  TrackedAgent,
  TrackedAgentEvent,
  TrackedAgentInitAction,
  TrackedAgentStatus,
} from '../types.js';
import { UnknownTrackedAgentError } from '../errors.js';
import { BEAST_SQLITE_SCHEMA_STATEMENTS } from './sqlite-schema.js';

interface CreateRunInput {
  trackedAgentId?: string | undefined;
  definitionId: string;
  definitionVersion: number;
  executionMode: BeastExecutionMode;
  configSnapshot: Readonly<Record<string, unknown>>;
  dispatchedBy: BeastDispatchSource;
  dispatchedByUser: string;
  createdAt: string;
}

interface CreateAttemptInput {
  status: BeastRunStatus;
  pid?: number | undefined;
  startedAt?: string | undefined;
  executorMetadata?: Readonly<Record<string, unknown>> | undefined;
}

interface UpdateRunPatch {
  status?: BeastRunStatus | undefined;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  currentAttemptId?: string | undefined;
  attemptCount?: number | undefined;
  lastHeartbeatAt?: string | undefined;
  stopReason?: string | undefined;
  latestExitCode?: number | undefined;
}

interface UpdateAttemptPatch {
  status?: BeastRunStatus | undefined;
  pid?: number | undefined;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  exitCode?: number | undefined;
  stopReason?: string | undefined;
  executorMetadata?: Readonly<Record<string, unknown>> | undefined;
}

interface AppendEventInput {
  attemptId?: string | undefined;
  type: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

interface CreateTrackedAgentInput {
  definitionId: string;
  source: BeastDispatchSource;
  status: TrackedAgentStatus;
  createdByUser: string;
  initAction: TrackedAgentInitAction;
  initConfig: Readonly<Record<string, unknown>>;
  chatSessionId?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

interface UpdateTrackedAgentPatch {
  status?: TrackedAgentStatus | undefined;
  chatSessionId?: string | undefined;
  dispatchRunId?: string | undefined;
  updatedAt?: string | undefined;
}

interface AppendTrackedAgentEventInput {
  level: TrackedAgentEvent['level'];
  type: string;
  message: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

type BeastRunRow = {
  id: string;
  tracked_agent_id: string | null;
  definition_id: string;
  definition_version: number;
  status: BeastRunStatus;
  execution_mode: BeastExecutionMode;
  config_snapshot: string;
  dispatched_by: BeastDispatchSource;
  dispatched_by_user: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  current_attempt_id: string | null;
  attempt_count: number;
  last_heartbeat_at: string | null;
  stop_reason: string | null;
  latest_exit_code: number | null;
};

type BeastAttemptRow = {
  id: string;
  run_id: string;
  attempt_number: number;
  status: BeastRunStatus;
  pid: number | null;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  stop_reason: string | null;
  executor_metadata: string | null;
};

type BeastEventRow = {
  id: string;
  run_id: string;
  attempt_id: string | null;
  sequence: number;
  type: string;
  payload: string;
  created_at: string;
};

type BeastInterviewSessionRow = {
  id: string;
  definition_id: string;
  status: BeastInterviewSession['status'];
  answers: string;
  created_at: string;
  updated_at: string;
};

type TrackedAgentRow = {
  id: string;
  definition_id: string;
  source: BeastDispatchSource;
  status: TrackedAgentStatus;
  created_by_user: string;
  init_action: string;
  init_config: string;
  chat_session_id: string | null;
  dispatch_run_id: string | null;
  created_at: string;
  updated_at: string;
};

type TrackedAgentEventRow = {
  id: string;
  agent_id: string;
  sequence: number;
  level: TrackedAgentEvent['level'];
  type: string;
  message: string;
  payload: string;
  created_at: string;
};

function prefixedId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export class SQLiteBeastRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);

    for (const statement of BEAST_SQLITE_SCHEMA_STATEMENTS) {
      this.db.prepare(statement).run();
    }

    this.migrateLegacySchema();
  }

  createRun(input: CreateRunInput): BeastRun {
    const run: BeastRun = {
      id: prefixedId('run'),
      ...(input.trackedAgentId ? { trackedAgentId: input.trackedAgentId } : {}),
      definitionId: input.definitionId,
      definitionVersion: input.definitionVersion,
      status: 'queued',
      executionMode: input.executionMode,
      configSnapshot: input.configSnapshot,
      dispatchedBy: input.dispatchedBy,
      dispatchedByUser: input.dispatchedByUser,
      createdAt: input.createdAt,
      attemptCount: 0,
    };

    this.db.prepare(
      `INSERT INTO beast_runs (
        id,
        tracked_agent_id,
        definition_id,
        definition_version,
        status,
        execution_mode,
        config_snapshot,
        dispatched_by,
        dispatched_by_user,
        created_at,
        attempt_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      run.id,
      run.trackedAgentId ?? null,
      run.definitionId,
      run.definitionVersion,
      run.status,
      run.executionMode,
      JSON.stringify(run.configSnapshot),
      run.dispatchedBy,
      run.dispatchedByUser,
      run.createdAt,
      run.attemptCount,
    );

    return run;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  getRun(runId: string): BeastRun | undefined {
    const row = this.db.prepare('SELECT * FROM beast_runs WHERE id = ?').get(runId) as BeastRunRow | undefined;
    return row ? mapRun(row) : undefined;
  }

  listRuns(): BeastRun[] {
    const rows = this.db.prepare('SELECT * FROM beast_runs ORDER BY created_at DESC, id DESC').all() as BeastRunRow[];
    return rows.map(mapRun);
  }

  createAttempt(runId: string, input: CreateAttemptInput): BeastRunAttempt {
    return this.insertAttempt(runId, input);
  }

  restartAttempt(runId: string, input: CreateAttemptInput): BeastRunAttempt {
    return this.insertAttempt(runId, input);
  }

  listAttempts(runId: string): BeastRunAttempt[] {
    const rows = this.db.prepare(
      'SELECT * FROM beast_run_attempts WHERE run_id = ? ORDER BY attempt_number ASC',
    ).all(runId) as BeastAttemptRow[];
    return rows.map(mapAttempt);
  }

  getAttempt(attemptId: string): BeastRunAttempt | undefined {
    const row = this.db.prepare('SELECT * FROM beast_run_attempts WHERE id = ?').get(attemptId) as BeastAttemptRow | undefined;
    return row ? mapAttempt(row) : undefined;
  }

  updateRun(runId: string, patch: UpdateRunPatch): BeastRun {
    const current = this.getRunOrThrow(runId);
    const next: BeastRun = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
      ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      ...(patch.currentAttemptId !== undefined ? { currentAttemptId: patch.currentAttemptId } : {}),
      ...(patch.attemptCount !== undefined ? { attemptCount: patch.attemptCount } : {}),
      ...(patch.lastHeartbeatAt !== undefined ? { lastHeartbeatAt: patch.lastHeartbeatAt } : {}),
      ...(patch.stopReason !== undefined ? { stopReason: patch.stopReason } : {}),
      ...(patch.latestExitCode !== undefined ? { latestExitCode: patch.latestExitCode } : {}),
    };

    this.db.prepare(
      `UPDATE beast_runs
         SET status = ?,
             started_at = ?,
             finished_at = ?,
             current_attempt_id = ?,
             attempt_count = ?,
             last_heartbeat_at = ?,
             stop_reason = ?,
             latest_exit_code = ?
       WHERE id = ?`,
    ).run(
      next.status,
      next.startedAt ?? null,
      next.finishedAt ?? null,
      next.currentAttemptId ?? null,
      next.attemptCount,
      next.lastHeartbeatAt ?? null,
      next.stopReason ?? null,
      next.latestExitCode ?? null,
      runId,
    );

    return next;
  }

  updateAttempt(attemptId: string, patch: UpdateAttemptPatch): BeastRunAttempt {
    const current = this.getAttemptOrThrow(attemptId);
    const next: BeastRunAttempt = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.pid !== undefined ? { pid: patch.pid } : {}),
      ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
      ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      ...(patch.exitCode !== undefined ? { exitCode: patch.exitCode } : {}),
      ...(patch.stopReason !== undefined ? { stopReason: patch.stopReason } : {}),
      ...(patch.executorMetadata !== undefined ? { executorMetadata: patch.executorMetadata } : {}),
    };

    this.db.prepare(
      `UPDATE beast_run_attempts
         SET status = ?,
             pid = ?,
             started_at = ?,
             finished_at = ?,
             exit_code = ?,
             stop_reason = ?,
             executor_metadata = ?
       WHERE id = ?`,
    ).run(
      next.status,
      next.pid ?? null,
      next.startedAt ?? null,
      next.finishedAt ?? null,
      next.exitCode ?? null,
      next.stopReason ?? null,
      next.executorMetadata ? JSON.stringify(next.executorMetadata) : null,
      attemptId,
    );

    return next;
  }

  appendEvent(runId: string, input: AppendEventInput): BeastRunEvent {
    const sequence = nextEventSequence(this.db, runId);
    const event: BeastRunEvent = {
      id: prefixedId('event'),
      runId,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      sequence,
      type: input.type,
      payload: input.payload,
      createdAt: input.createdAt,
    };

    this.db.prepare(
      `INSERT INTO beast_run_events (
        id,
        run_id,
        attempt_id,
        sequence,
        type,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event.id,
      event.runId,
      event.attemptId ?? null,
      event.sequence,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
    );

    return event;
  }

  listEvents(runId: string): BeastRunEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM beast_run_events WHERE run_id = ? ORDER BY sequence ASC',
    ).all(runId) as BeastEventRow[];
    return rows.map(mapEvent);
  }

  createTrackedAgent(input: CreateTrackedAgentInput): TrackedAgent {
    const agent: TrackedAgent = {
      id: prefixedId('agent'),
      definitionId: input.definitionId,
      source: input.source,
      status: input.status,
      createdByUser: input.createdByUser,
      initAction: input.initAction,
      initConfig: input.initConfig,
      ...(input.chatSessionId ? { chatSessionId: input.chatSessionId } : {}),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };

    this.db.prepare(
      `INSERT INTO tracked_agents (
        id,
        definition_id,
        source,
        status,
        created_by_user,
        init_action,
        init_config,
        chat_session_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      agent.id,
      agent.definitionId,
      agent.source,
      agent.status,
      agent.createdByUser,
      JSON.stringify(agent.initAction),
      JSON.stringify(agent.initConfig),
      agent.chatSessionId ?? null,
      agent.createdAt,
      agent.updatedAt,
    );

    return agent;
  }

  getTrackedAgent(agentId: string): TrackedAgent | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_agents WHERE id = ?').get(agentId) as TrackedAgentRow | undefined;
    return row ? mapTrackedAgent(row) : undefined;
  }

  requireTrackedAgent(agentId: string): TrackedAgent {
    return this.getTrackedAgentOrThrow(agentId);
  }

  listTrackedAgents(): TrackedAgent[] {
    const rows = this.db.prepare(
      'SELECT * FROM tracked_agents ORDER BY created_at DESC, id DESC',
    ).all() as TrackedAgentRow[];
    return rows.map(mapTrackedAgent);
  }

  updateTrackedAgent(agentId: string, patch: UpdateTrackedAgentPatch): TrackedAgent {
    const current = this.getTrackedAgentOrThrow(agentId);
    const next: TrackedAgent = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.chatSessionId !== undefined ? { chatSessionId: patch.chatSessionId } : {}),
      ...(patch.dispatchRunId !== undefined ? { dispatchRunId: patch.dispatchRunId } : {}),
      ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
    };

    this.db.prepare(
      `UPDATE tracked_agents
         SET status = ?,
             chat_session_id = ?,
             dispatch_run_id = ?,
             updated_at = ?
       WHERE id = ?`,
    ).run(
      next.status,
      next.chatSessionId ?? null,
      next.dispatchRunId ?? null,
      next.updatedAt,
      agentId,
    );

    return next;
  }

  appendTrackedAgentEvent(agentId: string, input: AppendTrackedAgentEventInput): TrackedAgentEvent {
    this.getTrackedAgentOrThrow(agentId);
    const event: TrackedAgentEvent = {
      id: prefixedId('agent_event'),
      agentId,
      sequence: nextTrackedAgentEventSequence(this.db, agentId),
      level: input.level,
      type: input.type,
      message: input.message,
      payload: input.payload,
      createdAt: input.createdAt,
    };

    this.db.prepare(
      `INSERT INTO tracked_agent_events (
        id,
        agent_id,
        sequence,
        level,
        type,
        message,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event.id,
      event.agentId,
      event.sequence,
      event.level,
      event.type,
      event.message,
      JSON.stringify(event.payload),
      event.createdAt,
    );

    return event;
  }

  listTrackedAgentEvents(agentId: string): TrackedAgentEvent[] {
    this.getTrackedAgentOrThrow(agentId);
    const rows = this.db.prepare(
      'SELECT * FROM tracked_agent_events WHERE agent_id = ? ORDER BY sequence ASC',
    ).all(agentId) as TrackedAgentEventRow[];
    return rows.map(mapTrackedAgentEvent);
  }

  createInterviewSession(input: Omit<BeastInterviewSession, 'id'>): BeastInterviewSession {
    const session: BeastInterviewSession = {
      id: prefixedId('interview'),
      ...input,
    };

    this.db.prepare(
      `INSERT INTO beast_interview_sessions (
        id,
        definition_id,
        status,
        answers,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      session.definitionId,
      session.status,
      JSON.stringify(session.answers),
      session.createdAt,
      session.updatedAt,
    );

    return session;
  }

  getInterviewSession(sessionId: string): BeastInterviewSession | undefined {
    const row = this.db.prepare(
      'SELECT * FROM beast_interview_sessions WHERE id = ?',
    ).get(sessionId) as BeastInterviewSessionRow | undefined;
    return row ? mapInterviewSession(row) : undefined;
  }

  updateInterviewSession(
    sessionId: string,
    patch: Partial<Pick<BeastInterviewSession, 'status' | 'answers' | 'updatedAt'>>,
  ): BeastInterviewSession {
    const current = this.getInterviewSession(sessionId);
    if (!current) {
      throw new Error(`Unknown Beast interview session: ${sessionId}`);
    }

    const next: BeastInterviewSession = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.answers !== undefined ? { answers: patch.answers } : {}),
      ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
    };

    this.db.prepare(
      `UPDATE beast_interview_sessions
         SET status = ?,
             answers = ?,
             updated_at = ?
       WHERE id = ?`,
    ).run(
      next.status,
      JSON.stringify(next.answers),
      next.updatedAt,
      sessionId,
    );

    return next;
  }

  close(): void {
    this.db.close();
  }

  private migrateLegacySchema(): void {
    this.ensureColumnExists('beast_runs', 'tracked_agent_id', 'ALTER TABLE beast_runs ADD COLUMN tracked_agent_id TEXT');
  }

  private ensureColumnExists(table: string, column: string, alterStatement: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.prepare(alterStatement).run();
    }
  }

  private insertAttempt(runId: string, input: CreateAttemptInput): BeastRunAttempt {
    const run = this.getRunOrThrow(runId);
    const attempt: BeastRunAttempt = {
      id: prefixedId('attempt'),
      runId,
      attemptNumber: run.attemptCount + 1,
      status: input.status,
      ...(input.pid !== undefined ? { pid: input.pid } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.executorMetadata !== undefined ? { executorMetadata: input.executorMetadata } : {}),
    };

    this.db.prepare(
      `INSERT INTO beast_run_attempts (
        id,
        run_id,
        attempt_number,
        status,
        pid,
        started_at,
        executor_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      attempt.id,
      attempt.runId,
      attempt.attemptNumber,
      attempt.status,
      attempt.pid ?? null,
      attempt.startedAt ?? null,
      attempt.executorMetadata ? JSON.stringify(attempt.executorMetadata) : null,
    );

    this.updateRun(runId, {
      currentAttemptId: attempt.id,
      attemptCount: attempt.attemptNumber,
      status: attempt.status,
      ...(attempt.startedAt !== undefined ? { startedAt: attempt.startedAt } : {}),
    });

    return attempt;
  }

  private getRunOrThrow(runId: string): BeastRun {
    const run = this.getRun(runId);
    if (!run) {
      throw new Error(`Unknown Beast run: ${runId}`);
    }
    return run;
  }

  private getAttemptOrThrow(attemptId: string): BeastRunAttempt {
    const attempt = this.getAttempt(attemptId);
    if (!attempt) {
      throw new Error(`Unknown Beast attempt: ${attemptId}`);
    }
    return attempt;
  }

  private getTrackedAgentOrThrow(agentId: string): TrackedAgent {
    const agent = this.getTrackedAgent(agentId);
    if (!agent) {
      throw new UnknownTrackedAgentError(agentId);
    }
    return agent;
  }
}

function nextEventSequence(db: Database.Database, runId: string): number {
  const row = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) AS current_sequence FROM beast_run_events WHERE run_id = ?',
  ).get(runId) as { current_sequence: number };
  return row.current_sequence + 1;
}

function nextTrackedAgentEventSequence(db: Database.Database, agentId: string): number {
  const row = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) AS current_sequence FROM tracked_agent_events WHERE agent_id = ?',
  ).get(agentId) as { current_sequence: number };
  return row.current_sequence + 1;
}

function mapRun(row: BeastRunRow): BeastRun {
  return {
    id: row.id,
    ...(row.tracked_agent_id ? { trackedAgentId: row.tracked_agent_id } : {}),
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    status: row.status,
    executionMode: row.execution_mode,
    configSnapshot: JSON.parse(row.config_snapshot) as Readonly<Record<string, unknown>>,
    dispatchedBy: row.dispatched_by,
    dispatchedByUser: row.dispatched_by_user,
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.current_attempt_id ? { currentAttemptId: row.current_attempt_id } : {}),
    attemptCount: row.attempt_count,
    ...(row.last_heartbeat_at ? { lastHeartbeatAt: row.last_heartbeat_at } : {}),
    ...(row.stop_reason ? { stopReason: row.stop_reason } : {}),
    ...(row.latest_exit_code !== null ? { latestExitCode: row.latest_exit_code } : {}),
  };
}

function mapAttempt(row: BeastAttemptRow): BeastRunAttempt {
  return {
    id: row.id,
    runId: row.run_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    ...(row.pid !== null ? { pid: row.pid } : {}),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.exit_code !== null ? { exitCode: row.exit_code } : {}),
    ...(row.stop_reason ? { stopReason: row.stop_reason } : {}),
    ...(row.executor_metadata
      ? { executorMetadata: JSON.parse(row.executor_metadata) as Readonly<Record<string, unknown>> }
      : {}),
  };
}

function mapEvent(row: BeastEventRow): BeastRunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
    sequence: row.sequence,
    type: row.type,
    payload: JSON.parse(row.payload) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
  };
}

function mapInterviewSession(row: BeastInterviewSessionRow): BeastInterviewSession {
  return {
    id: row.id,
    definitionId: row.definition_id,
    status: row.status,
    answers: JSON.parse(row.answers) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackedAgent(row: TrackedAgentRow): TrackedAgent {
  return {
    id: row.id,
    definitionId: row.definition_id,
    source: row.source,
    status: row.status,
    createdByUser: row.created_by_user,
    initAction: JSON.parse(row.init_action) as TrackedAgentInitAction,
    initConfig: JSON.parse(row.init_config) as Readonly<Record<string, unknown>>,
    ...(row.chat_session_id ? { chatSessionId: row.chat_session_id } : {}),
    ...(row.dispatch_run_id ? { dispatchRunId: row.dispatch_run_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackedAgentEvent(row: TrackedAgentEventRow): TrackedAgentEvent {
  return {
    id: row.id,
    agentId: row.agent_id,
    sequence: row.sequence,
    level: row.level,
    type: row.type,
    message: row.message,
    payload: JSON.parse(row.payload) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
  };
}
