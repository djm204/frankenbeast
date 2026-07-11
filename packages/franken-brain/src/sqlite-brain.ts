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
import { isoNow } from '@franken/types';

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

function cloneStoredWorkingMemoryValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function stringifyWorkingMemoryValue(key: string, value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch (error) {
    throw new WorkingMemoryLimitError(
      `Working memory value for "${key}" is not JSON-serializable and could not be persisted: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new WorkingMemoryLimitError(
    `Working memory value for "${key}" is not JSON-serializable and could not be persisted`,
  );
}

class SqliteWorkingMemory implements IWorkingMemory {
  private store = new Map<string, unknown>();
  private sizes = new Map<string, number>();
  private serialized = new Map<string, string>();
  private persistedSerialized = new Map<string, string>();
  private dirtyKeys = new Set<string>();
  private deletedKeys = new Set<string>();
  private totalBytes = 0;

  constructor(
    private db: Database.Database,
    private limits: WorkingMemoryLimits = DEFAULT_WORKING_MEMORY_LIMITS,
    hydrateFromDb = true,
  ) {
    this.loadPersistedSerializedFromDb();
    if (hydrateFromDb) {
      this.loadFromDb();
    }
  }

  private loadPersistedSerializedFromDb(): Array<{ key: string; value: string }> {
    const rows = this.db
      .prepare(`SELECT key, value FROM working_memory ORDER BY key ASC`)
      .all() as Array<{ key: string; value: string }>;
    this.persistedSerialized = new Map(rows.map(row => [row.key, row.value]));
    return rows;
  }

  /** Hydrate in-memory state from persisted SQLite working_memory rows. */
  private loadFromDb(): void {
    const rows = this.loadPersistedSerializedFromDb();
    if (rows.length > this.limits.maxEntries) {
      throw new WorkingMemoryLimitError(
        `Persisted working memory has ${rows.length} entries, exceeding maxEntries (${this.limits.maxEntries})`,
      );
    }

    const prepared: Array<[string, unknown, string, number]> = [];
    let total = 0;
    for (const row of rows) {
      const parsed = parseStoredWorkingMemoryValue(row.value);
      const { normalized, serialized, size } = this.prepareEntry(row.key, parsed);
      total += size;
      prepared.push([row.key, normalized, serialized, size]);
    }
    if (!Number.isSafeInteger(total) || total > this.limits.maxTotalBytes) {
      throw new WorkingMemoryLimitError(
        `Persisted working memory is ${total} bytes, exceeding maxTotalBytes (${this.limits.maxTotalBytes})`,
      );
    }

    this.store.clear();
    this.sizes.clear();
    this.serialized.clear();
    this.dirtyKeys.clear();
    this.deletedKeys.clear();
    this.totalBytes = 0;

    for (const [key, normalized, serialized, size] of prepared) {
      this.store.set(key, normalized);
      this.sizes.set(key, size);
      this.serialized.set(key, serialized);
      this.totalBytes += size;
    }
  }

  /** Flush in-memory changes to SQLite working_memory rows (called on checkpoint). */
  flushToDb(): (() => void) | void {
    const deleteKey = this.db.prepare(`DELETE FROM working_memory WHERE key = ?`);
    const upsert = this.db.prepare(
      `INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       WHERE working_memory.value IS NOT excluded.value`,
    );
    const now = isoNow();
    let flushedDirtyKeys = new Set<string>();
    let flushedDeletedKeys = new Set<string>();
    const applyFlush = (): boolean => {
      this.refreshPreparedStateForFlush();
      if (this.dirtyKeys.size === 0 && this.deletedKeys.size === 0) {
        return false;
      }

      for (const key of this.deletedKeys) {
        if (!this.dirtyKeys.has(key)) {
          deleteKey.run(key);
        }
      }
      for (const key of this.dirtyKeys) {
        const serialized = this.serialized.get(key);
        if (serialized !== undefined) {
          upsert.run(key, serialized, now);
        }
      }
      flushedDirtyKeys = new Set(this.dirtyKeys);
      flushedDeletedKeys = new Set(this.deletedKeys);
      return true;
    };
    const tx = this.db.transaction(applyFlush);
    const hasChanges = this.db.inTransaction ? applyFlush() : tx.immediate();
    if (!hasChanges) {
      return;
    }
    const finalizeFlush = (): void => {
      for (const key of flushedDeletedKeys) {
        this.persistedSerialized.delete(key);
      }
      for (const key of flushedDirtyKeys) {
        const serialized = this.serialized.get(key);
        if (serialized !== undefined) {
          this.persistedSerialized.set(key, serialized);
        }
      }
      this.deletedKeys.clear();
      this.dirtyKeys.clear();
    };

    if (!this.db.inTransaction) {
      finalizeFlush();
      return;
    }

    return finalizeFlush;
  }

  private refreshPreparedStateForFlush(): void {
    // Refresh the persisted view at flush time so this instance's in-memory
    // state remains authoritative even when another SqliteBrain wrote new rows
    // after this instance was constructed. Without this, clear()/restore() can
    // miss externally added keys because deletedKeys would be seeded from a
    // stale cache.
    this.loadPersistedSerializedFromDb();

    const prepared: Array<[string, unknown, string, number]> = [];
    let total = 0;
    for (const [key, value] of this.store) {
      const { normalized, serialized, size } = this.prepareEntry(key, value);
      total += size;
      prepared.push([key, normalized, serialized, size]);
    }
    if (!Number.isSafeInteger(total) || total > this.limits.maxTotalBytes) {
      throw new WorkingMemoryLimitError(
        `Working memory byte budget exceeded: ${total} bytes, maxTotalBytes is ${this.limits.maxTotalBytes}`,
      );
    }

    this.store.clear();
    this.sizes.clear();
    this.serialized.clear();
    this.dirtyKeys.clear();
    this.deletedKeys = new Set(this.persistedSerialized.keys());
    this.totalBytes = total;
    for (const [key, normalized, serialized, size] of prepared) {
      this.store.set(key, normalized);
      this.sizes.set(key, size);
      this.serialized.set(key, serialized);
      this.deletedKeys.delete(key);
      if (this.persistedSerialized.get(key) !== serialized) {
        this.dirtyKeys.add(key);
      }
    }
  }

  get(key: string): unknown {
    return cloneStoredWorkingMemoryValue(this.store.get(key));
  }

  /**
   * Serializes and size-checks one entry without mutating state.
   * Returns the JSON round-tripped value so what we retain in memory is
   * exactly the accounted (and SQLite-persisted) form — a Map or class
   * instance cannot hide megabytes behind a tiny `{}` serialization.
   */
  private prepareEntry(
    key: string,
    value: unknown,
  ): { normalized: unknown; serialized: string; size: number } {
    const serialized = stringifyWorkingMemoryValue(key, value);
    const valueBytes = Buffer.byteLength(serialized, 'utf8');
    if (valueBytes > this.limits.maxValueBytes) {
      throw new WorkingMemoryLimitError(
        `Working memory value for "${key}" is ${valueBytes} bytes, exceeding maxValueBytes (${this.limits.maxValueBytes})`,
      );
    }
    // Keys are retained by the Map and the SQLite table too — count them.
    const size = Buffer.byteLength(key, 'utf8') + valueBytes;
    return { normalized: JSON.parse(serialized) as unknown, serialized, size };
  }

  set(key: string, value: unknown): void {
    const { normalized, serialized, size } = this.prepareEntry(key, value);

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
    this.serialized.set(key, serialized);
    this.totalBytes = newTotal;
    if (this.persistedSerialized.get(key) === serialized) {
      this.dirtyKeys.delete(key);
    } else {
      this.dirtyKeys.add(key);
    }
    this.deletedKeys.delete(key);
  }

  delete(key: string): boolean {
    if (!this.store.has(key)) {
      return false;
    }

    this.totalBytes -= this.sizes.get(key) ?? 0;
    this.sizes.delete(key);
    this.serialized.delete(key);
    this.dirtyKeys.delete(key);
    if (this.persistedSerialized.has(key)) {
      this.deletedKeys.add(key);
    } else {
      this.deletedKeys.delete(key);
    }
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
      Object.defineProperty(result, key, {
        value: cloneStoredWorkingMemoryValue(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
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
    const prepared: Array<[string, unknown, string, number]> = [];
    for (const [key, value] of entries) {
      const { normalized, serialized, size } = this.prepareEntry(key, value);
      total += size;
      prepared.push([key, normalized, serialized, size]);
    }
    if (!Number.isSafeInteger(total) || total > this.limits.maxTotalBytes) {
      throw new WorkingMemoryLimitError(
        `Snapshot is ${total} bytes, exceeding maxTotalBytes (${this.limits.maxTotalBytes})`,
      );
    }

    this.clear();
    this.deletedKeys = new Set(this.persistedSerialized.keys());
    for (const [key, normalized, serialized, size] of prepared) {
      this.store.set(key, normalized);
      this.sizes.set(key, size);
      this.serialized.set(key, serialized);
      this.deletedKeys.delete(key);
      if (this.persistedSerialized.get(key) !== serialized) {
        this.dirtyKeys.add(key);
      }
    }
    this.totalBytes = total;
  }

  clear(): void {
    this.store.clear();
    this.sizes.clear();
    this.serialized.clear();
    this.dirtyKeys.clear();
    this.deletedKeys = new Set(this.persistedSerialized.keys());
    this.totalBytes = 0;
  }
}

// --- Episodic Memory ---

const SQLITE_VARIABLE_LIMIT = 999;
const RECALL_VARIABLES_PER_KEYWORD = 4;
const RECALL_LIMIT_VARIABLES = 1;
const MAX_RECALL_KEYWORDS_PER_QUERY = Math.floor(
  (SQLITE_VARIABLE_LIMIT - RECALL_LIMIT_VARIABLES) / RECALL_VARIABLES_PER_KEYWORD,
);

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

    if (keywords.length <= MAX_RECALL_KEYWORDS_PER_QUERY) {
      return this.recallKeywordChunk(keywords, limit).map(row => rowToEvent(row));
    }

    const rowsById = new Map<number, EpisodicRow & { relevance_score: number }>();
    for (const chunk of chunkArray(keywords, MAX_RECALL_KEYWORDS_PER_QUERY)) {
      for (const row of this.recallKeywordChunk(chunk)) {
        const existing = rowsById.get(row.id);
        if (existing) {
          existing.relevance_score += row.relevance_score;
        } else {
          rowsById.set(row.id, { ...row });
        }
      }
    }

    const sortedRows = [...rowsById.values()].sort((a, b) =>
      b.relevance_score - a.relevance_score
      || b.created_at.localeCompare(a.created_at)
      || b.id - a.id,
    );

    return (limit < 0 ? sortedRows : sortedRows.slice(0, limit)).map(rowToEvent);
  }

  private recallKeywordChunk(
    keywords: string[],
    limit?: number,
  ): Array<EpisodicRow & { relevance_score: number }> {
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
      ${limit === undefined ? '' : 'LIMIT ?'}
    `;

    const likeParams = keywords.flatMap(k => {
      const escaped = `%${escapeLike(k)}%`;
      return [escaped, escaped];
    });
    const allParams = limit === undefined
      ? [...likeParams, ...likeParams]
      : [...likeParams, ...likeParams, limit];

    return this.db.prepare(sql).all(...allParams) as Array<EpisodicRow & { relevance_score: number }>;
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
    private flushWorkingMemory?: () => (() => void) | void,
  ) {}

  checkpoint(state: ExecutionState): { id: string } {
    const finalizeWorkingMemoryFlush: { current: (() => void) | undefined } = { current: undefined };
    const tx = this.db.transaction(() => {
      finalizeWorkingMemoryFlush.current = this.flushWorkingMemory?.() ?? undefined;
      const result = this.db
        .prepare(`INSERT INTO checkpoints (state, created_at) VALUES (?, ?)`)
        .run(JSON.stringify(state), state.timestamp);
      return { id: String(result.lastInsertRowid) };
    });

    const result = tx() as { id: string };
    finalizeWorkingMemoryFlush.current?.();
    return result;
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

  constructor(
    dbPath: string = ':memory:',
    workingMemoryLimits?: Partial<WorkingMemoryLimits>,
    options: { hydrateWorkingMemoryFromDb?: boolean } = {},
  ) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
    this.working = new SqliteWorkingMemory(this.db, {
      ...DEFAULT_WORKING_MEMORY_LIMITS,
      ...workingMemoryLimits,
    }, options.hydrateWorkingMemoryFromDb ?? true);
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
      timestamp: isoNow(),
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

  static hydrate(
    snapshot: BrainSnapshot,
    dbPath: string = ':memory:',
    workingMemoryLimits?: Partial<WorkingMemoryLimits>,
  ): SqliteBrain {
    const brain = new SqliteBrain(dbPath, workingMemoryLimits, { hydrateWorkingMemoryFromDb: false });

    try {
      const insertEvent = brain.db.prepare(
        `INSERT INTO episodic_events (id, type, step, summary, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertCheckpoint = brain.db.prepare(
        `INSERT INTO checkpoints (state, created_at) VALUES (?, ?)`,
      );

      const finalizeWorkingMemoryFlush: { current: (() => void) | undefined } = { current: undefined };
      const restoreSnapshot = brain.db.transaction(() => {
        brain.working.restore(snapshot.working);
        finalizeWorkingMemoryFlush.current = brain.working.flushToDb() ?? undefined;

        brain.db.prepare(`DELETE FROM episodic_events`).run();
        brain.db.prepare(`DELETE FROM checkpoints`).run();

        for (const event of snapshot.episodic) {
          insertEvent.run(
            event.id ?? null,
            event.type,
            event.step ?? null,
            event.summary,
            event.details ? JSON.stringify(event.details) : null,
            event.createdAt,
          );
        }

        if (snapshot.checkpoint) {
          insertCheckpoint.run(JSON.stringify(snapshot.checkpoint), snapshot.checkpoint.timestamp);
        }
      });

      restoreSnapshot();
      finalizeWorkingMemoryFlush.current?.();
    } catch (error) {
      brain.close();
      throw error;
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

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function parseStoredWorkingMemoryValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
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
