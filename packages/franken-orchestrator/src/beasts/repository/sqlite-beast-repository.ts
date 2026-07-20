import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  BeastDispatchSource,
  BeastExecutionMode,
  BeastInterviewSession,
  BeastRun,
  BeastRunAttempt,
  BeastRunEvent,
  BeastRunStatus,
  ModuleConfig,
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
  configSnapshot?: Readonly<Record<string, unknown>> | undefined;
  startedAt?: string | null | undefined;
  finishedAt?: string | null | undefined;
  currentAttemptId?: string | null | undefined;
  attemptCount?: number | undefined;
  lastHeartbeatAt?: string | undefined;
  heartbeatSource?: string | undefined;
  stopReason?: string | null | undefined;
  latestExitCode?: number | null | undefined;
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
  executionMode?: BeastExecutionMode | undefined;
  moduleConfig?: ModuleConfig | undefined;
  createdAt: string;
  updatedAt: string;
}

interface UpdateTrackedAgentPatch {
  status?: TrackedAgentStatus | undefined;
  initConfig?: Readonly<Record<string, unknown>> | undefined;
  chatSessionId?: string | undefined;
  dispatchRunId?: string | undefined;
  executionMode?: BeastExecutionMode | undefined;
  moduleConfig?: ModuleConfig | undefined;
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
  last_heartbeat_sequence: number;
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
  execution_mode: BeastExecutionMode | null;
  module_config: string | null;
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

export interface BeastRepositoryJsonCorruptionContext {
  readonly table: string;
  readonly column: string;
  readonly rowId: string;
  readonly valueSnippet: string;
}

export class BeastRepositoryJsonCorruptionError extends Error {
  constructor(public readonly context: BeastRepositoryJsonCorruptionContext) {
    super(`Corrupt Beast JSON in ${context.table}.${context.column} for row ${context.rowId}`);
    this.name = 'BeastRepositoryJsonCorruptionError';
  }
}

export interface CorruptJsonRecoveryOptions {
  readonly recoverCorruptJson?: boolean;
}

export interface ListBeastRunEventsOptions extends CorruptJsonRecoveryOptions {
  readonly afterSequence?: number;
  readonly limit?: number;
}

export interface BeastRunProcessReference {
  readonly id: string;
  readonly trackedAgentId?: string | undefined;
  readonly status: BeastRunStatus;
  readonly currentAttemptId?: string | undefined;
}

export class SQLiteBeastRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');

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

  listRuns(options: CorruptJsonRecoveryOptions = {}): BeastRun[] {
    const rows = this.db.prepare('SELECT * FROM beast_runs ORDER BY created_at DESC, id DESC').all() as BeastRunRow[];
    return mapRowsRecoveringCorruptJson(rows, mapRun, options);
  }

  listRunProcessReferences(): BeastRunProcessReference[] {
    const rows = this.db.prepare(
      'SELECT id, tracked_agent_id, status, current_attempt_id FROM beast_runs ORDER BY created_at DESC, id DESC',
    ).all() as Array<Pick<BeastRunRow, 'id' | 'tracked_agent_id' | 'status' | 'current_attempt_id'>>;
    return rows.map((row) => ({
      id: row.id,
      ...(row.tracked_agent_id ? { trackedAgentId: row.tracked_agent_id } : {}),
      status: row.status,
      ...(row.current_attempt_id ? { currentAttemptId: row.current_attempt_id } : {}),
    }));
  }

  createAttempt(runId: string, input: CreateAttemptInput): BeastRunAttempt {
    return this.transaction(() => this.insertAttempt(runId, input));
  }

  restartAttempt(runId: string, input: CreateAttemptInput): BeastRunAttempt {
    return this.transaction(() => this.insertAttempt(runId, input));
  }

  listAttempts(runId: string, options: CorruptJsonRecoveryOptions = {}): BeastRunAttempt[] {
    const rows = this.db.prepare(
      'SELECT * FROM beast_run_attempts WHERE run_id = ? ORDER BY attempt_number ASC',
    ).all(runId) as BeastAttemptRow[];
    return mapRowsRecoveringCorruptJson(rows, mapAttempt, options);
  }

  getAttempt(attemptId: string): BeastRunAttempt | undefined {
    const row = this.db.prepare('SELECT * FROM beast_run_attempts WHERE id = ?').get(attemptId) as BeastAttemptRow | undefined;
    return row ? mapAttempt(row) : undefined;
  }

  updateRun(runId: string, patch: UpdateRunPatch): BeastRun {
    const current = this.getRunOrThrow(runId);
    const heartbeatUpdated = patch.lastHeartbeatAt !== undefined;
    const nextHeartbeatSequence = heartbeatUpdated ? (current.lastHeartbeatSequence ?? 0) + 1 : current.lastHeartbeatSequence;
    const priorHeartbeatAt = current.lastHeartbeatAt;
    const next: BeastRun = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.configSnapshot !== undefined ? { configSnapshot: patch.configSnapshot } : {}),
      ...(patch.startedAt !== undefined
        ? patch.startedAt === null
          ? { startedAt: undefined }
          : { startedAt: patch.startedAt }
        : {}),
      ...(patch.finishedAt !== undefined
        ? patch.finishedAt === null
          ? { finishedAt: undefined }
          : { finishedAt: patch.finishedAt }
        : {}),
      ...(patch.currentAttemptId !== undefined
        ? patch.currentAttemptId === null
          ? { currentAttemptId: undefined }
          : { currentAttemptId: patch.currentAttemptId }
        : {}),
      ...(patch.attemptCount !== undefined ? { attemptCount: patch.attemptCount } : {}),
      ...(heartbeatUpdated ? { lastHeartbeatAt: patch.lastHeartbeatAt, lastHeartbeatSequence: nextHeartbeatSequence } : {}),
      ...(patch.stopReason !== undefined
        ? patch.stopReason === null
          ? { stopReason: undefined }
          : { stopReason: patch.stopReason }
        : {}),
      ...(patch.latestExitCode !== undefined
        ? patch.latestExitCode === null
          ? { latestExitCode: undefined }
          : { latestExitCode: patch.latestExitCode }
        : {}),
    };

    this.db.prepare(
      `UPDATE beast_runs
         SET status = ?,
             config_snapshot = ?,
             started_at = ?,
             finished_at = ?,
             current_attempt_id = ?,
             attempt_count = ?,
             last_heartbeat_at = ?,
             last_heartbeat_sequence = ?,
             stop_reason = ?,
             latest_exit_code = ?
       WHERE id = ?`,
    ).run(
      next.status,
      JSON.stringify(next.configSnapshot),
      next.startedAt ?? null,
      next.finishedAt ?? null,
      next.currentAttemptId ?? null,
      next.attemptCount,
      next.lastHeartbeatAt ?? null,
      next.lastHeartbeatSequence ?? 0,
      next.stopReason ?? null,
      next.latestExitCode ?? null,
      runId,
    );

    if (patch.lastHeartbeatAt !== undefined && priorHeartbeatAt !== undefined) {
      const newHeartbeatAt = patch.lastHeartbeatAt;
      const priorMs = Date.parse(priorHeartbeatAt);
      const nextMs = Date.parse(newHeartbeatAt);
      if (Number.isFinite(priorMs) && Number.isFinite(nextMs) && nextMs <= priorMs) {
        this.insertEvent(runId, {
          type: 'run.heartbeat.anomaly',
          payload: {
            code: nextMs < priorMs ? 'regressive-heartbeat' : 'duplicate-heartbeat',
            workerId: runId,
            source: patch.heartbeatSource ?? 'unknown-source',
            priorSequence: current.lastHeartbeatSequence ?? 0,
            newSequence: next.lastHeartbeatSequence ?? 0,
            priorHeartbeatAt,
            newHeartbeatAt: patch.lastHeartbeatAt,
          },
          createdAt: patch.lastHeartbeatAt,
        });
      }
    }

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
    return this.insertEvent(runId, input);
  }

  private insertEvent(runId: string, input: AppendEventInput): BeastRunEvent {
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

  listEvents(runId: string, options: ListBeastRunEventsOptions = {}): BeastRunEvent[] {
    if (options.afterSequence !== undefined
      && (!Number.isSafeInteger(options.afterSequence) || options.afterSequence < 0)) {
      throw new RangeError('afterSequence must be a non-negative safe integer');
    }
    if (options.limit !== undefined
      && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
      throw new RangeError('limit must be a positive safe integer');
    }
    if (options.limit !== undefined && options.recoverCorruptJson) {
      const events: BeastRunEvent[] = [];
      let cursor = options.afterSequence ?? 0;
      while (events.length < options.limit) {
        const batchLimit = options.limit - events.length;
        const rows = this.db.prepare(
          'SELECT * FROM beast_run_events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?',
        ).all(runId, cursor, batchLimit) as BeastEventRow[];
        if (rows.length === 0) break;
        events.push(...mapRowsRecoveringCorruptJson(rows, mapEvent, options));
        cursor = rows[rows.length - 1]!.sequence;
        if (rows.length < batchLimit) break;
      }
      return events;
    }

    const clauses = ['run_id = ?'];
    const parameters: Array<string | number> = [runId];
    if (options.afterSequence !== undefined) {
      clauses.push('sequence > ?');
      parameters.push(options.afterSequence);
    }
    let sql = `SELECT * FROM beast_run_events WHERE ${clauses.join(' AND ')} ORDER BY sequence ASC`;
    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      parameters.push(options.limit);
    }
    const rows = this.db.prepare(sql).all(...parameters) as BeastEventRow[];
    return mapRowsRecoveringCorruptJson(rows, mapEvent, options);
  }

  createTrackedAgent(input: CreateTrackedAgentInput): TrackedAgent {
    const agent: TrackedAgent = {
      id: prefixedId('agent'),
      ...trackedAgentIdentityPatch(input.initConfig),
      definitionId: input.definitionId,
      source: input.source,
      status: input.status,
      createdByUser: input.createdByUser,
      initAction: input.initAction,
      initConfig: input.initConfig,
      ...(input.chatSessionId ? { chatSessionId: input.chatSessionId } : {}),
      ...(input.executionMode ? { executionMode: input.executionMode } : {}),
      ...(input.moduleConfig ? { moduleConfig: input.moduleConfig } : {}),
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
        execution_mode,
        module_config,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      agent.id,
      agent.definitionId,
      agent.source,
      agent.status,
      agent.createdByUser,
      JSON.stringify(agent.initAction),
      JSON.stringify(agent.initConfig),
      agent.chatSessionId ?? null,
      agent.executionMode ?? null,
      agent.moduleConfig ? JSON.stringify(agent.moduleConfig) : null,
      agent.createdAt,
      agent.updatedAt,
    );

    return agent;
  }

  getTrackedAgent(agentId: string, options: CorruptJsonRecoveryOptions = {}): TrackedAgent | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_agents WHERE id = ?').get(agentId) as TrackedAgentRow | undefined;
    return row ? mapRowsRecoveringCorruptJson([row], mapTrackedAgent, options)[0] : undefined;
  }

  requireTrackedAgent(agentId: string): TrackedAgent {
    const agent = this.getTrackedAgentOrThrow(agentId);
    if (agent.status === 'deleted') {
      throw new UnknownTrackedAgentError(agentId);
    }
    return agent;
  }

  listTrackedAgents(options: CorruptJsonRecoveryOptions = {}): TrackedAgent[] {
    const rows = this.db.prepare(
      'SELECT * FROM tracked_agents ORDER BY created_at DESC, id DESC',
    ).all() as TrackedAgentRow[];
    return mapRowsRecoveringCorruptJson(rows, mapTrackedAgent, options);
  }

  updateTrackedAgent(agentId: string, patch: UpdateTrackedAgentPatch): TrackedAgent {
    const current = this.getTrackedAgentOrThrow(agentId);
    const next: TrackedAgent = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.initConfig !== undefined ? { initConfig: patch.initConfig } : {}),
      ...(patch.chatSessionId !== undefined ? { chatSessionId: patch.chatSessionId } : {}),
      ...(patch.dispatchRunId !== undefined ? { dispatchRunId: patch.dispatchRunId } : {}),
      ...(patch.executionMode !== undefined ? { executionMode: patch.executionMode } : {}),
      ...(patch.moduleConfig !== undefined ? { moduleConfig: patch.moduleConfig } : {}),
      ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
    };
    const nextWithIdentity: TrackedAgent = {
      ...next,
      ...trackedAgentIdentityPatch(next.initConfig),
    };

    this.db.prepare(
      `UPDATE tracked_agents
         SET status = ?,
             init_config = ?,
             chat_session_id = ?,
             dispatch_run_id = ?,
             execution_mode = ?,
             module_config = ?,
             updated_at = ?
       WHERE id = ?`,
    ).run(
      nextWithIdentity.status,
      JSON.stringify(nextWithIdentity.initConfig),
      nextWithIdentity.chatSessionId ?? null,
      nextWithIdentity.dispatchRunId ?? null,
      nextWithIdentity.executionMode ?? null,
      nextWithIdentity.moduleConfig ? JSON.stringify(nextWithIdentity.moduleConfig) : null,
      nextWithIdentity.updatedAt,
      agentId,
    );

    return nextWithIdentity;
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

  listTrackedAgentEvents(agentId: string, options: CorruptJsonRecoveryOptions = {}): TrackedAgentEvent[] {
    this.getTrackedAgentOrThrow(agentId);
    const rows = this.db.prepare(
      'SELECT * FROM tracked_agent_events WHERE agent_id = ? ORDER BY sequence ASC',
    ).all(agentId) as TrackedAgentEventRow[];
    return mapRowsRecoveringCorruptJson(rows, mapTrackedAgentEvent, options);
  }

  listActiveDispatchFailureAgentIds(): string[] {
    const rows = this.db.prepare(
      `SELECT event.agent_id
         FROM tracked_agent_events AS event
         JOIN tracked_agents AS agent ON agent.id = event.agent_id
        WHERE event.type = 'agent.dispatch.failed'
          AND agent.status NOT IN ('running', 'awaiting_approval', 'completed')
          AND event.sequence = (
            SELECT MAX(marker.sequence)
              FROM tracked_agent_events AS marker
             WHERE marker.agent_id = event.agent_id
               AND marker.type IN ('agent.dispatch.failed', 'agent.dispatch.recovered')
          )`,
    ).all() as Array<{ agent_id: string }>;
    return rows.map((row) => row.agent_id);
  }

  listDispatchFailureHistoryAgentIds(): string[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT agent_id
         FROM tracked_agent_events
        WHERE type = 'agent.dispatch.failed'`,
    ).all() as Array<{ agent_id: string }>;
    return rows.map((row) => row.agent_id);
  }

  hasDispatchFailureHistory(agentId: string): boolean {
    const row = this.db.prepare(
      `SELECT 1
         FROM tracked_agent_events
        WHERE agent_id = ?
          AND type = 'agent.dispatch.failed'
        LIMIT 1`,
    ).get(agentId);
    return row !== undefined;
  }

  hasActiveDispatchFailure(agentId: string): boolean {
    const agent = this.getTrackedAgent(agentId);
    if (agent && (agent.status === 'running' || agent.status === 'awaiting_approval' || agent.status === 'completed')) {
      return false;
    }
    return this.hasUnrecoveredDispatchFailure(agentId);
  }

  hasUnrecoveredDispatchFailure(agentId: string): boolean {
    const row = this.db.prepare(
      `SELECT 1
         FROM tracked_agent_events AS event
        WHERE event.agent_id = ?
          AND event.type = 'agent.dispatch.failed'
          AND event.sequence = (
            SELECT MAX(marker.sequence)
              FROM tracked_agent_events AS marker
             WHERE marker.agent_id = event.agent_id
               AND marker.type IN ('agent.dispatch.failed', 'agent.dispatch.recovered')
          )
        LIMIT 1`,
    ).get(agentId);
    return row !== undefined;
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
    this.ensureColumnExists('beast_runs', 'last_heartbeat_sequence', 'ALTER TABLE beast_runs ADD COLUMN last_heartbeat_sequence INTEGER NOT NULL DEFAULT 0');
    this.ensureColumnExists('tracked_agents', 'module_config', 'ALTER TABLE tracked_agents ADD COLUMN module_config TEXT');
    this.ensureColumnExists('tracked_agents', 'execution_mode', 'ALTER TABLE tracked_agents ADD COLUMN execution_mode TEXT');
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
    configSnapshot: parseJsonColumn(row.config_snapshot, {
      table: 'beast_runs',
      column: 'config_snapshot',
      rowId: row.id,
    }) as Readonly<Record<string, unknown>>,
    dispatchedBy: row.dispatched_by,
    dispatchedByUser: row.dispatched_by_user,
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.current_attempt_id ? { currentAttemptId: row.current_attempt_id } : {}),
    attemptCount: row.attempt_count,
    ...(row.last_heartbeat_at ? { lastHeartbeatAt: row.last_heartbeat_at } : {}),
    ...(row.last_heartbeat_sequence > 0 ? { lastHeartbeatSequence: row.last_heartbeat_sequence } : {}),
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
      ? {
          executorMetadata: parseJsonColumn(row.executor_metadata, {
            table: 'beast_run_attempts',
            column: 'executor_metadata',
            rowId: row.id,
          }) as Readonly<Record<string, unknown>>,
        }
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
    payload: parseJsonColumn(row.payload, {
      table: 'beast_run_events',
      column: 'payload',
      rowId: row.id,
    }) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
  };
}

function mapInterviewSession(row: BeastInterviewSessionRow): BeastInterviewSession {
  return {
    id: row.id,
    definitionId: row.definition_id,
    status: row.status,
    answers: parseJsonColumn(row.answers, {
      table: 'beast_interview_sessions',
      column: 'answers',
      rowId: row.id,
    }) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackedAgent(row: TrackedAgentRow): TrackedAgent {
  const initConfig = parseJsonColumn(row.init_config, {
    table: 'tracked_agents',
    column: 'init_config',
    rowId: row.id,
  }) as Readonly<Record<string, unknown>>;
  return {
    id: row.id,
    ...trackedAgentIdentityPatch(initConfig),
    definitionId: row.definition_id,
    source: row.source,
    status: row.status,
    createdByUser: row.created_by_user,
    initAction: parseJsonColumn(row.init_action, {
      table: 'tracked_agents',
      column: 'init_action',
      rowId: row.id,
    }) as TrackedAgentInitAction,
    initConfig,
    ...(row.chat_session_id ? { chatSessionId: row.chat_session_id } : {}),
    ...(row.dispatch_run_id ? { dispatchRunId: row.dispatch_run_id } : {}),
    ...(row.execution_mode ? { executionMode: row.execution_mode } : {}),
    ...(row.module_config
      ? {
          moduleConfig: parseJsonColumn(row.module_config, {
            table: 'tracked_agents',
            column: 'module_config',
            rowId: row.id,
          }) as ModuleConfig,
        }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trackedAgentIdentityPatch(initConfig: Readonly<Record<string, unknown>>): Pick<TrackedAgent, 'name'> {
  const identity = isRecord(initConfig.identity) ? initConfig.identity : undefined;
  const name = typeof identity?.name === 'string' ? identity.name : undefined;
  return { name };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonColumn(
  value: string,
  context: Omit<BeastRepositoryJsonCorruptionContext, 'valueSnippet'>,
): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BeastRepositoryJsonCorruptionError({
      ...context,
      valueSnippet: '[redacted]',
    });
  }
}

function mapRowsRecoveringCorruptJson<Row, Value>(
  rows: readonly Row[],
  mapper: (row: Row) => Value,
  options: CorruptJsonRecoveryOptions,
): Value[] {
  if (!options.recoverCorruptJson) {
    return rows.map(mapper);
  }

  const values: Value[] = [];
  for (const row of rows) {
    try {
      values.push(mapper(row));
    } catch (error) {
      if (!(error instanceof BeastRepositoryJsonCorruptionError)) {
        throw error;
      }
      console.warn(
        `Skipping corrupt Beast JSON in ${error.context.table}.${error.context.column} for row ${error.context.rowId}; persisted row was left unchanged for repair.`,
      );
    }
  }
  return values;
}

function mapTrackedAgentEvent(row: TrackedAgentEventRow): TrackedAgentEvent {
  return {
    id: row.id,
    agentId: row.agent_id,
    sequence: row.sequence,
    level: row.level,
    type: row.type,
    message: row.message,
    payload: parseJsonColumn(row.payload, {
      table: 'tracked_agent_events',
      column: 'payload',
      rowId: row.id,
    }) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
  };
}
