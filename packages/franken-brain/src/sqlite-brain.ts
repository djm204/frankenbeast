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

export interface WorkingMemoryLimits {
  /** Maximum number of keys held in working memory. */
  maxEntries: number;
  /** Maximum serialized size of a single value, in bytes. */
  maxValueBytes: number;
  /** Maximum total serialized size across all values, in bytes. */
  maxTotalBytes: number;
}

export const DEFAULT_WORKING_MEMORY_LIMITS: WorkingMemoryLimits = {
  maxEntries: 10_000,
  maxValueBytes: 5 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
};

export class WorkingMemoryLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkingMemoryLimitError';
  }
}

class SqliteWorkingMemory implements IWorkingMemory {
  private store = new Map<string, unknown>();
  private sizes = new Map<string, number>();
  private totalBytes = 0;

  constructor(
    private db: Database.Database,
    private limits: WorkingMemoryLimits = DEFAULT_WORKING_MEMORY_LIMITS,
  ) {}

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

  /**
   * Serializes and size-checks one entry without mutating state.
   * Returns the JSON round-tripped value so what we retain in memory is
   * exactly the accounted (and SQLite-persisted) form — a Map or class
   * instance cannot hide megabytes behind a tiny `{}` serialization.
   */
  private prepareEntry(key: string, value: unknown): { normalized: unknown; size: number } {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new WorkingMemoryLimitError(
        `Working memory value for "${key}" is not JSON-serializable and could not be persisted`,
      );
    }
    const valueBytes = Buffer.byteLength(serialized, 'utf8');
    if (valueBytes > this.limits.maxValueBytes) {
      throw new WorkingMemoryLimitError(
        `Working memory value for "${key}" is ${valueBytes} bytes, exceeding maxValueBytes (${this.limits.maxValueBytes})`,
      );
    }
    // Keys are retained by the Map and the SQLite table too — count them.
    const size = Buffer.byteLength(key, 'utf8') + valueBytes;
    return { normalized: JSON.parse(serialized) as unknown, size };
  }

  set(key: string, value: unknown): void {
    const { normalized, size } = this.prepareEntry(key, value);

    if (!this.store.has(key) && this.store.size >= this.limits.maxEntries) {
      throw new WorkingMemoryLimitError(
        `Working memory is full: ${this.store.size} entries, maxEntries is ${this.limits.maxEntries}`,
      );
    }
    const newTotal = this.totalBytes - (this.sizes.get(key) ?? 0) + size;
    if (!Number.isSafeInteger(newTotal) || newTotal > this.limits.maxTotalBytes) {
      throw new WorkingMemoryLimitError(
        `Working memory byte budget exceeded: ${newTotal} bytes, maxTotalBytes is ${this.limits.maxTotalBytes}`,
      );
    }

    this.store.set(key, normalized);
    this.sizes.set(key, size);
    this.totalBytes = newTotal;
  }

  delete(key: string): boolean {
    this.totalBytes -= this.sizes.get(key) ?? 0;
    this.sizes.delete(key);
    return this.store.delete(key);
  }

  /** Current occupancy, for callers that want to react before limits are hit. */
  usage(): { entries: number; totalBytes: number; limits: WorkingMemoryLimits } {
    return { entries: this.store.size, totalBytes: this.totalBytes, limits: { ...this.limits } };
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
    // Validate the whole snapshot before mutating so a limit failure
    // leaves the previous state intact instead of a half-restored one.
    const entries = Object.entries(snap);
    if (entries.length > this.limits.maxEntries) {
      throw new WorkingMemoryLimitError(
        `Snapshot has ${entries.length} entries, exceeding maxEntries (${this.limits.maxEntries})`,
      );
    }
    let total = 0;
    const prepared: Array<[string, unknown, number]> = [];
    for (const [key, value] of entries) {
      const { normalized, size } = this.prepareEntry(key, value);
      total += size;
      prepared.push([key, normalized, size]);
    }
    if (!Number.isSafeInteger(total) || total > this.limits.maxTotalBytes) {
      throw new WorkingMemoryLimitError(
        `Snapshot is ${total} bytes, exceeding maxTotalBytes (${this.limits.maxTotalBytes})`,
      );
    }

    this.clear();
    for (const [key, normalized, size] of prepared) {
      this.store.set(key, normalized);
      this.sizes.set(key, size);
    }
    this.totalBytes = total;
  }

  clear(): void {
    this.store.clear();
    this.sizes.clear();
    this.totalBytes = 0;
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
  constructor(
    private db: Database.Database,
    private flushWorkingMemory?: () => void,
  ) {}

  checkpoint(state: ExecutionState): { id: string } {
    this.flushWorkingMemory?.();
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

  constructor(dbPath: string = ':memory:', workingMemoryLimits?: Partial<WorkingMemoryLimits>) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
    this.working = new SqliteWorkingMemory(this.db, {
      ...DEFAULT_WORKING_MEMORY_LIMITS,
      ...workingMemoryLimits,
    });
    this.episodic = new SqliteEpisodicMemory(this.db);
    this.recovery = new SqliteRecoveryMemory(this.db, () => this.working.flushToDb());
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
