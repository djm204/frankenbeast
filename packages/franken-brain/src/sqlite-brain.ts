import Database from 'better-sqlite3';
import type {
  IBrain,
  IWorkingMemory,
  IEpisodicMemory,
  IRecoveryMemory,
  BrainSnapshot,
  EpisodicEvent,
  ExecutionState,
  EpisodicEventType,
} from '@franken/types';

// --- Working Memory ---

class SqliteWorkingMemory implements IWorkingMemory {
  private store = new Map<string, unknown>();

  constructor(private db: Database.Database) {}

  /** Flush in-memory Map to SQLite working_memory table (called on checkpoint). */
  flushToDb(): void {
    const upsert = this.db.prepare(
      `INSERT OR REPLACE INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM working_memory`).run();
      for (const [key, value] of this.store) {
        upsert.run(key, JSON.stringify(value), now);
      }
    });
    tx();
  }

  get(key: string): unknown {
    return this.store.get(key);
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }

  restore(snap: Record<string, unknown>): void {
    this.store.clear();
    for (const [key, value] of Object.entries(snap)) {
      this.store.set(key, value);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

// --- Episodic Memory ---

interface EpisodicRow {
  id: number;
  type: string;
  step: string | null;
  summary: string;
  details: string | null;
  created_at: string;
}

class SqliteEpisodicMemory implements IEpisodicMemory {
  constructor(private db: Database.Database) {}

  record(event: EpisodicEvent): void {
    this.db
      .prepare(
        `INSERT INTO episodic_events (type, step, summary, details, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        event.type,
        event.step ?? null,
        event.summary,
        event.details ? JSON.stringify(event.details) : null,
        event.createdAt,
      );
  }

  recall(query: string, limit = 10): EpisodicEvent[] {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !STOPWORDS.has(w));

    if (keywords.length === 0) {
      return this.recent(limit);
    }

    // Build scoring SQL: count keyword matches across summary + details
    const scoringCases = keywords.map(() =>
      `(CASE WHEN LOWER(summary) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END + CASE WHEN LOWER(COALESCE(details, '')) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)`,
    ).join(' + ');

    const whereClauses = keywords.map(() =>
      `(LOWER(summary) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(details, '')) LIKE ? ESCAPE '\\')`,
    ).join(' OR ');

    const sql = `
      SELECT *, (${scoringCases}) AS relevance_score
      FROM episodic_events
      WHERE ${whereClauses}
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT ?
    `;

    const likeParams = keywords.flatMap(k => {
      const escaped = `%${escapeLike(k)}%`;
      return [escaped, escaped];
    });
    const allParams = [...likeParams, ...likeParams, limit];

    const rows = this.db.prepare(sql).all(...allParams) as (EpisodicRow & { relevance_score: number })[];
    return rows.map(rowToEvent);
  }

  recentFailures(n = 10): EpisodicEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM episodic_events WHERE type = 'failure'
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(n) as EpisodicRow[];
    return rows.map(rowToEvent);
  }

  recent(n = 10): EpisodicEvent[] {
    const rows = this.db
      .prepare(`SELECT * FROM episodic_events ORDER BY created_at DESC LIMIT ?`)
      .all(n) as EpisodicRow[];
    return rows.map(rowToEvent);
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM episodic_events`)
      .get() as { cnt: number };
    return row.cnt;
  }
}

// --- Recovery Memory ---

interface CheckpointRow {
  id: number;
  state: string;
  created_at: string;
}

class SqliteRecoveryMemory implements IRecoveryMemory {
  constructor(private db: Database.Database) {}

  checkpoint(state: ExecutionState): { id: string } {
    const result = this.db
      .prepare(`INSERT INTO checkpoints (state, created_at) VALUES (?, ?)`)
      .run(JSON.stringify(state), state.timestamp);
    return { id: String(result.lastInsertRowid) };
  }

  lastCheckpoint(): ExecutionState | null {
    const row = this.db
      .prepare(`SELECT * FROM checkpoints ORDER BY id DESC LIMIT 1`)
      .get() as CheckpointRow | undefined;
    if (!row) return null;
    return JSON.parse(row.state) as ExecutionState;
  }

  listCheckpoints(): Array<{ id: string; timestamp: string }> {
    const rows = this.db
      .prepare(`SELECT id, created_at FROM checkpoints ORDER BY id ASC`)
      .all() as Array<{ id: number; created_at: string }>;
    return rows.map(r => ({ id: String(r.id), timestamp: r.created_at }));
  }

  clearCheckpoints(): void {
    this.db.prepare(`DELETE FROM checkpoints`).run();
  }
}

// --- SqliteBrain ---

export class SqliteBrain implements IBrain {
  readonly working: SqliteWorkingMemory;
  readonly episodic: SqliteEpisodicMemory;
  readonly recovery: SqliteRecoveryMemory;

  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.working = new SqliteWorkingMemory(this.db);
    this.episodic = new SqliteEpisodicMemory(this.db);
    this.recovery = new SqliteRecoveryMemory(this.db);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS working_memory (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS episodic_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        step TEXT,
        summary TEXT NOT NULL,
        details TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  /** Flush working memory to SQLite before serialization or checkpoint. */
  flush(): void {
    this.working.flushToDb();
  }

  serialize(): BrainSnapshot {
    this.flush();
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      working: this.working.snapshot(),
      episodic: this.episodic.recent(100),
      checkpoint: this.recovery.lastCheckpoint(),
      metadata: {
        lastProvider: '',
        switchReason: '',
        totalTokensUsed: 0,
      },
    };
  }

  static hydrate(snapshot: BrainSnapshot, dbPath: string = ':memory:'): SqliteBrain {
    const brain = new SqliteBrain(dbPath);
    brain.working.restore(snapshot.working);
    for (const event of snapshot.episodic) {
      brain.episodic.record(event);
    }
    if (snapshot.checkpoint) {
      brain.recovery.checkpoint(snapshot.checkpoint);
    }
    return brain;
  }

  close(): void {
    this.db.close();
  }
}

// --- Constants ---

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'not', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'of', 'by', 'with', 'from', 'as',
  'into', 'about', 'between', 'through', 'after', 'before',
  'this', 'that', 'these', 'those', 'it', 'its',
]);

// --- Helpers ---

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

function rowToEvent(row: EpisodicRow): EpisodicEvent {
  const event: EpisodicEvent = {
    id: row.id,
    type: row.type as EpisodicEventType,
    summary: row.summary,
    createdAt: row.created_at,
  };
  if (row.step) event.step = row.step;
  if (row.details) event.details = JSON.parse(row.details) as Record<string, unknown>;
  return event;
}
