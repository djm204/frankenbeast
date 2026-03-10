import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type {
  BeastDispatchSource,
  BeastExecutionMode,
  BeastRun,
  BeastRunAttempt,
  BeastRunEvent,
  BeastRunStatus,
} from '../types.js';
import { BEAST_SQLITE_SCHEMA_STATEMENTS } from './sqlite-schema.js';

interface CreateRunInput {
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

type BeastRunRow = {
  id: string;
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
  }

  createRun(input: CreateRunInput): BeastRun {
    const run: BeastRun = {
      id: prefixedId('run'),
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
        definition_id,
        definition_version,
        status,
        execution_mode,
        config_snapshot,
        dispatched_by,
        dispatched_by_user,
        created_at,
        attempt_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      run.id,
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

  close(): void {
    this.db.close();
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
    const row = this.db.prepare('SELECT * FROM beast_run_attempts WHERE id = ?').get(attemptId) as BeastAttemptRow | undefined;
    if (!row) {
      throw new Error(`Unknown Beast attempt: ${attemptId}`);
    }
    return mapAttempt(row);
  }
}

function nextEventSequence(db: Database.Database, runId: string): number {
  const row = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) AS current_sequence FROM beast_run_events WHERE run_id = ?',
  ).get(runId) as { current_sequence: number };
  return row.current_sequence + 1;
}

function mapRun(row: BeastRunRow): BeastRun {
  return {
    id: row.id,
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
