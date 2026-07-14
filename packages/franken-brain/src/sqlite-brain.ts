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
  EpisodicEvent,
  ExecutionState,
  EpisodicEventType,
  LearningCooldownOptions,
  LearningRecordResult,
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

export type MemoryCandidateTargetStore = 'working';
export type MemoryCandidateStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'never_store'
  | 'suppressed';
export type MemorySuppressionReason = 'rejected' | 'never_store';

export interface MemoryCandidateProposal {
  targetStore: MemoryCandidateTargetStore;
  key: string;
  value: unknown;
  source: string;
  evidenceId?: string;
  confidence: number;
  reason: string;
}

export interface MemoryCandidate extends MemoryCandidateProposal {
  id: string;
  status: MemoryCandidateStatus;
  suppressionReason?: MemorySuppressionReason;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  reviewer?: string;
  note?: string;
}

export interface MemoryCandidateEdit {
  value?: unknown;
  source?: string;
  evidenceId?: string;
  confidence?: number;
  reason?: string;
}

export interface MemoryReviewDecisionOptions {
  reviewer?: string;
  note?: string;
}

export interface MemoryProvenanceRecord {
  targetStore: MemoryCandidateTargetStore;
  key: string;
  value: unknown;
  candidateId: string;
  source: string;
  evidenceId?: string;
  confidence: number;
  reason: string;
  reviewer?: string;
  note?: string;
  approvedAt: string;
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
const DEFAULT_LEARNING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
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
    this.insertEvent(event);
  }

  recordLearning(
    event: EpisodicEvent,
    options: LearningCooldownOptions = {},
  ): LearningRecordResult {
    const key = normalizeLearningKey(
      options.key ?? readLearningKey(event) ?? `${event.step ?? ''}:${event.summary}`,
    );
    const cooldownMs = options.cooldownMs ?? DEFAULT_LEARNING_COOLDOWN_MS;
    const eventTimeMs = Date.parse(event.createdAt);

    if (!key) {
      throw new Error('Learning cooldown key must not be empty');
    }
    if (!Number.isInteger(cooldownMs) || cooldownMs < 0) {
      throw new RangeError('Learning cooldown must be a non-negative integer number of milliseconds');
    }
    if (!Number.isFinite(eventTimeMs)) {
      throw new Error(`Learning event createdAt must be a valid ISO timestamp: ${event.createdAt}`);
    }

    const normalizedCreatedAt = new Date(eventTimeMs).toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (cooldownMs > 0) {
        const existingEvent = this.findLearningCooldownEvent(key, eventTimeMs, cooldownMs);
        if (existingEvent) {
          this.db.exec('COMMIT');
          return {
            recorded: false,
            reason: 'cooldown',
            key,
            cooldownMs,
            existingEvent,
            cooldownUntil: new Date(
              Date.parse(existingEvent.createdAt) + (readLearningCooldownMs(existingEvent) ?? cooldownMs),
            ).toISOString(),
          };
        }
      }

      this.insertEvent({
        ...event,
        createdAt: normalizedCreatedAt,
        details: {
          ...(event.details ?? {}),
          learningKey: key,
          learningCooldownMs: cooldownMs,
        },
      });

      this.db.exec('COMMIT');
      return { recorded: true, key, cooldownMs };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private insertEvent(event: EpisodicEvent): void {
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

  private findLearningCooldownEvent(
    key: string,
    eventTimeMs: number,
    cooldownMs: number,
  ): EpisodicEvent | null {
    const rows = this.db
      .prepare(
        `SELECT * FROM episodic_events
         WHERE details LIKE ? ESCAPE '\\'
         ORDER BY id DESC`,
      )
      .all(learningKeyDetailsPattern(key)) as EpisodicRow[];

    for (const row of rows) {
      const existingEvent = rowToEvent(row);
      if (!existingEvent || normalizeLearningKey(readLearningKey(existingEvent) ?? '') !== key) {
        continue;
      }

      const existingTimeMs = Date.parse(existingEvent.createdAt);
      const existingCooldownMs = readLearningCooldownMs(existingEvent) ?? cooldownMs;
      if (
        Number.isFinite(existingTimeMs)
        && Number.isInteger(existingCooldownMs)
        && existingCooldownMs > 0
        && existingTimeMs <= eventTimeMs
        && eventTimeMs - existingTimeMs < existingCooldownMs
      ) {
        return existingEvent;
      }
    }

    return null;
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

  snapshotForHandoff(n = 100, nowMs = Date.now()): EpisodicEvent[] {
    const recentEvents = this.recent(n);
    const eventsById = new Map<number | string, EpisodicEvent>();
    for (const event of recentEvents) {
      eventsById.set(event.id ?? `${event.createdAt}:${event.summary}`, event);
    }

    const activeLearningRows = this.db
      .prepare(
        `SELECT * FROM episodic_events
         WHERE details LIKE ? ESCAPE '\\'
         ORDER BY id DESC`,
      )
      .all(learningKeyDetailsPattern()) as EpisodicRow[];

    for (const row of activeLearningRows) {
      const event = rowToEvent(row);
      const eventTimeMs = event ? Date.parse(event.createdAt) : NaN;
      const eventCooldownMs = event ? readLearningCooldownMs(event) ?? DEFAULT_LEARNING_COOLDOWN_MS : NaN;
      if (
        event
        && readLearningKey(event) !== undefined
        && Number.isFinite(eventTimeMs)
        && Number.isInteger(eventCooldownMs)
        && eventCooldownMs > 0
        && nowMs - eventTimeMs < eventCooldownMs
      ) {
        eventsById.set(event.id ?? `${event.createdAt}:${event.summary}`, event);
      }
    }

    return [...eventsById.values()].sort(compareEventsNewestFirst);
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

// --- User-visible memory review and consent ---

type MemoryCandidateRow = {
  id: string;
  target_store: MemoryCandidateTargetStore;
  memory_key: string;
  value: string;
  source: string;
  evidence_id: string | null;
  confidence: number;
  reason: string;
  status: MemoryCandidateStatus;
  suppression_reason: MemorySuppressionReason | null;
  reviewer: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

type MemoryProvenanceRow = {
  target_store: MemoryCandidateTargetStore;
  memory_key: string;
  value: string;
  candidate_id: string;
  source: string;
  evidence_id: string | null;
  confidence: number;
  reason: string;
  reviewer: string | null;
  note: string | null;
  approved_at: string;
};

export class SqliteMemoryReviewQueue {
  constructor(
    private db: Database.Database,
    private working: SqliteWorkingMemory,
    private encryption?: MemoryCipher,
  ) {}

  propose(proposal: MemoryCandidateProposal): MemoryCandidate {
    this.validateProposal(proposal);
    const neverStoreSuppression = this.findSuppression(
      this.neverStoreSignature(proposal),
    );
    if (neverStoreSuppression) {
      return this.suppressedCandidate(proposal, 'never_store');
    }
    const rejectedSuppression = this.findSuppression(
      this.rejectedSignature(proposal),
    );
    if (rejectedSuppression) {
      return this.suppressedCandidate(proposal, 'rejected');
    }

    const now = isoNow();
    const candidate: MemoryCandidate = {
      ...proposal,
      id: `memcand_${randomBytes(12).toString('base64url')}`,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO memory_review_candidates (
          id, target_store, memory_key, value, source, evidence_id, confidence,
          reason, status, suppression_reason, reviewer, note, created_at,
          updated_at, decided_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
      )
      .run(
        candidate.id,
        candidate.targetStore,
        candidate.key,
        this.encodeValue(candidate.value),
        this.encodeText(candidate.source),
        candidate.evidenceId ? this.encodeText(candidate.evidenceId) : null,
        candidate.confidence,
        this.encodeText(candidate.reason),
        candidate.status,
        candidate.createdAt,
        candidate.updatedAt,
      );
    return candidate;
  }

  list(status: MemoryCandidateStatus = 'pending'): MemoryCandidate[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_review_candidates WHERE status = ? ORDER BY created_at ASC, id ASC`,
      )
      .all(status) as MemoryCandidateRow[];
    return rows.map((row) => this.rowToCandidate(row));
  }

  edit(id: string, edit: MemoryCandidateEdit): MemoryCandidate {
    const candidate = this.requireCandidate(id, 'pending');
    const updated: MemoryCandidate = {
      ...candidate,
      ...edit,
      updatedAt: isoNow(),
    };
    this.validateProposal(updated);
    this.db
      .prepare(
        `UPDATE memory_review_candidates
         SET value = ?, source = ?, evidence_id = ?, confidence = ?, reason = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(
        this.encodeValue(updated.value),
        this.encodeText(updated.source),
        updated.evidenceId ? this.encodeText(updated.evidenceId) : null,
        updated.confidence,
        this.encodeText(updated.reason),
        updated.updatedAt,
        id,
      );
    return this.requireCandidate(id, 'pending');
  }

  approve(
    id: string,
    options: MemoryReviewDecisionOptions = {},
  ): MemoryCandidate {
    const candidate = this.requireCandidate(id, 'pending');
    const now = isoNow();
    let finalizeWorkingFlush: (() => void) | undefined;
    const approveTx = this.db.transaction(() => {
      this.working.set(candidate.key, candidate.value);
      finalizeWorkingFlush = this.working.flushToDb() ?? undefined;
      this.db
        .prepare(
          `INSERT INTO memory_review_provenance (
            target_store, memory_key, value, candidate_id, source, evidence_id,
            confidence, reason, reviewer, note, approved_at, schema_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})
          ON CONFLICT(target_store, memory_key) DO UPDATE SET
            value = excluded.value,
            candidate_id = excluded.candidate_id,
            source = excluded.source,
            evidence_id = excluded.evidence_id,
            confidence = excluded.confidence,
            reason = excluded.reason,
            reviewer = excluded.reviewer,
            note = excluded.note,
            approved_at = excluded.approved_at,
            schema_version = excluded.schema_version`,
        )
        .run(
          candidate.targetStore,
          candidate.key,
          this.encodeValue(candidate.value),
          candidate.id,
          this.encodeText(candidate.source),
          candidate.evidenceId ? this.encodeText(candidate.evidenceId) : null,
          candidate.confidence,
          this.encodeText(candidate.reason),
          options.reviewer ? this.encodeText(options.reviewer) : null,
          options.note ? this.encodeText(options.note) : null,
          now,
        );
      this.markDecision(id, 'approved', now, options);
    });
    approveTx.immediate();
    finalizeWorkingFlush?.();
    return this.requireCandidate(id, 'approved');
  }

  reject(
    id: string,
    options: MemoryReviewDecisionOptions = {},
  ): MemoryCandidate {
    const candidate = this.requireCandidate(id, 'pending');
    const now = isoNow();
    const tx = this.db.transaction(() => {
      this.markDecision(id, 'rejected', now, options);
      this.insertSuppression(candidate, 'rejected', now, options);
    });
    tx.immediate();
    return this.requireCandidate(id, 'rejected');
  }

  neverStore(
    id: string,
    options: MemoryReviewDecisionOptions = {},
  ): MemoryCandidate {
    const candidate = this.requireCandidate(id, 'pending');
    const now = isoNow();
    const tx = this.db.transaction(() => {
      this.markDecision(id, 'never_store', now, options);
      this.insertSuppression(candidate, 'never_store', now, options);
    });
    tx.immediate();
    return this.requireCandidate(id, 'never_store');
  }

  provenanceFor(
    targetStore: MemoryCandidateTargetStore,
    key: string,
  ): MemoryProvenanceRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM memory_review_provenance WHERE target_store = ? AND memory_key = ?`,
      )
      .get(targetStore, key) as MemoryProvenanceRow | undefined;
    return row ? this.rowToProvenance(row) : null;
  }

  private validateProposal(proposal: MemoryCandidateProposal): void {
    if (proposal.targetStore !== 'working') {
      throw new Error(`Unsupported memory review target store: ${proposal.targetStore}`);
    }
    if (proposal.key.trim().length === 0) {
      throw new Error('Memory candidate key must not be empty');
    }
    if (proposal.source.trim().length === 0) {
      throw new Error('Memory candidate source must not be empty');
    }
    if (proposal.reason.trim().length === 0) {
      throw new Error('Memory candidate reason must not be empty');
    }
    if (
      !Number.isFinite(proposal.confidence) ||
      proposal.confidence < 0 ||
      proposal.confidence > 1
    ) {
      throw new RangeError('Memory candidate confidence must be between 0 and 1');
    }
    stringifyWorkingMemoryValue(proposal.key, proposal.value);
  }

  private requireCandidate(
    id: string,
    status?: MemoryCandidateStatus,
  ): MemoryCandidate {
    const row = this.db
      .prepare(`SELECT * FROM memory_review_candidates WHERE id = ?`)
      .get(id) as MemoryCandidateRow | undefined;
    if (!row) throw new Error(`Memory candidate ${id} was not found`);
    const candidate = this.rowToCandidate(row);
    if (status && candidate.status !== status) {
      throw new Error(
        `Memory candidate ${id} is ${candidate.status}, expected ${status}`,
      );
    }
    return candidate;
  }

  private markDecision(
    id: string,
    status: Exclude<MemoryCandidateStatus, 'pending' | 'suppressed'>,
    decidedAt: string,
    options: MemoryReviewDecisionOptions,
  ): void {
    this.db
      .prepare(
        `UPDATE memory_review_candidates
         SET status = ?, reviewer = ?, note = ?, updated_at = ?, decided_at = ?
         WHERE id = ?`,
      )
      .run(
        status,
        options.reviewer ? this.encodeText(options.reviewer) : null,
        options.note ? this.encodeText(options.note) : null,
        decidedAt,
        decidedAt,
        id,
      );
  }

  private insertSuppression(
    candidate: MemoryCandidate,
    reason: MemorySuppressionReason,
    createdAt: string,
    options: MemoryReviewDecisionOptions,
  ): void {
    const signature =
      reason === 'never_store'
        ? this.neverStoreSignature(candidate)
        : this.rejectedSignature(candidate);
    this.db
      .prepare(
        `INSERT INTO memory_review_suppressions (
          signature, suppression_reason, target_store, memory_key, value, source,
          evidence_id, reason, reviewer, note, created_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})
        ON CONFLICT(signature) DO UPDATE SET
          suppression_reason = excluded.suppression_reason,
          reviewer = excluded.reviewer,
          note = excluded.note,
          created_at = excluded.created_at`,
      )
      .run(
        signature,
        reason,
        candidate.targetStore,
        candidate.key,
        this.encodeValue(candidate.value),
        this.encodeText(candidate.source),
        candidate.evidenceId ? this.encodeText(candidate.evidenceId) : null,
        this.encodeText(candidate.reason),
        options.reviewer ? this.encodeText(options.reviewer) : null,
        options.note ? this.encodeText(options.note) : null,
        createdAt,
      );
  }

  private findSuppression(signature: string): MemorySuppressionReason | null {
    const row = this.db
      .prepare(
        `SELECT suppression_reason FROM memory_review_suppressions WHERE signature = ?`,
      )
      .get(signature) as { suppression_reason: MemorySuppressionReason } | undefined;
    return row?.suppression_reason ?? null;
  }

  private suppressedCandidate(
    proposal: MemoryCandidateProposal,
    suppressionReason: MemorySuppressionReason,
  ): MemoryCandidate {
    const now = isoNow();
    return {
      ...proposal,
      id: `memcand_suppressed_${createHash('sha256')
        .update(this.neverStoreSignature(proposal))
        .digest('hex')
        .slice(0, 16)}`,
      status: 'suppressed',
      suppressionReason,
      createdAt: now,
      updatedAt: now,
    };
  }

  private rejectedSignature(proposal: MemoryCandidateProposal): string {
    return stableMemorySignature([
      'rejected',
      proposal.targetStore,
      proposal.key,
      proposal.source,
      proposal.evidenceId ?? '',
      stableStringify(proposal.value),
    ]);
  }

  private neverStoreSignature(proposal: MemoryCandidateProposal): string {
    return stableMemorySignature([
      'never_store',
      proposal.targetStore,
      proposal.key,
      stableStringify(proposal.value),
    ]);
  }

  private rowToCandidate(row: MemoryCandidateRow): MemoryCandidate {
    return {
      id: row.id,
      targetStore: row.target_store,
      key: row.memory_key,
      value: this.decodeValue(row.value),
      source: this.decodeText(row.source),
      ...(row.evidence_id ? { evidenceId: this.decodeText(row.evidence_id) } : {}),
      confidence: row.confidence,
      reason: this.decodeText(row.reason),
      status: row.status,
      ...(row.suppression_reason
        ? { suppressionReason: row.suppression_reason }
        : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
      ...(row.reviewer ? { reviewer: this.decodeText(row.reviewer) } : {}),
      ...(row.note ? { note: this.decodeText(row.note) } : {}),
    };
  }

  private rowToProvenance(row: MemoryProvenanceRow): MemoryProvenanceRecord {
    return {
      targetStore: row.target_store,
      key: row.memory_key,
      value: this.decodeValue(row.value),
      candidateId: row.candidate_id,
      source: this.decodeText(row.source),
      ...(row.evidence_id ? { evidenceId: this.decodeText(row.evidence_id) } : {}),
      confidence: row.confidence,
      reason: this.decodeText(row.reason),
      ...(row.reviewer ? { reviewer: this.decodeText(row.reviewer) } : {}),
      ...(row.note ? { note: this.decodeText(row.note) } : {}),
      approvedAt: row.approved_at,
    };
  }

  private encodeText(value: string): string {
    return this.encryption?.encrypt(value) ?? value;
  }

  private decodeText(value: string): string {
    return this.encryption?.decrypt(value) ?? value;
  }

  private encodeValue(value: unknown): string {
    return this.encodeText(stringifyWorkingMemoryValue('memory candidate', value));
  }

  private decodeValue(value: string): unknown {
    return parseStoredWorkingMemoryValue(this.decodeText(value));
  }
}

function stableMemorySignature(parts: unknown[]): string {
  return createHash('sha256').update(stableStringify(parts)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}

// --- SqliteBrain ---

export class SqliteBrain implements IBrain {
  readonly working: SqliteWorkingMemory;
  readonly episodic: SqliteEpisodicMemory;
  readonly recovery: SqliteRecoveryMemory;
  readonly memoryReview: SqliteMemoryReviewQueue;

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
    this.memoryReview = new SqliteMemoryReviewQueue(
      this.db,
      this.working,
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
      CREATE TABLE IF NOT EXISTS memory_review_candidates (
        id TEXT PRIMARY KEY,
        target_store TEXT NOT NULL,
        memory_key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        evidence_id TEXT,
        confidence REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        suppression_reason TEXT,
        reviewer TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE INDEX IF NOT EXISTS idx_memory_review_candidates_status
        ON memory_review_candidates(status, created_at);
      CREATE TABLE IF NOT EXISTS memory_review_provenance (
        target_store TEXT NOT NULL,
        memory_key TEXT NOT NULL,
        value TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        source TEXT NOT NULL,
        evidence_id TEXT,
        confidence REAL NOT NULL,
        reason TEXT NOT NULL,
        reviewer TEXT,
        note TEXT,
        approved_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION},
        PRIMARY KEY (target_store, memory_key)
      );
      CREATE TABLE IF NOT EXISTS memory_review_suppressions (
        signature TEXT PRIMARY KEY,
        suppression_reason TEXT NOT NULL,
        target_store TEXT NOT NULL,
        memory_key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        evidence_id TEXT,
        reason TEXT NOT NULL,
        reviewer TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
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

  serialize(): BrainSnapshot {
    this.flush();
    return {
      version: 1,
      timestamp: isoNow(),
      working: this.working.snapshot(),
      episodic: this.episodic.snapshotForHandoff(100),
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

      const finalizeWorkingMemoryFlush: { current: (() => void) | undefined } =
        { current: undefined };
      const restoreSnapshot = brain.db.transaction(() => {
        brain.working.restore(snapshot.working);
        finalizeWorkingMemoryFlush.current =
          brain.working.flushToDb() ?? undefined;

        brain.db.prepare(`DELETE FROM episodic_events`).run();
        brain.db.prepare(`DELETE FROM checkpoints`).run();

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
  const stores = ['working_memory', 'episodic_events', 'checkpoints'];
  const tableRows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as Array<{
    name: string;
  }>;
  const existingTables = new Set(tableRows.map((row) => row.name));
  const operations: MemorySchemaMigrationOperation[] = [];
  let fromVersion = CURRENT_MEMORY_SCHEMA_VERSION;

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
    `);
    for (const store of stores) {
      if (!existingTables.has(store)) continue;
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
  const stores = ['working_memory', 'episodic_events', 'checkpoints'];
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

function normalizeLearningKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readLearningKey(event: EpisodicEvent): string | undefined {
  const key = event.details?.learningKey;
  return typeof key === 'string' ? key : undefined;
}

function readLearningCooldownMs(event: EpisodicEvent): number | undefined {
  const cooldownMs = event.details?.learningCooldownMs;
  return typeof cooldownMs === 'number' ? cooldownMs : undefined;
}

function learningKeyDetailsPattern(key?: string): string {
  const keyPattern = key === undefined ? '' : JSON.stringify(key);
  return `%${escapeLike(`"learningKey":${keyPattern}`)}%`;
}

function compareEventsNewestFirst(a: EpisodicEvent, b: EpisodicEvent): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt)
    || (b.id ?? 0) - (a.id ?? 0);
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
