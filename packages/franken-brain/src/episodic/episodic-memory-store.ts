import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { EpisodicTraceSchema } from '../types/index.js';
import type { EpisodicTrace } from '../types/index.js';
import type { IEpisodicStore } from './episodic-store-interface.js';

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

const SQL_INSERT = `
  INSERT INTO episodic_traces (id, project_id, task_id, status, payload, created_at)
  VALUES (@id, @projectId, @taskId, @status, @payload, @createdAt)
`;

const SQL_QUERY_BY_TASK = `
  SELECT * FROM episodic_traces
  WHERE task_id = ?
  ORDER BY created_at DESC
`;

const SQL_QUERY_BY_TASK_AND_PROJECT = `
  SELECT * FROM episodic_traces
  WHERE task_id = ? AND project_id = ?
  ORDER BY created_at DESC
`;

const SQL_QUERY_FAILED = `
  SELECT * FROM episodic_traces
  WHERE project_id = ? AND status = 'failure'
  ORDER BY created_at DESC
`;

const SQL_MARK_COMPRESSED = `
  UPDATE episodic_traces SET status = 'compressed' WHERE id = ?
`;

const SQL_COUNT = `
  SELECT COUNT(*) as cnt FROM episodic_traces
  WHERE project_id = ? AND task_id = ?
`;

// ---------------------------------------------------------------------------
// Row shape returned by SQLite
// ---------------------------------------------------------------------------

interface TraceRow {
  id: string;
  project_id: string;
  task_id: string;
  status: string;
  payload: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class EpisodicMemoryStore implements IEpisodicStore {
  constructor(private readonly db: BetterSqlite3Database) {
    this.runMigrations();
  }

  record(trace: EpisodicTrace): string {
    // Validate before touching the DB
    EpisodicTraceSchema.parse(trace);

    const { id, projectId, taskId, status, createdAt, ...rest } = trace;
    this.db.prepare(SQL_INSERT).run({
      id,
      projectId,
      taskId,
      status,
      payload: JSON.stringify(rest),
      createdAt,
    });

    return id;
  }

  query(taskId: string, projectId?: string): EpisodicTrace[] {
    let rows: TraceRow[];
    if (projectId !== undefined) {
      rows = this.db.prepare<[string, string], TraceRow>(SQL_QUERY_BY_TASK_AND_PROJECT)
        .all(taskId, projectId);
    } else {
      rows = this.db.prepare<[string], TraceRow>(SQL_QUERY_BY_TASK).all(taskId);
    }
    return rows.map(rowToTrace);
  }

  queryFailed(projectId: string): EpisodicTrace[] {
    const rows = this.db.prepare<[string], TraceRow>(SQL_QUERY_FAILED).all(projectId);
    return rows.map(rowToTrace);
  }

  markCompressed(ids: string[]): void {
    const stmt = this.db.prepare<[string]>(SQL_MARK_COMPRESSED);
    for (const id of ids) {
      stmt.run(id);
    }
  }

  count(projectId: string, taskId: string): number {
    // COUNT(*) always returns a row in SQLite — non-null assertion is safe
    const row = this.db.prepare<[string, string], { cnt: number }>(SQL_COUNT)
      .get(projectId, taskId)!;
    return row.cnt;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private runMigrations(): void {
    const migrationsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      'migrations',
    );
    const sql = readFileSync(join(migrationsDir, '001_create_episodic_traces.sql'), 'utf8');
    this.db.exec(sql);
  }
}

// ---------------------------------------------------------------------------
// Row → domain type
// ---------------------------------------------------------------------------

function rowToTrace(row: TraceRow): EpisodicTrace {
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  return {
    id: row.id,
    type: 'episodic',
    projectId: row.project_id,
    taskId: row.task_id,
    status: row.status as EpisodicTrace['status'],
    createdAt: row.created_at,
    ...payload,
  } as EpisodicTrace;
}
