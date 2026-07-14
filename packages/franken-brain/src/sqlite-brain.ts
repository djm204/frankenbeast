import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  IBrain,
  IWorkingMemory,
  IEpisodicMemory,
  IRecoveryMemory,
  BrainSnapshot,
  MemoryDeletionGuardSnapshot,
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

export const CURRENT_MEMORY_SCHEMA_VERSION = 1;

export interface MemorySchemaStoreMetadata {
  store: string;
  version: number;
  recordCount: number;
}

export interface MemorySchemaMetadata {
  version: number;
  stores: MemorySchemaStoreMetadata[];
}

export interface MemorySchemaMigrationOperation {
  table: string;
  action: string;
}

export interface MemorySchemaMigrationResult {
  fromVersion: number;
  toVersion: number;
  dryRun: boolean;
  migrated: boolean;
  backupPath?: string;
  operations: MemorySchemaMigrationOperation[];
}

export interface MemorySchemaMigrationOptions {
  dryRun?: boolean;
  backupBeforeMigrate?: boolean;
  backupPath?: string;
}

export interface MemoryEncryptionOptions {
  /** Enable field-level AES-256-GCM encryption for persisted memory payloads. */
  enabled: boolean;
  /** Raw key material. Strings are SHA-256 derived into a 32-byte AES key; Buffers must be 32 bytes. */
  key?: string | Buffer;
  /** Environment variable to read when key is omitted. */
  keyEnvVar?: string;
}

export interface SqliteBrainOptions {
  hydrateWorkingMemoryFromDb?: boolean;
  encryption?: MemoryEncryptionOptions;
}

export interface MemoryEncryptionMetadata {
  algorithm: 'aes-256-gcm';
  stores: Array<{ store: string; encrypted: boolean }>;
}

export interface MemoryEncryptionMigrationOptions extends MemoryEncryptionOptions {
  dryRun?: boolean;
  backupBeforeMigrate?: boolean;
  backupPath?: string;
}

export interface MemoryEncryptionMigrationResult {
  dryRun: boolean;
  migrated: boolean;
  backupPath?: string;
  operations: MemorySchemaMigrationOperation[];
}

export class MemoryEncryptionKeyUnavailableError extends Error {
  constructor(
    message = 'Memory encryption is enabled but no key material is available',
  ) {
    super(message);
    this.name = 'MemoryEncryptionKeyUnavailableError';
  }
}

export class MemoryEncryptionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryEncryptionRequiredError';
  }
}

export class MemoryEncryptionMigrationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryEncryptionMigrationRequiredError';
  }
}

export class MemoryEncryptionWrongKeyError extends Error {
  constructor(
    message = 'Memory encryption key cannot decrypt the persisted memory store',
  ) {
    super(message);
    this.name = 'MemoryEncryptionWrongKeyError';
  }
}

const MEMORY_ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;
const MEMORY_ENCRYPTION_PREFIX = 'enc:v1:';
const MEMORY_ENCRYPTION_VERIFIER = 'franken-memory-encryption-verifier:v1';
const MEMORY_STORES = [
  'working_memory',
  'episodic_events',
  'checkpoints',
] as const;

type MemoryStoreName = (typeof MEMORY_STORES)[number];

class MemoryCipher {
  readonly algorithm = MEMORY_ENCRYPTION_ALGORITHM;
  private readonly key: Buffer;

  constructor(options: MemoryEncryptionOptions) {
    const material =
      options.key ??
      (options.keyEnvVar ? process.env[options.keyEnvVar] : undefined);
    if (!material) {
      throw new MemoryEncryptionKeyUnavailableError();
    }
    if (Buffer.isBuffer(material)) {
      if (material.length !== 32) {
        throw new MemoryEncryptionKeyUnavailableError(
          'Memory encryption Buffer keys must be exactly 32 bytes',
        );
      }
      this.key = Buffer.from(material);
    } else {
      this.key = createHash('sha256').update(material, 'utf8').digest();
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(MEMORY_ENCRYPTION_ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${MEMORY_ENCRYPTION_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    if (!isEncryptedPayload(payload)) return payload;
    const parts = payload.slice(MEMORY_ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new MemoryEncryptionWrongKeyError(
        'Encrypted memory payload is malformed',
      );
    }
    try {
      const [ivB64, tagB64, ciphertextB64] = parts;
      const decipher = createDecipheriv(
        MEMORY_ENCRYPTION_ALGORITHM,
        this.key,
        Buffer.from(ivB64!, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64!, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new MemoryEncryptionWrongKeyError(
        `Memory encryption key cannot decrypt a persisted payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  verify(payload: string): void {
    const decrypted = this.decrypt(payload);
    const expected = Buffer.from(MEMORY_ENCRYPTION_VERIFIER);
    const actual = Buffer.from(decrypted);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new MemoryEncryptionWrongKeyError();
    }
  }

  verifier(): string {
    return this.encrypt(MEMORY_ENCRYPTION_VERIFIER);
  }
}

function isEncryptedPayload(value: string): boolean {
  return value.startsWith(MEMORY_ENCRYPTION_PREFIX);
}

function makeMemoryCipher(
  options?: MemoryEncryptionOptions,
): MemoryCipher | undefined {
  if (!options?.enabled) return undefined;
  return new MemoryCipher(options);
}

export type RightToForgetMemoryType = 'working' | 'episodic' | 'all';

export interface RightToForgetSelector {
  /** Exact working-memory key to delete and guard against reinsertion. */
  key?: string;
  /** Category metadata or key prefix to delete. */
  category?: string;
  /** Source/sourceScope metadata or key prefix to delete. */
  sourceScope?: string;
  /** Sensitive fact substring used only for this deletion pass; only a hash is audited. */
  query?: string;
  /** Memory scope to touch. Defaults to all memory stores. */
  type?: RightToForgetMemoryType;
  /** Report what would be deleted without mutating stores or writing audit evidence. */
  dryRun?: boolean;
}

export interface RightToForgetReport {
  selectorHash: string;
  dryRun: boolean;
  deleted: {
    working: number;
    episodic: number;
    derived: number;
  };
  remainingReferences: number;
  auditEventId?: number;
}

export class UnsupportedMemorySchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMemorySchemaVersionError';
  }
}

export class WorkingMemoryLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkingMemoryLimitError';
  }
}

export class MemoryDeletionGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryDeletionGuardError';
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
    private encryption?: MemoryCipher,
  ) {
    this.loadPersistedSerializedFromDb();
    if (hydrateFromDb) {
      this.loadFromDb();
    }
  }

  private loadPersistedSerializedFromDb(): Array<{
    key: string;
    value: string;
  }> {
    const rows = this.db
      .prepare(`SELECT key, value FROM working_memory ORDER BY key ASC`)
      .all() as Array<{ key: string; value: string }>;
    const decryptedRows = rows.map((row) => ({
      key: row.key,
      value: this.encryption?.decrypt(row.value) ?? row.value,
    }));
    this.persistedSerialized = new Map(
      decryptedRows.map((row) => [row.key, row.value]),
    );
    return decryptedRows;
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
      const { normalized, serialized, size } = this.prepareEntry(
        row.key,
        parsed,
      );
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
    const deleteKey = this.db.prepare(
      `DELETE FROM working_memory WHERE key = ?`,
    );
    const upsert = this.db.prepare(
      `INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES (?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, schema_version = excluded.schema_version
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
          upsert.run(
            key,
            this.encryption?.encrypt(serialized) ?? serialized,
            now,
          );
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
    assertNotDeletionGuarded(this.db, key, serialized);

    if (!this.store.has(key) && this.store.size >= this.limits.maxEntries) {
      throw new WorkingMemoryLimitError(
        `Working memory is full: ${this.store.size} entries, maxEntries is ${this.limits.maxEntries}`,
      );
    }
    const newTotal = this.totalBytes - (this.sizes.get(key) ?? 0) + size;
    if (
      !Number.isSafeInteger(newTotal) ||
      newTotal > this.limits.maxTotalBytes
    ) {
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
  usage(): {
    entries: number;
    totalBytes: number;
    limits: WorkingMemoryLimits;
  } {
    return {
      entries: this.store.size,
      totalBytes: this.totalBytes,
      limits: { ...this.limits },
    };
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
      assertNotDeletionGuarded(this.db, key, serialized);
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
const CORRUPT_JSON_SCAN_BATCH_SIZE = 100;
const RECALL_LIMIT_VARIABLES = 1;
const MAX_RECALL_KEYWORDS_PER_QUERY = Math.floor(
  (SQLITE_VARIABLE_LIMIT - RECALL_LIMIT_VARIABLES) /
    RECALL_VARIABLES_PER_KEYWORD,
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
  constructor(
    private db: Database.Database,
    private encryption?: MemoryCipher,
  ) {}

  record(event: EpisodicEvent): void {
    assertEpisodicNotDeletionGuarded(this.db, event);
    this.db
      .prepare(
        `INSERT INTO episodic_events (type, step, summary, details, created_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
      )
      .run(
        event.type,
        event.step ?? null,
        this.encode(event.summary),
        event.details ? this.encode(JSON.stringify(event.details)) : null,
        event.createdAt,
      );
  }

  recall(query: string, limit = 10): EpisodicEvent[] {
    if (this.encryption) {
      return this.recallEncrypted(query, limit);
    }

    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !STOPWORDS.has(w));

    if (keywords.length === 0) {
      return this.recent(limit);
    }

    if (keywords.length <= MAX_RECALL_KEYWORDS_PER_QUERY) {
      return collectRowsToEvents(
        (batchLimit, offset) =>
          this.recallKeywordChunk(keywords, batchLimit, offset),
        limit,
        this.encryption,
      );
    }

    const rowsById = new Map<
      number,
      EpisodicRow & { relevance_score: number }
    >();
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

    const sortedRows = [...rowsById.values()].sort(
      (a, b) =>
        b.relevance_score - a.relevance_score ||
        b.created_at.localeCompare(a.created_at) ||
        b.id - a.id,
    );

    return rowsToEvents(sortedRows, limit, this.encryption);
  }

  private recallEncrypted(query: string, limit = 10): EpisodicEvent[] {
    if (limit === 0) return [];
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !STOPWORDS.has(w));
    if (keywords.length === 0) {
      return this.recent(limit);
    }
    const rows = this.db
      .prepare(`SELECT * FROM episodic_events ORDER BY created_at DESC`)
      .all() as EpisodicRow[];
    const scored = rowsToEvents(rows, -1, this.encryption)
      .map((event) => {
        const summary = event.summary.toLowerCase();
        const details = event.details
          ? JSON.stringify(event.details).toLowerCase()
          : '';
        const score = keywords.reduce(
          (sum, keyword) =>
            sum +
            (summary.includes(keyword) ? 1 : 0) +
            (details.includes(keyword) ? 1 : 0),
          0,
        );
        return { event, score };
      })
      .filter((row) => row.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.event.createdAt.localeCompare(a.event.createdAt) ||
          Number(b.event.id ?? 0) - Number(a.event.id ?? 0),
      )
      .map((row) => row.event);
    return limit < 0 ? scored : scored.slice(0, limit);
  }

  encode(value: string): string {
    return this.encryption?.encrypt(value) ?? value;
  }

  private recallKeywordChunk(
    keywords: string[],
    limit?: number,
    offset = 0,
  ): Array<EpisodicRow & { relevance_score: number }> {
    // Build scoring SQL: count keyword matches across summary + details
    const scoringCases = keywords
      .map(
        () =>
          `(CASE WHEN LOWER(summary) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END + CASE WHEN LOWER(COALESCE(details, '')) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)`,
      )
      .join(' + ');

    const whereClauses = keywords
      .map(
        () =>
          `(LOWER(summary) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(details, '')) LIKE ? ESCAPE '\\')`,
      )
      .join(' OR ');

    const sql = `
      SELECT *, (${scoringCases}) AS relevance_score
      FROM episodic_events
      WHERE ${whereClauses}
      ORDER BY relevance_score DESC, created_at DESC
      ${limit === undefined ? '' : 'LIMIT ? OFFSET ?'}
    `;

    const likeParams = keywords.flatMap((k) => {
      const escaped = `%${escapeLike(k)}%`;
      return [escaped, escaped];
    });
    const allParams =
      limit === undefined
        ? [...likeParams, ...likeParams]
        : [...likeParams, ...likeParams, limit, offset];

    return this.db.prepare(sql).all(...allParams) as Array<
      EpisodicRow & { relevance_score: number }
    >;
  }

  recentFailures(n = 10): EpisodicEvent[] {
    const stmt = this.db.prepare(
      `SELECT * FROM episodic_events WHERE type = 'failure'
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    );
    return collectRowsToEvents(
      (limit, offset) => stmt.all(limit, offset) as EpisodicRow[],
      n,
      this.encryption,
    );
  }

  recent(n = 10): EpisodicEvent[] {
    const stmt = this.db.prepare(
      `SELECT * FROM episodic_events ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    );
    return collectRowsToEvents(
      (limit, offset) => stmt.all(limit, offset) as EpisodicRow[],
      n,
      this.encryption,
    );
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
    private encryption?: MemoryCipher,
  ) {}

  checkpoint(state: ExecutionState): { id: string } {
    assertCheckpointNotDeletionGuarded(this.db, state);
    const finalizeWorkingMemoryFlush: { current: (() => void) | undefined } = {
      current: undefined,
    };
    const tx = this.db.transaction(() => {
      finalizeWorkingMemoryFlush.current =
        this.flushWorkingMemory?.() ?? undefined;
      const result = this.db
        .prepare(
          `INSERT INTO checkpoints (state, created_at, schema_version) VALUES (?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
        )
        .run(
          this.encryption?.encrypt(JSON.stringify(state)) ??
            JSON.stringify(state),
          state.timestamp,
        );
      return { id: String(result.lastInsertRowid) };
    });

    const result = tx() as { id: string };
    finalizeWorkingMemoryFlush.current?.();
    return result;
  }

  lastCheckpoint(): ExecutionState | null {
    const stmt = this.db.prepare(
      `SELECT * FROM checkpoints ORDER BY id DESC LIMIT ? OFFSET ?`,
    );
    for (let offset = 0; ; offset += CORRUPT_JSON_SCAN_BATCH_SIZE) {
      const rows = stmt.all(
        CORRUPT_JSON_SCAN_BATCH_SIZE,
        offset,
      ) as CheckpointRow[];
      for (const row of rows) {
        const state = parseCheckpointState(row, this.encryption);
        if (state !== null) {
          return state;
        }
      }
      if (rows.length < CORRUPT_JSON_SCAN_BATCH_SIZE) {
        return null;
      }
    }
  }

  listCheckpoints(): Array<{ id: string; timestamp: string }> {
    const rows = this.db
      .prepare(`SELECT id, created_at FROM checkpoints ORDER BY id ASC`)
      .all() as Array<{ id: number; created_at: string }>;
    return rows.map((r) => ({ id: String(r.id), timestamp: r.created_at }));
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
  private readonly encryption: MemoryCipher | undefined;

  constructor(
    dbPath: string = ':memory:',
    workingMemoryLimits?: Partial<WorkingMemoryLimits>,
    options: SqliteBrainOptions = {},
  ) {
    this.db = new Database(dbPath);
    this.db.pragma('busy_timeout = 5000');
    assertSupportedMemorySchema(this.db);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
    migrateMemorySchemaDatabase(this.db, dbPath, { dryRun: false });
    const encryption = makeMemoryCipher(options.encryption);
    this.encryption = encryption;
    assertMemoryEncryptionState(this.db, dbPath, encryption);
    this.working = new SqliteWorkingMemory(
      this.db,
      {
        ...DEFAULT_WORKING_MEMORY_LIMITS,
        ...workingMemoryLimits,
      },
      options.hydrateWorkingMemoryFromDb ?? true,
      encryption,
    );
    this.episodic = new SqliteEpisodicMemory(this.db, encryption);
    this.recovery = new SqliteRecoveryMemory(
      this.db,
      () => this.working.flushToDb(),
      encryption,
    );
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_schema_versions (
        store TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        migrated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS working_memory (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE TABLE IF NOT EXISTS episodic_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        step TEXT,
        summary TEXT NOT NULL,
        details TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE TABLE IF NOT EXISTS memory_encryption_status (
        store TEXT PRIMARY KEY,
        encrypted INTEGER NOT NULL,
        algorithm TEXT,
        verifier TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_deletion_guards (
        selector_hash TEXT NOT NULL,
        guard_kind TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION},
        PRIMARY KEY (guard_kind, value_hash)
      );
    `);
  }

  getMemorySchemaMetadata(): MemorySchemaMetadata {
    return readMemorySchemaMetadata(this.db);
  }

  getMemoryEncryptionMetadata(): MemoryEncryptionMetadata {
    return readMemoryEncryptionMetadata(this.db);
  }

  static migrateMemoryEncryption(
    dbPath: string,
    options: MemoryEncryptionMigrationOptions,
  ): MemoryEncryptionMigrationResult {
    const cipher = makeMemoryCipher(options);
    if (!cipher) {
      throw new MemoryEncryptionKeyUnavailableError();
    }
    const db = new Database(
      dbPath,
      options.dryRun ? { readonly: true, fileMustExist: true } : {},
    );
    try {
      assertSupportedMemorySchema(db);
      if (!options.dryRun) {
        db.pragma('busy_timeout = 5000');
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
      }
      return migrateMemoryEncryptionDatabase(db, dbPath, cipher, options);
    } finally {
      db.close();
    }
  }

  static migrateMemorySchema(
    dbPath: string,
    options: MemorySchemaMigrationOptions = {},
  ): MemorySchemaMigrationResult {
    const db = new Database(
      dbPath,
      options.dryRun ? { readonly: true, fileMustExist: true } : {},
    );
    try {
      if (!options.dryRun) {
        db.pragma('busy_timeout = 5000');
        assertSupportedMemorySchema(db);
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
      }
      return migrateMemorySchemaDatabase(db, dbPath, options);
    } finally {
      db.close();
    }
  }

  /** Flush working memory to SQLite before serialization or checkpoint. */
  flush(): void {
    this.working.flushToDb();
  }

  rightToForget(selector: RightToForgetSelector): RightToForgetReport {
    const normalizedSelector = normalizeRightToForgetSelector(selector);
    const selectorHash = hashSelector(normalizedSelector);
    const dryRun = normalizedSelector.dryRun ?? false;
    const memoryType = normalizedSelector.type ?? 'all';

    const workingMatches = memoryType === 'episodic'
      ? []
      : this.matchingWorkingKeys(normalizedSelector);
    const episodicMatches = memoryType === 'working'
      ? []
      : this.matchingEpisodicIds(normalizedSelector);
    const checkpointMatches = memoryType === 'all'
      ? this.matchingCheckpointIds(normalizedSelector)
      : [];

    let auditEventId: number | undefined;
    let finalizeWorkingMemoryFlush: (() => void) | undefined;

    if (!dryRun && (workingMatches.length > 0 || episodicMatches.length > 0 || checkpointMatches.length > 0)) {
      const tx = this.db.transaction(() => {
        for (const key of workingMatches) {
          this.working.delete(key);
        }
        if (workingMatches.length > 0) {
          finalizeWorkingMemoryFlush = this.working.flushToDb() ?? undefined;
        }
        if (episodicMatches.length > 0) {
          const deleteEpisodic = this.db.prepare(`DELETE FROM episodic_events WHERE id = ?`);
          for (const id of episodicMatches) {
            deleteEpisodic.run(id);
          }
        }
        if (checkpointMatches.length > 0) {
          const deleteCheckpoint = this.db.prepare(`DELETE FROM checkpoints WHERE id = ?`);
          for (const id of checkpointMatches) {
            deleteCheckpoint.run(id);
          }
        }
        writeDeletionGuards(this.db, normalizedSelector, selectorHash);
        const auditSummary = 'Right-to-forget deletion completed';
        const auditDetails = JSON.stringify({
          selectorHash,
          deleted: {
            working: workingMatches.length,
            episodic: episodicMatches.length,
            derived: episodicMatches.length + checkpointMatches.length,
          },
        });
        const result = this.db.prepare(
          `INSERT INTO episodic_events (type, step, summary, details, created_at, schema_version)
           VALUES (?, ?, ?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
        ).run(
          'observation',
          'right-to-forget',
          this.encryption?.encrypt(auditSummary) ?? auditSummary,
          this.encryption?.encrypt(auditDetails) ?? auditDetails,
          isoNow(),
        );
        return Number(result.lastInsertRowid);
      });
      auditEventId = tx() as number;
      finalizeWorkingMemoryFlush?.();
    } else if (!dryRun) {
      writeDeletionGuards(this.db, normalizedSelector, selectorHash);
    }

    return {
      selectorHash,
      dryRun,
      deleted: {
        working: workingMatches.length,
        episodic: episodicMatches.length,
        derived: episodicMatches.length + checkpointMatches.length,
      },
      remainingReferences: this.countRemainingReferences(normalizedSelector),
      ...(auditEventId === undefined ? {} : { auditEventId }),
    };
  }

  private matchingWorkingKeys(selector: NormalizedRightToForgetSelector): string[] {
    const snapshot = this.working.snapshot();
    return Object.entries(snapshot)
      .filter(([key, value]) => workingEntryMatchesSelector(key, value, selector))
      .map(([key]) => key);
  }

  private matchingEpisodicIds(selector: NormalizedRightToForgetSelector): number[] {
    const rows = this.db.prepare(`SELECT id, summary, details FROM episodic_events`).all() as Array<{
      id: number;
      summary: string;
      details: string | null;
    }>;
    return rows
      .filter((row) => episodicRowMatchesSelector(
        this.encryption?.decrypt(row.summary) ?? row.summary,
        row.details ? (this.encryption?.decrypt(row.details) ?? row.details) : null,
        selector,
      ))
      .map(row => row.id);
  }

  private matchingCheckpointIds(selector: NormalizedRightToForgetSelector): number[] {
    const rows = this.db.prepare(`SELECT id, state FROM checkpoints`).all() as Array<{
      id: number;
      state: string;
    }>;
    return rows
      .filter((row) => {
        const parsed = safeJsonParse(this.encryption?.decrypt(row.state) ?? row.state);
        return checkpointStateMatchesSelector(parsed, selector);
      })
      .map(row => row.id);
  }

  private countRemainingReferences(selector: NormalizedRightToForgetSelector): number {
    const memoryType = selector.type ?? 'all';
    let count = 0;
    if (memoryType !== 'episodic') {
      count += this.matchingWorkingKeys(selector).length;
    }
    if (memoryType !== 'working') {
      count += this.matchingEpisodicIds(selector).length;
    }
    if (memoryType === 'all') {
      count += this.matchingCheckpointIds(selector).length;
    }
    return count;
  }

  serialize(): BrainSnapshot {
    this.flush();
    return {
      version: 1,
      timestamp: isoNow(),
      working: this.working.snapshot(),
      episodic: this.episodic.recent(100),
      checkpoint: this.recovery.lastCheckpoint(),
      deletionGuards: readDeletionGuardSnapshot(this.db),
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
    options: SqliteBrainOptions = {},
  ): SqliteBrain {
    const brain = new SqliteBrain(dbPath, workingMemoryLimits, {
      ...options,
      hydrateWorkingMemoryFromDb: false,
    });

    try {
      const insertEvent = brain.db.prepare(
        `INSERT INTO episodic_events (id, type, step, summary, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertCheckpoint = brain.db.prepare(
        `INSERT INTO checkpoints (state, created_at, schema_version) VALUES (?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
      );
      const insertDeletionGuard = brain.db.prepare(
        `INSERT OR IGNORE INTO memory_deletion_guards (selector_hash, guard_kind, value_hash, created_at, schema_version) VALUES (?, ?, ?, ?, ?)`,
      );

      const finalizeWorkingMemoryFlush: { current: (() => void) | undefined } =
        { current: undefined };
      const restoreSnapshot = brain.db.transaction(() => {
        brain.working.restore(snapshot.working);
        finalizeWorkingMemoryFlush.current =
          brain.working.flushToDb() ?? undefined;

        brain.db.prepare(`DELETE FROM episodic_events`).run();
        brain.db.prepare(`DELETE FROM checkpoints`).run();
        brain.db.prepare(`DELETE FROM memory_deletion_guards`).run();

        for (const guard of snapshot.deletionGuards ?? []) {
          insertDeletionGuard.run(
            guard.selectorHash,
            guard.guardKind,
            guard.valueHash,
            guard.createdAt,
            guard.schemaVersion,
          );
        }

        for (const event of snapshot.episodic) {
          insertEvent.run(
            event.id ?? null,
            event.type,
            event.step ?? null,
            (
              brain as unknown as {
                episodic: { encode: (value: string) => string };
              }
            ).episodic.encode(event.summary),
            event.details
              ? (
                  brain as unknown as {
                    episodic: { encode: (value: string) => string };
                  }
                ).episodic.encode(JSON.stringify(event.details))
              : null,
            event.createdAt,
          );
        }

        if (snapshot.checkpoint) {
          insertCheckpoint.run(
            brain.encryption?.encrypt(JSON.stringify(snapshot.checkpoint)) ??
              JSON.stringify(snapshot.checkpoint),
            snapshot.checkpoint.timestamp,
          );
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

function migrateMemorySchemaDatabase(
  db: Database.Database,
  dbPath: string,
  options: MemorySchemaMigrationOptions = {},
): MemorySchemaMigrationResult {
  const dryRun = options.dryRun ?? false;
  const stores = [
    'working_memory',
    'episodic_events',
    'checkpoints',
    'memory_deletion_guards',
  ];
  const tableRows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as Array<{
    name: string;
  }>;
  const existingTables = new Set(tableRows.map((row) => row.name));
  const operations: MemorySchemaMigrationOperation[] = [];
  let fromVersion = CURRENT_MEMORY_SCHEMA_VERSION;

  if (!existingTables.has('memory_deletion_guards')) {
    operations.push({ table: 'memory_deletion_guards', action: 'create right-to-forget deletion guard store' });
    fromVersion = 0;
  }

  if (!existingTables.has('memory_schema_versions')) {
    operations.push({
      table: 'memory_schema_versions',
      action: 'create store schema-version registry',
    });
    fromVersion = 0;
  } else {
    const rows = db
      .prepare(`SELECT store, version FROM memory_schema_versions`)
      .all() as Array<{ store: string; version: number }>;
    for (const row of rows) {
      if (row.version > CURRENT_MEMORY_SCHEMA_VERSION) {
        throw new UnsupportedMemorySchemaVersionError(
          `Memory store ${row.store} uses schema version ${row.version}, but this runtime supports only ${CURRENT_MEMORY_SCHEMA_VERSION}`,
        );
      }
      if (row.version < CURRENT_MEMORY_SCHEMA_VERSION) {
        operations.push({
          table: 'memory_schema_versions',
          action: `update ${row.store} registry version from ${row.version} to ${CURRENT_MEMORY_SCHEMA_VERSION}`,
        });
      }
      fromVersion = Math.min(fromVersion, row.version);
    }
  }

  for (const store of stores) {
    if (!existingTables.has(store)) continue;
    const columnRows = db
      .prepare(`PRAGMA table_info(${store})`)
      .all() as Array<{ name: string }>;
    const columns = new Set(columnRows.map((row) => row.name));
    if (!columns.has('schema_version')) {
      operations.push({
        table: store,
        action: `add schema_version column defaulting to ${CURRENT_MEMORY_SCHEMA_VERSION}`,
      });
      fromVersion = 0;
    } else {
      const future = db
        .prepare(
          `SELECT schema_version FROM ${store} WHERE schema_version > ? LIMIT 1`,
        )
        .get(CURRENT_MEMORY_SCHEMA_VERSION) as
        | { schema_version: number }
        | undefined;
      if (future) {
        throw new UnsupportedMemorySchemaVersionError(
          `Memory table ${store} contains record schema version ${future.schema_version}, but this runtime supports only ${CURRENT_MEMORY_SCHEMA_VERSION}`,
        );
      }
    }
  }

  for (const store of stores) {
    if (existingTables.has(store)) {
      const hasRegistryRow = existingTables.has('memory_schema_versions')
        ? db
            .prepare(`SELECT 1 FROM memory_schema_versions WHERE store = ?`)
            .get(store)
        : undefined;
      if (!hasRegistryRow) {
        operations.push({
          table: 'memory_schema_versions',
          action: `record ${store} store schema version`,
        });
        fromVersion = 0;
      }
    }
  }

  const migrated = operations.length > 0;
  let backupPath = options.backupPath;
  let createdBackupPath: string | undefined;
  if (!dryRun && migrated && options.backupBeforeMigrate) {
    if (dbPath === ':memory:') {
      throw new Error(
        'Cannot create a backup for an in-memory SQLite database',
      );
    }
    backupPath ??= `${dbPath}.backup-${Date.now()}`;
    db.exec(`VACUUM INTO ${sqliteStringLiteral(backupPath)}`);
    createdBackupPath = backupPath;
  }

  if (!dryRun && migrated) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_schema_versions (
        store TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        migrated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_deletion_guards (
        selector_hash TEXT NOT NULL,
        guard_kind TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION},
        PRIMARY KEY (guard_kind, value_hash)
      );
    `);
    for (const store of stores) {
      if (!existingTables.has(store) && store !== 'memory_deletion_guards') continue;
      const columnRows = db
        .prepare(`PRAGMA table_info(${store})`)
        .all() as Array<{ name: string }>;
      const columns = new Set(columnRows.map((row) => row.name));
      if (!columns.has('schema_version')) {
        db.exec(
          `ALTER TABLE ${store} ADD COLUMN schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}`,
        );
      }
      const now = isoNow();
      db.prepare(
        `INSERT INTO memory_schema_versions (store, version, migrated_at) VALUES (?, ?, ?)
         ON CONFLICT(store) DO UPDATE SET version = excluded.version, migrated_at = excluded.migrated_at`,
      ).run(store, CURRENT_MEMORY_SCHEMA_VERSION, now);
    }
  }

  return {
    fromVersion,
    toVersion: CURRENT_MEMORY_SCHEMA_VERSION,
    dryRun,
    migrated,
    ...(createdBackupPath ? { backupPath: createdBackupPath } : {}),
    operations,
  };
}

function migrateMemoryEncryptionDatabase(
  db: Database.Database,
  dbPath: string,
  cipher: MemoryCipher,
  options: MemoryEncryptionMigrationOptions,
): MemoryEncryptionMigrationResult {
  const dryRun = options.dryRun ?? false;
  if (!dryRun) {
    ensureMemoryEncryptionStatusTable(db);
  }
  verifyExistingEncryptedStores(db, cipher);
  const operations: MemorySchemaMigrationOperation[] = [];
  for (const store of MEMORY_STORES) {
    if (hasPlaintextStoreRows(db, store, cipher)) {
      operations.push({
        table: store,
        action: `encrypt ${store} persisted payloads with ${cipher.algorithm}`,
      });
    }
  }
  const migrated = operations.length > 0 || !allStoresHaveEncryptionStatus(db);
  let backupPath = options.backupPath;
  let createdBackupPath: string | undefined;
  if (!dryRun && migrated && options.backupBeforeMigrate) {
    if (dbPath === ':memory:') {
      throw new Error(
        'Cannot create a backup for an in-memory SQLite database',
      );
    }
    backupPath ??= `${dbPath}.encryption-backup-${Date.now()}`;
    db.exec(`VACUUM INTO ${sqliteStringLiteral(backupPath)}`);
    createdBackupPath = backupPath;
  }
  if (!dryRun && migrated) {
    const tx = db.transaction(() => {
      encryptPlaintextRows(db, cipher);
      writeMemoryEncryptionStatus(db, cipher);
    });
    tx.immediate();
  }
  return {
    dryRun,
    migrated,
    ...(createdBackupPath ? { backupPath: createdBackupPath } : {}),
    operations,
  };
}

function assertMemoryEncryptionState(
  db: Database.Database,
  dbPath: string,
  cipher?: MemoryCipher,
): void {
  ensureMemoryEncryptionStatusTable(db);
  const metadata = readMemoryEncryptionMetadata(db);
  const anyEncrypted = metadata.stores.some((store) => store.encrypted);
  if (!cipher) {
    if (anyEncrypted) {
      throw new MemoryEncryptionRequiredError(
        `Memory database ${dbPath} is encrypted; reopen it with memory encryption enabled and a valid key`,
      );
    }
    return;
  }

  verifyExistingEncryptedStores(db, cipher);
  const storesWithoutStatus = metadata.stores.filter(
    (store) => !store.encrypted,
  );
  const plaintextStores = metadata.stores.filter((store) =>
    hasPlaintextStoreRows(db, store.store as MemoryStoreName, cipher),
  );
  if (plaintextStores.length > 0) {
    throw new MemoryEncryptionMigrationRequiredError(
      `Memory encryption is enabled but ${plaintextStores.map((store) => store.store).join(', ')} contain plaintext rows; run SqliteBrain.migrateMemoryEncryption() with a backup before opening`,
    );
  }

  if (storesWithoutStatus.length === 0) return;

  const storesWithData = storesWithoutStatus.filter(
    (store) => countStoreRows(db, store.store as MemoryStoreName) > 0,
  );
  if (storesWithData.length > 0) {
    throw new MemoryEncryptionMigrationRequiredError(
      `Memory encryption is enabled but ${storesWithData.map((store) => store.store).join(', ')} contain plaintext rows; run SqliteBrain.migrateMemoryEncryption() with a backup before opening`,
    );
  }
  writeMemoryEncryptionStatus(db, cipher);
}

function verifyExistingEncryptedStores(
  db: Database.Database,
  cipher: MemoryCipher,
): void {
  if (!tableExists(db, 'memory_encryption_status')) return;
  const rows = db
    .prepare(`SELECT store, encrypted, verifier FROM memory_encryption_status`)
    .all() as Array<{
    store: string;
    encrypted: number;
    verifier: string | null;
  }>;
  for (const row of rows) {
    if (!row.encrypted) continue;
    if (!row.verifier)
      throw new MemoryEncryptionWrongKeyError(
        `Encrypted memory store ${row.store} has no verifier`,
      );
    cipher.verify(row.verifier);
  }
}

function tableExists(db: Database.Database, table: string): boolean {
  return (
    (db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table) as unknown) !== undefined
  );
}

function ensureMemoryEncryptionStatusTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_encryption_status (
      store TEXT PRIMARY KEY,
      encrypted INTEGER NOT NULL,
      algorithm TEXT,
      verifier TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

function readMemoryEncryptionMetadata(
  db: Database.Database,
): MemoryEncryptionMetadata {
  if (!tableExists(db, 'memory_encryption_status')) {
    return {
      algorithm: MEMORY_ENCRYPTION_ALGORITHM,
      stores: MEMORY_STORES.map((store) => ({ store, encrypted: false })),
    };
  }
  const rows = db
    .prepare(`SELECT store, encrypted FROM memory_encryption_status`)
    .all() as Array<{ store: string; encrypted: number }>;
  const encryptedByStore = new Map(
    rows.map((row) => [row.store, row.encrypted === 1]),
  );
  return {
    algorithm: MEMORY_ENCRYPTION_ALGORITHM,
    stores: MEMORY_STORES.map((store) => ({
      store,
      encrypted: encryptedByStore.get(store) ?? false,
    })),
  };
}

function writeMemoryEncryptionStatus(
  db: Database.Database,
  cipher: MemoryCipher,
): void {
  const now = isoNow();
  const upsert = db.prepare(
    `INSERT INTO memory_encryption_status (store, encrypted, algorithm, verifier, updated_at) VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(store) DO UPDATE SET encrypted = excluded.encrypted, algorithm = excluded.algorithm, verifier = excluded.verifier, updated_at = excluded.updated_at`,
  );
  for (const store of MEMORY_STORES) {
    upsert.run(store, cipher.algorithm, cipher.verifier(), now);
  }
}

function allStoresHaveEncryptionStatus(db: Database.Database): boolean {
  const rows = db
    .prepare(`SELECT store, encrypted FROM memory_encryption_status`)
    .all() as Array<{ store: string; encrypted: number }>;
  const encrypted = new Set(
    rows.filter((row) => row.encrypted === 1).map((row) => row.store),
  );
  return MEMORY_STORES.every((store) => encrypted.has(store));
}

function hasPlaintextStoreRows(
  db: Database.Database,
  store: MemoryStoreName,
  cipher?: MemoryCipher,
): boolean {
  for (const value of readStorePayloads(db, store)) {
    if (!isDecryptableEncryptedPayload(value, cipher)) {
      return true;
    }
  }
  return false;
}

function readStorePayloads(
  db: Database.Database,
  store: MemoryStoreName,
): string[] {
  switch (store) {
    case 'working_memory':
      return (
        db.prepare(`SELECT value FROM working_memory`).all() as Array<{
          value: string;
        }>
      ).map((row) => row.value);
    case 'episodic_events':
      return (
        db
          .prepare(`SELECT summary, details FROM episodic_events`)
          .all() as Array<{ summary: string; details: string | null }>
      ).flatMap((row) =>
        row.details === null ? [row.summary] : [row.summary, row.details],
      );
    case 'checkpoints':
      return (
        db.prepare(`SELECT state FROM checkpoints`).all() as Array<{
          state: string;
        }>
      ).map((row) => row.state);
  }
}

function isDecryptableEncryptedPayload(
  value: string,
  cipher?: MemoryCipher,
): boolean {
  if (!isEncryptedPayload(value) || !cipher) return false;
  try {
    cipher.decrypt(value);
    return true;
  } catch {
    return false;
  }
}

function countStoreRows(db: Database.Database, store: MemoryStoreName): number {
  return (
    db.prepare(`SELECT COUNT(*) AS count FROM ${store}`).get() as {
      count: number;
    }
  ).count;
}

function encryptPlaintextRows(
  db: Database.Database,
  cipher: MemoryCipher,
): void {
  for (const row of db
    .prepare(`SELECT key, value FROM working_memory`)
    .all() as Array<{ key: string; value: string }>) {
    if (!isDecryptableEncryptedPayload(row.value, cipher)) {
      db.prepare(`UPDATE working_memory SET value = ? WHERE key = ?`).run(
        cipher.encrypt(row.value),
        row.key,
      );
    }
  }
  for (const row of db
    .prepare(`SELECT id, summary, details FROM episodic_events`)
    .all() as Array<{ id: number; summary: string; details: string | null }>) {
    db.prepare(
      `UPDATE episodic_events SET summary = ?, details = ? WHERE id = ?`,
    ).run(
      isDecryptableEncryptedPayload(row.summary, cipher)
        ? row.summary
        : cipher.encrypt(row.summary),
      row.details === null || isDecryptableEncryptedPayload(row.details, cipher)
        ? row.details
        : cipher.encrypt(row.details),
      row.id,
    );
  }
  for (const row of db
    .prepare(`SELECT id, state FROM checkpoints`)
    .all() as Array<{ id: number; state: string }>) {
    if (!isDecryptableEncryptedPayload(row.state, cipher)) {
      db.prepare(`UPDATE checkpoints SET state = ? WHERE id = ?`).run(
        cipher.encrypt(row.state),
        row.id,
      );
    }
  }
}

function readMemorySchemaMetadata(db: Database.Database): MemorySchemaMetadata {
  const stores = [
    'working_memory',
    'episodic_events',
    'checkpoints',
    'memory_deletion_guards',
  ];
  const rows = db
    .prepare(
      `SELECT store, version FROM memory_schema_versions ORDER BY store ASC`,
    )
    .all() as Array<{
    store: string;
    version: number;
  }>;
  const versionByStore = new Map(rows.map((row) => [row.store, row.version]));
  return {
    version: CURRENT_MEMORY_SCHEMA_VERSION,
    stores: stores.map((store) => ({
      store,
      version: versionByStore.get(store) ?? CURRENT_MEMORY_SCHEMA_VERSION,
      recordCount: (
        db.prepare(`SELECT COUNT(*) AS count FROM ${store}`).get() as {
          count: number;
        }
      ).count,
    })),
  };
}

function assertSupportedMemorySchema(db: Database.Database): void {
  const tableRows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as Array<{
    name: string;
  }>;
  const existingTables = new Set(tableRows.map((row) => row.name));
  if (existingTables.has('memory_schema_versions')) {
    const rows = db
      .prepare(`SELECT store, version FROM memory_schema_versions`)
      .all() as Array<{
      store: string;
      version: number;
    }>;
    for (const row of rows) {
      if (row.version > CURRENT_MEMORY_SCHEMA_VERSION) {
        throw new UnsupportedMemorySchemaVersionError(
          `Memory store ${row.store} uses schema version ${row.version}, but this runtime supports only ${CURRENT_MEMORY_SCHEMA_VERSION}`,
        );
      }
    }
  }

  for (const store of ['working_memory', 'episodic_events', 'checkpoints']) {
    if (!existingTables.has(store)) continue;
    const columnRows = db
      .prepare(`PRAGMA table_info(${store})`)
      .all() as Array<{ name: string }>;
    if (!columnRows.some((row) => row.name === 'schema_version')) continue;
    const future = db
      .prepare(
        `SELECT schema_version FROM ${store} WHERE schema_version > ? LIMIT 1`,
      )
      .get(CURRENT_MEMORY_SCHEMA_VERSION) as
      | { schema_version: number }
      | undefined;
    if (future) {
      throw new UnsupportedMemorySchemaVersionError(
        `Memory table ${store} contains record schema version ${future.schema_version}, but this runtime supports only ${CURRENT_MEMORY_SCHEMA_VERSION}`,
      );
    }
  }
}

function sqliteStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

type NormalizedRightToForgetSelector = Omit<RightToForgetSelector, 'type'> & { type?: RightToForgetMemoryType };

function normalizeRightToForgetSelector(selector: RightToForgetSelector): NormalizedRightToForgetSelector {
  const normalized: NormalizedRightToForgetSelector = {};
  for (const field of ['key', 'category', 'sourceScope', 'query'] as const) {
    const value = selector[field];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`right-to-forget ${field} must be a non-empty string when provided`);
      }
      normalized[field] = value.trim();
    }
  }
  if (selector.type !== undefined) {
    if (!['working', 'episodic', 'all'].includes(selector.type)) {
      throw new Error('right-to-forget type must be working, episodic, or all');
    }
    normalized.type = selector.type;
  }
  if (selector.dryRun !== undefined) {
    normalized.dryRun = Boolean(selector.dryRun);
  }
  if (!normalized.key && !normalized.category && !normalized.sourceScope && !normalized.query) {
    throw new Error('right-to-forget requires at least one of key, category, sourceScope, or query');
  }
  return normalized;
}

function hashSelector(selector: NormalizedRightToForgetSelector): string {
  return createHash('sha256')
    .update(JSON.stringify({
      key: normalizeForMatch(selector.key),
      category: normalizeForMatch(selector.category),
      sourceScope: normalizeForMatch(selector.sourceScope),
      query: normalizeForMatch(selector.query),
      type: selector.type ?? 'all',
    }))
    .digest('hex');
}

function hashGuardValue(value: string, normalize = true): string {
  return createHash('sha256').update(normalize ? normalizeForMatch(value) : value).digest('hex');
}

function guardTokens(value: string | undefined): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) return [];
  return Array.from(new Set([
    normalized,
    ...(normalized.match(/[a-z0-9][a-z0-9@._:-]*/g) ?? []),
  ]));
}

function normalizeForMatch(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function valueToSearchText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function objectMetadataString(value: unknown, names: string[]): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const name of names) {
    const raw = record[name];
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && raw.every(item => typeof item === 'string')) return raw.join(' ');
  }
  return undefined;
}

function workingEntryMatchesSelector(key: string, value: unknown, selector: NormalizedRightToForgetSelector): boolean {
  const lowerKey = normalizeForMatch(key);
  const text = normalizeForMatch(`${key} ${valueToSearchText(value)}`);
  if (selector.key && key === selector.key) return true;
  if (selector.query && text.includes(normalizeForMatch(selector.query))) return true;
  if (selector.category) {
    const category = normalizeForMatch(selector.category);
    const metadata = normalizeForMatch(objectMetadataString(value, ['category', 'categories', 'kind']));
    if (metadata.split(/\s+/).includes(category) || lowerKey.startsWith(`${category}:`)) return true;
  }
  if (selector.sourceScope) {
    const sourceScope = normalizeForMatch(selector.sourceScope);
    const metadata = normalizeForMatch(objectMetadataString(value, ['sourceScope', 'source', 'scope', 'sourceId']));
    if (metadata.split(/\s+/).includes(sourceScope) || lowerKey.startsWith(`${sourceScope}:`) || lowerKey.includes(`:${sourceScope}:`)) return true;
  }
  return false;
}

function episodicRowMatchesSelector(summary: string, details: string | null, selector: NormalizedRightToForgetSelector): boolean {
  const parsedDetails = details ? safeJsonParse(details) : undefined;
  const text = normalizeForMatch(`${summary} ${details ?? ''}`);
  if (selector.query && text.includes(normalizeForMatch(selector.query))) return true;
  if (selector.category) {
    const category = normalizeForMatch(selector.category);
    const metadata = normalizeForMatch(objectMetadataString(parsedDetails, ['category', 'categories', 'kind']));
    if (metadata.split(/\s+/).includes(category) || text.includes(`category:${category}`)) return true;
  }
  if (selector.sourceScope) {
    const sourceScope = normalizeForMatch(selector.sourceScope);
    const metadata = normalizeForMatch(objectMetadataString(parsedDetails, ['sourceScope', 'source', 'scope', 'sourceId']));
    if (metadata.split(/\s+/).includes(sourceScope)) return true;
  }
  return false;
}

function writeDeletionGuards(db: Database.Database, selector: NormalizedRightToForgetSelector, selectorHash: string): void {
  const now = isoNow();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO memory_deletion_guards (selector_hash, guard_kind, value_hash, created_at, schema_version)
     VALUES (?, ?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
  );
  const scopes = selector.type === 'working'
    ? ['working']
    : selector.type === 'episodic'
      ? ['episodic']
      : ['working', 'episodic', 'checkpoint'];
  for (const [kind, value] of [
    ['key', selector.key],
    ['category', selector.category],
    ['sourceScope', selector.sourceScope],
    ['query', selector.query],
  ] as const) {
    if (!value) continue;
    const values = kind === 'query' ? guardTokens(value) : [value];
    for (const guardValue of values) {
      for (const scope of scopes) {
        if (kind === 'key' && scope !== 'working') continue;
        insert.run(selectorHash, `${scope}:${kind}`, hashGuardValue(guardValue, kind !== 'key'), now);
      }
    }
  }
}

function assertNotDeletionGuarded(db: Database.Database, key: string, serializedValue: string): void {
  const parsed = safeJsonParse(serializedValue);
  const keyPrefix = key.includes(':') ? key.split(':', 1)[0] : undefined;
  const candidates: Array<[string, string | undefined]> = [
    ['key', key],
    ['category', objectMetadataString(parsed, ['category', 'categories', 'kind'])],
    ['category', keyPrefix],
    ['sourceScope', objectMetadataString(parsed, ['sourceScope', 'source', 'scope', 'sourceId'])],
    ['sourceScope', keyPrefix],
  ];
  const stmt = db.prepare(`SELECT 1 FROM memory_deletion_guards WHERE guard_kind = ? AND value_hash = ? LIMIT 1`);
  for (const [kind, value] of candidates) {
    if (!value) continue;
    for (const candidate of value.split(/\s+/).filter(Boolean)) {
      if (stmt.get(`working:${kind}`, hashGuardValue(candidate, kind !== 'key'))) {
        throw new MemoryDeletionGuardError(`Refusing to store memory because it matches a prior right-to-forget ${kind} guard`);
      }
    }
  }
  for (const value of guardTokens(typeof parsed === 'string' ? parsed : valueToSearchText(parsed))) {
    if (stmt.get('working:query', hashGuardValue(value))) {
      throw new MemoryDeletionGuardError('Refusing to store memory because it matches a prior right-to-forget query guard');
    }
  }
}

function assertEpisodicNotDeletionGuarded(db: Database.Database, event: EpisodicEvent): void {
  const stmt = db.prepare(`SELECT 1 FROM memory_deletion_guards WHERE guard_kind = ? AND value_hash = ? LIMIT 1`);
  const text = `${event.summary} ${event.details ? valueToSearchText(event.details) : ''}`;
  const candidates: Array<[string, string | undefined]> = [
    ['category', objectMetadataString(event.details, ['category', 'categories', 'kind'])],
    ...extractStructuredMarkerValues(text, 'category').map(value => ['category', value] as [string, string]),
    ['sourceScope', objectMetadataString(event.details, ['sourceScope', 'source', 'scope', 'sourceId'])],
  ];
  for (const [kind, value] of candidates) {
    if (!value) continue;
    for (const candidate of value.split(/\s+/).filter(Boolean)) {
      if (stmt.get(`episodic:${kind}`, hashGuardValue(candidate, kind !== 'key'))) {
        throw new MemoryDeletionGuardError(`Refusing to store episodic memory because it matches a prior right-to-forget ${kind} guard`);
      }
    }
  }
  for (const value of guardTokens(text)) {
    if (stmt.get('episodic:query', hashGuardValue(value))) {
      throw new MemoryDeletionGuardError('Refusing to store episodic memory because it matches a prior right-to-forget query guard');
    }
  }
}

function extractStructuredMarkerValues(text: string, name: string): string[] {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedName}\\s*[:=]\\s*([a-z0-9@._-]+)`, 'gi');
  return Array.from(new Set(Array.from(text.matchAll(regex), match => match[1] ?? '').filter(Boolean)));
}

function checkpointStateMatchesSelector(value: unknown, selector: NormalizedRightToForgetSelector): boolean {
  const text = normalizeForMatch(valueToSearchText(value));
  if (selector.query && text.includes(normalizeForMatch(selector.query))) return true;
  const context = value !== null && typeof value === 'object'
    ? (value as { context?: unknown }).context
    : undefined;
  if (selector.category) {
    const category = normalizeForMatch(selector.category);
    const metadata = normalizeForMatch(objectMetadataString(context, ['category', 'categories', 'kind']));
    if (metadata.split(/\s+/).includes(category) || text.includes(`category:${category}`)) return true;
  }
  if (selector.sourceScope) {
    const sourceScope = normalizeForMatch(selector.sourceScope);
    const metadata = normalizeForMatch(objectMetadataString(context, ['sourceScope', 'source', 'scope', 'sourceId']));
    if (metadata.split(/\s+/).includes(sourceScope)) return true;
  }
  return false;
}

function readDeletionGuardSnapshot(db: Database.Database): MemoryDeletionGuardSnapshot[] {
  const rows = db.prepare(
    `SELECT selector_hash, guard_kind, value_hash, created_at, schema_version
     FROM memory_deletion_guards
     ORDER BY selector_hash, guard_kind, value_hash`,
  ).all() as Array<{
    selector_hash: string;
    guard_kind: string;
    value_hash: string;
    created_at: string;
    schema_version: number;
  }>;
  return rows.map(row => ({
    selectorHash: row.selector_hash,
    guardKind: row.guard_kind,
    valueHash: row.value_hash,
    createdAt: row.created_at,
    schemaVersion: row.schema_version,
  }));
}

function hasDeletionGuard(db: Database.Database, scope: string, kind: string, value: string): boolean {
  const normalize = kind !== 'key';
  return Boolean(db.prepare(`SELECT 1 FROM memory_deletion_guards WHERE guard_kind = ? AND value_hash = ? LIMIT 1`)
    .get(`${scope}:${kind}`, hashGuardValue(value, normalize)));
}

function assertCheckpointNotDeletionGuarded(db: Database.Database, state: ExecutionState): void {
  const context = state.context;
  const candidates: Array<[string, string | undefined]> = [
    ['category', objectMetadataString(context, ['category', 'categories', 'kind'])],
    ['sourceScope', objectMetadataString(context, ['sourceScope', 'source', 'scope', 'sourceId'])],
  ];
  for (const [kind, value] of candidates) {
    if (!value) continue;
    for (const candidate of value.split(/\s+/).filter(Boolean)) {
      if (hasDeletionGuard(db, 'checkpoint', kind, candidate)) {
        throw new MemoryDeletionGuardError(`Refusing to store checkpoint because it matches a prior right-to-forget ${kind} guard`);
      }
    }
  }
  const text = valueToSearchText(state);
  for (const value of guardTokens(text)) {
    if (hasDeletionGuard(db, 'checkpoint', 'query', value)) {
      throw new MemoryDeletionGuardError('Refusing to store checkpoint because it matches a prior right-to-forget query guard');
    }
  }
}

// --- Constants ---

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'not',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'yet',
  'so',
  'in',
  'on',
  'at',
  'to',
  'of',
  'by',
  'with',
  'from',
  'as',
  'into',
  'about',
  'between',
  'through',
  'after',
  'before',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
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

function rowsToEvents(
  rows: EpisodicRow[],
  limit: number,
  encryption?: MemoryCipher,
): EpisodicEvent[] {
  if (limit === 0) {
    return [];
  }

  const events: EpisodicEvent[] = [];
  for (const row of rows) {
    const event = rowToEvent(row, encryption);
    if (event) {
      events.push(event);
      if (limit >= 0 && events.length >= limit) {
        break;
      }
    }
  }
  return events;
}

function collectRowsToEvents(
  fetchRows: (limit: number, offset: number) => EpisodicRow[],
  limit: number,
  encryption?: MemoryCipher,
): EpisodicEvent[] {
  if (limit === 0) {
    return [];
  }

  const events: EpisodicEvent[] = [];
  const target = limit < 0 ? Number.POSITIVE_INFINITY : limit;
  const batchSize =
    limit < 0
      ? CORRUPT_JSON_SCAN_BATCH_SIZE
      : Math.max(CORRUPT_JSON_SCAN_BATCH_SIZE, limit * 2);

  for (let offset = 0; events.length < target; offset += batchSize) {
    const rows = fetchRows(batchSize, offset);
    for (const row of rows) {
      const event = rowToEvent(row, encryption);
      if (event) {
        events.push(event);
        if (events.length >= target) {
          break;
        }
      }
    }
    if (rows.length < batchSize) {
      break;
    }
  }

  return events;
}

function parseCheckpointState(
  row: CheckpointRow,
  encryption?: MemoryCipher,
): ExecutionState | null {
  try {
    return JSON.parse(
      encryption?.decrypt(row.state) ?? row.state,
    ) as ExecutionState;
  } catch {
    return null;
  }
}

function rowToEvent(
  row: EpisodicRow,
  encryption?: MemoryCipher,
): EpisodicEvent | null {
  const event: EpisodicEvent = {
    id: row.id,
    type: row.type as EpisodicEventType,
    summary: encryption?.decrypt(row.summary) ?? row.summary,
    createdAt: row.created_at,
  };
  if (row.step) event.step = row.step;
  if (row.details) {
    try {
      event.details = JSON.parse(
        encryption?.decrypt(row.details) ?? row.details,
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return event;
}
