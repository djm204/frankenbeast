import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { resolve as resolvePath } from 'node:path';
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

export type MemoryAccessAuditStore =
  | 'working'
  | 'episodic'
  | 'recovery'
  | 'review'
  | 'privacy';

export type MemoryAccessAuditOutcome = 'success' | 'miss' | 'denied' | 'error';

export type MemoryAccessAuditOperation =
  | 'working.get'
  | 'working.set'
  | 'working.delete'
  | 'working.has'
  | 'working.keys'
  | 'working.snapshot'
  | 'working.restore'
  | 'working.clear'
  | 'working.flush'
  | 'episodic.record'
  | 'episodic.recordLearning'
  | 'episodic.recall'
  | 'episodic.recent'
  | 'episodic.recentFailures'
  | 'recovery.checkpoint'
  | 'recovery.lastCheckpoint'
  | 'recovery.listCheckpoints'
  | 'recovery.clearCheckpoints'
  | 'review.propose'
  | 'review.list'
  | 'review.edit'
  | 'review.approve'
  | 'review.reject'
  | 'review.neverStore'
  | 'review.provenanceFor'
  | 'privacy.rightToForget';

export interface MemoryAccessAuditEvent {
  id: number;
  operation: MemoryAccessAuditOperation;
  store: MemoryAccessAuditStore;
  outcome: MemoryAccessAuditOutcome;
  createdAt: string;
  keyHash?: string;
  queryHash?: string;
  details?: Record<string, unknown>;
}

export interface MemoryAccessAuditListOptions {
  limit?: number;
  store?: MemoryAccessAuditStore;
  operation?: MemoryAccessAuditOperation;
}

interface MemoryAccessAuditInput {
  operation: MemoryAccessAuditOperation;
  store: MemoryAccessAuditStore;
  outcome: MemoryAccessAuditOutcome;
  key?: string;
  query?: string;
  details?: Record<string, unknown>;
  createdAt?: string;
}

type MemoryAccessAuditRecorder = (event: MemoryAccessAuditInput) => void;

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
  'memory_review_candidates',
  'memory_review_provenance',
  'memory_review_suppressions',
  'memory_deletion_guards',
  'memory_deletion_hash_keys',
  'memory_access_audit_events',
] as const;

const ENCRYPTED_MEMORY_STORES = MEMORY_STORES.filter(
  (store) => store !== 'memory_access_audit_events',
);

const MEMORY_REVIEW_PAYLOAD_COLUMNS = [
  'value',
  'source',
  'evidence_id',
  'reason',
  'reviewer',
  'note',
] as const;
const NEVER_STORE_REDACTED_VALUE = '[never-store-redacted]';

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

function hashMemoryAccessValue(
  db: Database.Database,
  value: string,
  encryption?: MemoryCipher,
): string {
  return createHmac('sha256', readOrCreateDeletionHashKey(db, encryption))
    .update(value, 'utf8')
    .digest('hex');
}

function sanitizeMemoryAccessDetails(
  details: Record<string, unknown> | undefined,
): string | null {
  if (!details) return null;
  return JSON.stringify(details, (key, value) => {
    if (key === '') return value;
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => {
        if (
          entry === null
          || typeof entry === 'string'
          || typeof entry === 'number'
          || typeof entry === 'boolean'
        ) {
          return entry;
        }
        return '[redacted]';
      });
    }
    return '[redacted]';
  });
}

function parseMemoryAccessDetails(
  details: string | null,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const parsed = safeJsonParse(details);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return undefined;
}

function insertMemoryAccessAuditEvent(
  db: Database.Database,
  event: MemoryAccessAuditInput,
  encryption?: MemoryCipher,
): void {
  db.prepare(
    `INSERT INTO memory_access_audit_events (
      operation, store, key_hash, query_hash, outcome, details, created_at, schema_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`,
  ).run(
    event.operation,
    event.store,
    event.key === undefined ? null : hashMemoryAccessValue(db, event.key, encryption),
    event.query === undefined ? null : hashMemoryAccessValue(db, event.query, encryption),
    event.outcome,
    sanitizeMemoryAccessDetails(event.details),
    event.createdAt ?? isoNow(),
  );
}

interface MemoryAccessAuditRow {
  id: number;
  operation: MemoryAccessAuditOperation;
  store: MemoryAccessAuditStore;
  key_hash: string | null;
  query_hash: string | null;
  outcome: MemoryAccessAuditOutcome;
  details: string | null;
  created_at: string;
}

function rowToMemoryAccessAuditEvent(
  row: MemoryAccessAuditRow,
): MemoryAccessAuditEvent {
  const event: MemoryAccessAuditEvent = {
    id: row.id,
    operation: row.operation,
    store: row.store,
    outcome: row.outcome,
    createdAt: row.created_at,
  };
  if (row.key_hash) event.keyHash = row.key_hash;
  if (row.query_hash) event.queryHash = row.query_hash;
  const details = parseMemoryAccessDetails(row.details);
  if (details) event.details = details;
  return event;
}

export class SqliteMemoryAccessAuditTrail {
  constructor(
    private db: Database.Database,
    private encryption?: MemoryCipher,
  ) {}

  record(event: MemoryAccessAuditInput): void {
    insertMemoryAccessAuditEvent(this.db, event, this.encryption);
  }

  list(options: MemoryAccessAuditListOptions = {}): MemoryAccessAuditEvent[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.store) {
      clauses.push('store = ?');
      params.push(options.store);
    }
    if (options.operation) {
      clauses.push('operation = ?');
      params.push(options.operation);
    }
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError('Memory access audit limit must be a non-negative integer');
    }
    params.push(limit);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(
      `SELECT id, operation, store, key_hash, query_hash, outcome, details, created_at
       FROM memory_access_audit_events
       ${where}
       ORDER BY id DESC
       LIMIT ?`,
    ).all(...params) as MemoryAccessAuditRow[];
    return rows.map(rowToMemoryAccessAuditEvent);
  }
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
    private audit?: MemoryAccessAuditRecorder,
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
    this.audit?.({
      operation: 'working.flush',
      store: 'working',
      outcome: 'success',
      details: { changed: hasChanges },
    });
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

  persistKey(key: string, value: unknown): (() => void) | void {
    this.set(key, value);
    const serialized = this.serialized.get(key);
    if (serialized === undefined) return;
    if (this.persistedSerialized.get(key) === serialized) {
      const persistedRow = this.db
        .prepare(`SELECT value FROM working_memory WHERE key = ?`)
        .get(key) as { value: string } | undefined;
      const persistedValue = persistedRow
        ? (this.encryption?.decrypt(persistedRow.value) ?? persistedRow.value)
        : undefined;
      if (persistedValue === serialized) {
        this.dirtyKeys.delete(key);
        return;
      }
    }
    this.db
      .prepare(
        `INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES (?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, schema_version = excluded.schema_version
         WHERE working_memory.value IS NOT excluded.value`,
      )
      .run(key, this.encryption?.encrypt(serialized) ?? serialized, isoNow());
    const finalize = (): void => {
      this.persistedSerialized.set(key, serialized);
      this.deletedKeys.delete(key);
      this.dirtyKeys.delete(key);
    };
    if (!this.db.inTransaction) {
      finalize();
      return;
    }
    return finalize;
  }

  persistKeyAfterCommit(key: string, value: unknown): (() => void) | void {
    const { normalized, serialized, size } = this.prepareEntry(key, value);
    assertNotDeletionGuarded(this.db, key, serialized, this.encryption);

    if (!this.store.has(key) && this.store.size >= this.limits.maxEntries) {
      throw new WorkingMemoryLimitError(
        `Working memory is full: ${this.store.size} entries, maxEntries is ${this.limits.maxEntries}`,
      );
    }
    const previousSize = this.sizes.get(key) ?? 0;
    const newTotal = this.totalBytes - previousSize + size;
    if (
      !Number.isSafeInteger(newTotal) ||
      newTotal > this.limits.maxTotalBytes
    ) {
      throw new WorkingMemoryLimitError(
        `Working memory byte budget exceeded: ${newTotal} bytes, maxTotalBytes is ${this.limits.maxTotalBytes}`,
      );
    }

    let persistedValueMatches = false;
    if (this.persistedSerialized.get(key) === serialized) {
      const persistedRow = this.db
        .prepare(`SELECT value FROM working_memory WHERE key = ?`)
        .get(key) as { value: string } | undefined;
      const persistedValue = persistedRow
        ? (this.encryption?.decrypt(persistedRow.value) ?? persistedRow.value)
        : undefined;
      persistedValueMatches = persistedValue === serialized;
    }
    if (!persistedValueMatches) {
      this.db
        .prepare(
          `INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES (?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, schema_version = excluded.schema_version
           WHERE working_memory.value IS NOT excluded.value`,
        )
        .run(key, this.encryption?.encrypt(serialized) ?? serialized, isoNow());
    }
    const finalize = (): void => {
      this.store.set(key, normalized);
      this.sizes.set(key, size);
      this.serialized.set(key, serialized);
      this.totalBytes = newTotal;
      this.persistedSerialized.set(key, serialized);
      this.deletedKeys.delete(key);
      this.dirtyKeys.delete(key);
    };
    if (!this.db.inTransaction) {
      finalize();
      return;
    }
    return finalize;
  }

  purgeKey(key: string): (() => void) | void {
    if (this.store.has(key)) {
      this.totalBytes -= this.sizes.get(key) ?? 0;
      this.store.delete(key);
      this.sizes.delete(key);
      this.serialized.delete(key);
    }
    this.dirtyKeys.delete(key);
    this.deletedKeys.delete(key);
    this.db.prepare(`DELETE FROM working_memory WHERE key = ?`).run(key);
    const finalize = (): void => {
      this.persistedSerialized.delete(key);
      this.deletedKeys.delete(key);
      this.dirtyKeys.delete(key);
    };
    if (!this.db.inTransaction) {
      finalize();
      return;
    }
    return finalize;
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
      try {
        assertNotDeletionGuarded(this.db, key, serialized, this.encryption);
      } catch (error) {
        if (error instanceof MemoryDeletionGuardError) {
          const persisted = this.persistedSerialized.get(key);
          if (persisted !== undefined) {
            try {
              assertNotDeletionGuarded(this.db, key, persisted, this.encryption);
            } catch (persistedError) {
              if (persistedError instanceof MemoryDeletionGuardError) {
                continue;
              }
              throw persistedError;
            }
            const parsed = parseStoredWorkingMemoryValue(persisted);
            const preparedPersisted = this.prepareEntry(key, parsed);
            total += preparedPersisted.size;
            prepared.push([key, preparedPersisted.normalized, preparedPersisted.serialized, preparedPersisted.size]);
          }
          continue;
        }
        throw error;
      }
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
    if (this.expireRuntimeKeyIfGuarded(key)) {
      this.audit?.({
        operation: 'working.get',
        store: 'working',
        key,
        outcome: 'miss',
        details: { present: false, guarded: true },
      });
      return undefined;
    }
    const present = this.store.has(key);
    this.audit?.({
      operation: 'working.get',
      store: 'working',
      key,
      outcome: present ? 'success' : 'miss',
      details: { present },
    });
    return cloneStoredWorkingMemoryValue(this.store.get(key));
  }

  private expireRuntimeKeyIfGuarded(key: string): boolean {
    const serialized = this.serialized.get(key);
    if (serialized === undefined) return false;
    try {
      assertNotDeletionGuarded(this.db, key, serialized, this.encryption);
      return false;
    } catch (error) {
      if (!(error instanceof MemoryDeletionGuardError)) throw error;
      this.totalBytes -= this.sizes.get(key) ?? 0;
      this.store.delete(key);
      this.sizes.delete(key);
      this.serialized.delete(key);
      this.dirtyKeys.delete(key);
      this.deletedKeys.delete(key);
      const persisted = this.persistedSerialized.get(key);
      if (persisted === undefined) return true;
      try {
        assertNotDeletionGuarded(this.db, key, persisted, this.encryption);
      } catch (persistedError) {
        if (persistedError instanceof MemoryDeletionGuardError) {
          this.persistedSerialized.delete(key);
          return true;
        }
        throw persistedError;
      }
      const parsed = parseStoredWorkingMemoryValue(persisted);
      const { normalized, serialized: restoredSerialized, size } = this.prepareEntry(key, parsed);
      this.store.set(key, normalized);
      this.sizes.set(key, size);
      this.serialized.set(key, restoredSerialized);
      this.totalBytes += size;
      return false;
    }
  }

  private expireRuntimeKeysMatchingCurrentGuards(): void {
    for (const key of Array.from(this.store.keys())) {
      this.expireRuntimeKeyIfGuarded(key);
    }
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
    let serialized: string | undefined;
    try {
      const prepared = this.prepareEntry(key, value);
      serialized = prepared.serialized;
      assertNotDeletionGuarded(this.db, key, serialized, this.encryption);

      if (!this.store.has(key) && this.store.size >= this.limits.maxEntries) {
        throw new WorkingMemoryLimitError(
          `Working memory is full: ${this.store.size} entries, maxEntries is ${this.limits.maxEntries}`,
        );
      }
      const newTotal = this.totalBytes - (this.sizes.get(key) ?? 0) + prepared.size;
      if (
        !Number.isSafeInteger(newTotal) ||
        newTotal > this.limits.maxTotalBytes
      ) {
        throw new WorkingMemoryLimitError(
          `Working memory byte budget exceeded: ${newTotal} bytes, maxTotalBytes is ${this.limits.maxTotalBytes}`,
        );
      }

      this.store.set(key, prepared.normalized);
      this.sizes.set(key, prepared.size);
      this.serialized.set(key, serialized);
      this.totalBytes = newTotal;
      if (this.persistedSerialized.get(key) === serialized) {
        this.dirtyKeys.delete(key);
      } else {
        this.dirtyKeys.add(key);
      }
      this.deletedKeys.delete(key);
      this.audit?.({
        operation: 'working.set',
        store: 'working',
        key,
        outcome: 'success',
        details: { valueBytes: Buffer.byteLength(serialized, 'utf8') },
      });
    } catch (error) {
      this.audit?.({
        operation: 'working.set',
        store: 'working',
        key,
        outcome: error instanceof MemoryDeletionGuardError ? 'denied' : 'error',
        details: {
          errorName: error instanceof Error ? error.name : 'Error',
          ...(serialized === undefined
            ? {}
            : { valueBytes: Buffer.byteLength(serialized, 'utf8') }),
        },
      });
      throw error;
    }
  }

  delete(key: string): boolean {
    if (!this.store.has(key)) {
      this.audit?.({
        operation: 'working.delete',
        store: 'working',
        key,
        outcome: 'miss',
        details: { deleted: false },
      });
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
    const deleted = this.store.delete(key);
    this.audit?.({
      operation: 'working.delete',
      store: 'working',
      key,
      outcome: deleted ? 'success' : 'miss',
      details: { deleted },
    });
    return deleted;
  }

  snapshotIncludingPersistedEntries(options: { expireRuntimeGuardedEntries?: boolean } = {}): Array<{ key: string; value: unknown; source: 'persisted' | 'runtime' }> {
    const result: Array<{ key: string; value: unknown; source: 'persisted' | 'runtime' }> = [];
    for (const { key, value: serialized } of this.loadPersistedSerializedFromDb()) {
      result.push({
        key,
        value: parseStoredWorkingMemoryValue(serialized),
        source: 'persisted',
      });
    }
    for (const [key, value] of Object.entries(this.snapshotEntries({ expireGuardedEntries: options.expireRuntimeGuardedEntries ?? true }))) {
      result.push({
        key,
        value,
        source: 'runtime',
      });
    }
    return result;
  }

  deletePersistedKeys(keys: readonly string[]): (() => void) | undefined {
    if (keys.length === 0) return;
    const deleteKey = this.db.prepare(`DELETE FROM working_memory WHERE key = ?`);
    for (const key of keys) {
      deleteKey.run(key);
    }
    return () => {
      for (const key of keys) {
        this.persistedSerialized.delete(key);
        this.deletedKeys.delete(key);
      }
    };
  }

  deleteRuntimeKeys(keys: readonly string[]): void {
    for (const key of keys) {
      if (this.store.has(key)) {
        this.totalBytes -= this.sizes.get(key) ?? 0;
        this.store.delete(key);
        this.sizes.delete(key);
        this.serialized.delete(key);
      }
      this.dirtyKeys.delete(key);
      this.deletedKeys.delete(key);
      const persisted = this.persistedSerialized.get(key);
      if (persisted !== undefined) {
        const parsed = parseStoredWorkingMemoryValue(persisted);
        const { normalized, serialized, size } = this.prepareEntry(key, parsed);
        this.store.set(key, normalized);
        this.sizes.set(key, size);
        this.serialized.set(key, serialized);
        this.totalBytes += size;
      }
    }
  }

  expireRuntimeKeys(keys: readonly string[], selector: NormalizedRightToForgetSelector): void {
    for (const key of keys) {
      if (this.store.has(key)) {
        this.totalBytes -= this.sizes.get(key) ?? 0;
      }
      this.store.delete(key);
      this.sizes.delete(key);
      this.serialized.delete(key);
      this.dirtyKeys.delete(key);
      this.deletedKeys.delete(key);
      const persisted = this.persistedSerialized.get(key);
      if (persisted === undefined) continue;
      const parsed = parseStoredWorkingMemoryValue(persisted);
      if (workingEntryMatchesSelector(key, parsed, selector)) {
        this.persistedSerialized.delete(key);
        continue;
      }
      const { normalized, serialized, size } = this.prepareEntry(key, parsed);
      this.store.set(key, normalized);
      this.sizes.set(key, size);
      this.serialized.set(key, serialized);
      this.totalBytes += size;
    }
  }

  matchingRuntimeKeys(selector: NormalizedRightToForgetSelector, options: { expireGuardedEntries?: boolean } = {}): string[] {
    return Object.entries(this.snapshotEntries({ expireGuardedEntries: options.expireGuardedEntries ?? true }))
      .filter(([key, value]) => workingEntryMatchesSelector(key, value, selector))
      .map(([key]) => key);
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
    if (this.expireRuntimeKeyIfGuarded(key)) {
      this.audit?.({
        operation: 'working.has',
        store: 'working',
        key,
        outcome: 'miss',
        details: { present: false, guarded: true },
      });
      return false;
    }
    const present = this.store.has(key);
    this.audit?.({
      operation: 'working.has',
      store: 'working',
      key,
      outcome: present ? 'success' : 'miss',
      details: { present },
    });
    return present;
  }

  keys(): string[] {
    this.expireRuntimeKeysMatchingCurrentGuards();
    const keys = [...this.store.keys()];
    this.audit?.({
      operation: 'working.keys',
      store: 'working',
      outcome: 'success',
      details: { count: keys.length },
    });
    return keys;
  }

  private snapshotEntries(options: { expireGuardedEntries?: boolean } = {}): Record<string, unknown> {
    if (options.expireGuardedEntries ?? true) {
      this.expireRuntimeKeysMatchingCurrentGuards();
    }
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

  snapshot(): Record<string, unknown> {
    const snapshot = this.snapshotEntries();
    this.audit?.({
      operation: 'working.snapshot',
      store: 'working',
      outcome: 'success',
      details: { count: Object.keys(snapshot).length },
    });
    return snapshot;
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
      assertNotDeletionGuarded(this.db, key, serialized, this.encryption);
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
    this.audit?.({
      operation: 'working.restore',
      store: 'working',
      outcome: 'success',
      details: { count: prepared.length, totalBytes: total },
    });
  }

  clear(): void {
    this.store.clear();
    this.sizes.clear();
    this.serialized.clear();
    this.dirtyKeys.clear();
    this.deletedKeys = new Set(this.persistedSerialized.keys());
    this.totalBytes = 0;
    this.audit?.({
      operation: 'working.clear',
      store: 'working',
      outcome: 'success',
    });
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
    private audit?: MemoryAccessAuditRecorder,
  ) {}

  record(event: EpisodicEvent): void {
    try {
      assertEpisodicNotDeletionGuarded(this.db, event, this.encryption);
      this.insertEvent(event);
      this.audit?.({
        operation: 'episodic.record',
        store: 'episodic',
        outcome: 'success',
        details: { type: event.type },
      });
    } catch (error) {
      this.audit?.({
        operation: 'episodic.record',
        store: 'episodic',
        outcome: error instanceof MemoryDeletionGuardError ? 'denied' : 'error',
        details: { errorName: error instanceof Error ? error.name : 'Error' },
      });
      throw error;
    }
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
          this.audit?.({
            operation: 'episodic.recordLearning',
            store: 'episodic',
            outcome: 'success',
            details: { key, cooldownMs, recorded: false, reason: 'cooldown' },
          });
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

      const guardedEvent = {
        ...event,
        createdAt: normalizedCreatedAt,
        details: {
          ...(event.details ?? {}),
          learningKey: key,
          learningCooldownMs: cooldownMs,
        },
      };
      assertEpisodicNotDeletionGuarded(this.db, guardedEvent, this.encryption);
      this.insertEvent(guardedEvent);
      this.audit?.({
        operation: 'episodic.recordLearning',
        store: 'episodic',
        outcome: 'success',
        details: { key, cooldownMs, recorded: true },
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
    this.audit?.({
      operation: 'episodic.recall',
      store: 'episodic',
      query,
      outcome: 'success',
      details: { limit },
    });
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
    this.audit?.({
      operation: 'episodic.recentFailures',
      store: 'episodic',
      outcome: 'success',
      details: { limit: n },
    });
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
    this.audit?.({
      operation: 'episodic.recent',
      store: 'episodic',
      outcome: 'success',
      details: { limit: n },
    });
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
    private audit?: MemoryAccessAuditRecorder,
  ) {}

  checkpoint(state: ExecutionState): { id: string } {
    assertCheckpointNotDeletionGuarded(this.db, state, this.encryption);
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
    this.audit?.({
      operation: 'recovery.checkpoint',
      store: 'recovery',
      outcome: 'success',
      details: { checkpointId: result.id },
    });
    return result;
  }

  lastCheckpoint(): ExecutionState | null {
    this.audit?.({
      operation: 'recovery.lastCheckpoint',
      store: 'recovery',
      outcome: 'success',
    });
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
    this.audit?.({
      operation: 'recovery.listCheckpoints',
      store: 'recovery',
      outcome: 'success',
    });
    const rows = this.db
      .prepare(`SELECT id, created_at FROM checkpoints ORDER BY id ASC`)
      .all() as Array<{ id: number; created_at: string }>;
    return rows.map((r) => ({ id: String(r.id), timestamp: r.created_at }));
  }

  clearCheckpoints(): void {
    this.db.prepare(`DELETE FROM checkpoints`).run();
    this.audit?.({
      operation: 'recovery.clearCheckpoints',
      store: 'recovery',
      outcome: 'success',
    });
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

type ReviewPayloadRow = {
  id?: string;
  signature?: string;
  target_store: MemoryCandidateTargetStore;
  memory_key: string;
  value: string;
  source: string;
  evidence_id: string | null;
  reason: string;
  reviewer: string | null;
  note: string | null;
};

type ReviewPayloadMatch =
  | { table: 'memory_review_candidates'; id: string; key: string }
  | { table: 'memory_review_provenance'; targetStore: MemoryCandidateTargetStore; key: string }
  | { table: 'memory_review_suppressions'; signature: string; key: string };

export class SqliteMemoryReviewQueue {
  constructor(
    private db: Database.Database,
    private working: SqliteWorkingMemory,
    private dbPath: string,
    private encryption?: MemoryCipher,
    private audit?: MemoryAccessAuditRecorder,
  ) {}

  propose(proposal: MemoryCandidateProposal): MemoryCandidate {
    this.validateProposal(proposal);
    let result: MemoryCandidate | undefined;
    const tx = this.db.transaction(() => {
      assertMemoryCandidateNotDeletionGuarded(this.db, proposal, this.encryption, { checkNeverStore: false });
      const suppression = this.findCandidateSuppression(proposal);
      if (suppression) {
        result = this.suppressedCandidate(proposal, suppression);
        return;
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
      result = candidate;
    });
    tx.immediate();
    this.audit?.({
      operation: 'review.propose',
      store: 'review',
      key: result!.key,
      outcome: result!.status === 'suppressed' ? 'denied' : 'success',
      details: { status: result!.status },
    });
    return result!;
  }

  list(status: MemoryCandidateStatus = 'pending'): MemoryCandidate[] {
    this.audit?.({
      operation: 'review.list',
      store: 'review',
      outcome: 'success',
      details: { status },
    });
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
    assertMemoryCandidateNotDeletionGuarded(this.db, updated, this.encryption);
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
    const result = this.requireCandidate(id, 'pending');
    this.audit?.({
      operation: 'review.edit',
      store: 'review',
      key: result.key,
      outcome: 'success',
      details: { id, targetStore: result.targetStore },
    });
    return result;
  }

  approve(
    id: string,
    options: MemoryReviewDecisionOptions = {},
  ): MemoryCandidate {
    const now = isoNow();
    let finalizeWorkingFlush: (() => void) | undefined;
    let approvedCandidate: MemoryCandidate | undefined;
    const approveTx = this.db.transaction(() => {
      const candidate = this.requireCandidate(id);
      if (candidate.status === 'suppressed') {
        approvedCandidate = candidate;
        return;
      }
      if (candidate.status !== 'pending') {
        throw new Error(
          `Memory candidate ${id} is ${candidate.status}, expected pending`,
        );
      }
      this.assertDecisionOptionsNotDeletionGuarded(options);
      const suppressionReason = this.findCandidateSuppression(candidate);
      if (suppressionReason) {
        this.markSuppressed(id, suppressionReason, now, options);
        approvedCandidate = this.requireCandidate(id);
        return;
      }
      finalizeWorkingFlush =
        this.working.persistKeyAfterCommit(candidate.key, candidate.value) ?? undefined;
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
      approvedCandidate = this.requireCandidate(id);
    });
    approveTx.immediate();
    finalizeWorkingFlush?.();
    const result = approvedCandidate ?? this.requireCandidate(id);
    this.audit?.({
      operation: 'review.approve',
      store: 'review',
      key: result.key,
      outcome: 'success',
      details: { id, status: result.status, targetStore: result.targetStore },
    });
    return result;
  }

  reject(
    id: string,
    options: MemoryReviewDecisionOptions = {},
  ): MemoryCandidate {
    const now = isoNow();
    let rejectedCandidate: MemoryCandidate | undefined;
    const tx = this.db.transaction(() => {
      const candidate = this.requireCandidate(id, 'pending');
      this.assertDecisionOptionsNotDeletionGuarded(options);
      this.insertSuppression(candidate, 'rejected', now, options);
      this.markDecision(id, 'rejected', now, options);
      rejectedCandidate = this.requireCandidate(id);
    });
    tx.immediate();
    const result = rejectedCandidate ?? this.requireCandidate(id, 'rejected');
    this.audit?.({
      operation: 'review.reject',
      store: 'review',
      key: result.key,
      outcome: 'success',
      details: { id, status: result.status, targetStore: result.targetStore },
    });
    return result;
  }

  neverStore(
    id: string,
    options: MemoryReviewDecisionOptions = {},
  ): MemoryCandidate {
    const now = isoNow();
    let finalizeWorkingFlush: (() => void) | undefined;
    let neverStoredCandidate: MemoryCandidate | undefined;
    const tx = this.db.transaction(() => {
      const candidate = this.requireCandidate(id, 'pending');
      this.assertDecisionOptionsNotDeletionGuarded(options);
      this.insertSuppression(candidate, 'never_store', now, options);
      finalizeWorkingFlush = this.working.purgeKey(candidate.key) ?? undefined;
      this.db
        .prepare(
          `DELETE FROM memory_review_provenance WHERE target_store = ? AND memory_key = ?`,
        )
        .run(candidate.targetStore, candidate.key);
      this.markDecision(id, 'never_store', now, options, {
        value: NEVER_STORE_REDACTED_VALUE,
      });
      this.redactNeverStoreRows(candidate, now);
      neverStoredCandidate = this.requireCandidate(id);
    });
    tx.immediate();
    finalizeWorkingFlush?.();
    purgeDeletedSqliteContent(this.db, this.dbPath);
    const result = neverStoredCandidate ?? this.requireCandidate(id, 'never_store');
    this.audit?.({
      operation: 'review.neverStore',
      store: 'review',
      key: result.key,
      outcome: 'success',
      details: { id, status: result.status, targetStore: result.targetStore },
    });
    return result;
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
    const result = row ? this.rowToProvenance(row) : null;
    this.audit?.({
      operation: 'review.provenanceFor',
      store: 'review',
      key,
      outcome: result ? 'success' : 'miss',
      details: { targetStore },
    });
    return result;
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

  private assertDecisionOptionsNotDeletionGuarded(
    options: MemoryReviewDecisionOptions,
  ): void {
    if (!options.reviewer && !options.note) return;
    assertNotDeletionGuarded(
      this.db,
      'memory-review-decision',
      stringifyWorkingMemoryValue('memory-review-decision', {
        reviewer: options.reviewer,
        note: options.note,
      }),
      this.encryption,
    );
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
    overrides: { value?: unknown } = {},
  ): void {
    const result = this.db
      .prepare(
        `UPDATE memory_review_candidates
         SET status = ?, value = COALESCE(?, value), reviewer = ?, note = ?, updated_at = ?, decided_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(
        status,
        overrides.value === undefined ? null : this.encodeValue(overrides.value),
        options.reviewer ? this.encodeText(options.reviewer) : null,
        options.note ? this.encodeText(options.note) : null,
        decidedAt,
        decidedAt,
        id,
      );
    if (result.changes !== 1) {
      throw new Error(`Memory candidate ${id} is no longer pending`);
    }
  }

  private markSuppressed(
    id: string,
    suppressionReason: MemorySuppressionReason,
    decidedAt: string,
    options: MemoryReviewDecisionOptions,
  ): void {
    this.db
      .prepare(
        `UPDATE memory_review_candidates
         SET status = 'suppressed', suppression_reason = ?, value = COALESCE(?, value), reviewer = ?, note = ?, updated_at = ?, decided_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(
        suppressionReason,
        suppressionReason === 'never_store'
          ? this.encodeValue(NEVER_STORE_REDACTED_VALUE)
          : null,
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
    if (!signature) {
      throw new Error('Unable to create memory review suppression signature');
    }
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
        this.encodeValue(
          reason === 'never_store' ? NEVER_STORE_REDACTED_VALUE : candidate.value,
        ),
        this.encodeText(candidate.source),
        candidate.evidenceId ? this.encodeText(candidate.evidenceId) : null,
        this.encodeText(candidate.reason),
        options.reviewer ? this.encodeText(options.reviewer) : null,
        options.note ? this.encodeText(options.note) : null,
        createdAt,
      );
    this.markMatchingPendingSuppressed(candidate, reason, createdAt, options);
  }

  private markMatchingPendingSuppressed(
    candidate: MemoryCandidate,
    suppressionReason: MemorySuppressionReason,
    decidedAt: string,
    options: MemoryReviewDecisionOptions,
  ): void {
    const rows = this.db
      .prepare(`SELECT * FROM memory_review_candidates WHERE status = 'pending'`)
      .all() as MemoryCandidateRow[];
    for (const row of rows) {
      if (row.id === candidate.id) continue;
      const pending = this.rowToCandidate(row);
      if (this.suppressionMatchesPending(pending, candidate, suppressionReason)) {
        this.markSuppressed(pending.id, suppressionReason, decidedAt, options);
      }
    }
  }

  private redactNeverStoreRows(candidate: MemoryCandidate, redactedAt: string): void {
    this.db
      .prepare(
        `UPDATE memory_review_candidates
         SET value = ?, source = ?, evidence_id = NULL, reason = ?, reviewer = NULL, note = NULL, updated_at = ?
         WHERE target_store = ? AND memory_key = ?`,
      )
      .run(
        this.encodeValue(NEVER_STORE_REDACTED_VALUE),
        this.encodeText(NEVER_STORE_REDACTED_VALUE),
        this.encodeText(NEVER_STORE_REDACTED_VALUE),
        redactedAt,
        candidate.targetStore,
        candidate.key,
      );
    this.db
      .prepare(
        `UPDATE memory_review_suppressions
         SET value = ?, source = ?, evidence_id = NULL, reason = ?, reviewer = NULL, note = NULL
         WHERE target_store = ? AND memory_key = ?`,
      )
      .run(
        this.encodeValue(NEVER_STORE_REDACTED_VALUE),
        this.encodeText(NEVER_STORE_REDACTED_VALUE),
        this.encodeText(NEVER_STORE_REDACTED_VALUE),
        candidate.targetStore,
        candidate.key,
      );
  }

  private suppressionMatchesPending(
    pending: MemoryCandidate,
    decided: MemoryCandidate,
    suppressionReason: MemorySuppressionReason,
  ): boolean {
    if (pending.targetStore !== decided.targetStore || pending.key !== decided.key) {
      return false;
    }
    if (suppressionReason === 'never_store') return true;
    return this.suppressionSignature(pending, suppressionReason) ===
      this.suppressionSignature(decided, suppressionReason);
  }

  private findCandidateSuppression(
    candidate: MemoryCandidateProposal,
  ): MemorySuppressionReason | null {
    return (
      this.findSuppression(this.neverStoreSignature(candidate, { createKey: false })) ??
      this.findSuppression(this.rejectedSignature(candidate, { createKey: false })) ??
      this.findMatchingSuppression(candidate)
    );
  }

  private findMatchingSuppression(
    candidate: MemoryCandidateProposal,
  ): MemorySuppressionReason | null {
    const candidateValue = stableStringify(canonicalMemoryValue(candidate.value));
    const rows = this.db
      .prepare(`SELECT * FROM memory_review_suppressions WHERE target_store = ? AND memory_key = ?`)
      .all(candidate.targetStore, candidate.key) as Array<{
        suppression_reason: MemorySuppressionReason;
        target_store: MemoryCandidateTargetStore;
        memory_key: string;
        value: string;
        source: string;
        evidence_id: string | null;
      }>;
    for (const row of rows) {
      if (row.suppression_reason === 'never_store') return 'never_store';
      if (stableStringify(canonicalMemoryValue(this.decodeValue(row.value))) !== candidateValue) {
        continue;
      }
      if (
        this.decodeText(row.source) === candidate.source &&
        (row.evidence_id ? this.decodeText(row.evidence_id) : undefined) ===
          candidate.evidenceId
      ) {
        return 'rejected';
      }
    }
    return null;
  }

  private findSuppression(signature: string | undefined): MemorySuppressionReason | null {
    if (!signature) return null;
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
    const safeProposal = suppressionReason === 'never_store'
      ? { ...proposal, value: NEVER_STORE_REDACTED_VALUE }
      : proposal;
    return {
      ...safeProposal,
      id: `memcand_suppressed_${createHash('sha256')
        .update(this.suppressionSignature(proposal, suppressionReason) ?? '')
        .digest('hex')
        .slice(0, 16)}`,
      status: 'suppressed',
      suppressionReason,
      createdAt: now,
      updatedAt: now,
    };
  }

  private rejectedSignature(
    proposal: MemoryCandidateProposal,
    options: { createKey?: boolean } = {},
  ): string | undefined {
    return this.suppressionSignature(proposal, 'rejected', options);
  }

  private neverStoreSignature(
    proposal: MemoryCandidateProposal,
    options: { createKey?: boolean } = {},
  ): string | undefined {
    return this.suppressionSignature(proposal, 'never_store', options);
  }

  private suppressionSignature(
    proposal: MemoryCandidateProposal,
    suppressionReason: MemorySuppressionReason,
    options: { createKey?: boolean } = {},
  ): string | undefined {
    const normalizedValue = canonicalMemoryValue(proposal.value);
    return keyedMemorySignature(
      this.db,
      suppressionReason === 'never_store'
        ? [
            'never_store',
            proposal.targetStore,
            proposal.key,
          ]
        : [
            'rejected',
            proposal.targetStore,
            proposal.key,
            proposal.source,
            proposal.evidenceId ?? '',
            stableStringify(normalizedValue),
          ],
      this.encryption,
      options,
    );
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

function keyedMemorySignature(
  db: Database.Database,
  parts: unknown[],
  encryption?: MemoryCipher,
  options: { createKey?: boolean } = {},
): string | undefined {
  const serialized = stableStringify(parts);
  if (options.createKey === false) {
    return existingKeyedDeletionHash(db, serialized, encryption);
  }
  return keyedDeletionHash(db, serialized, encryption);
}

function canonicalMemoryValue(value: unknown): unknown {
  return parseStoredWorkingMemoryValue(
    stringifyWorkingMemoryValue('memory candidate', value),
  );
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

const liveSqliteBrainsByPath = new Map<string, Set<SqliteBrain>>();

function normalizeSqliteDbPath(dbPath: string): string {
  return dbPath === ':memory:' ? dbPath : resolvePath(dbPath);
}

export class SqliteBrain implements IBrain {
  readonly working: SqliteWorkingMemory;
  readonly episodic: SqliteEpisodicMemory;
  readonly recovery: SqliteRecoveryMemory;
  readonly memoryReview: SqliteMemoryReviewQueue;
  readonly accessAudit: SqliteMemoryAccessAuditTrail;

  private db: Database.Database;
  private readonly dbPath: string;
  private readonly encryption: MemoryCipher | undefined;

  constructor(
    dbPath: string = ':memory:',
    workingMemoryLimits?: Partial<WorkingMemoryLimits>,
    options: SqliteBrainOptions = {},
  ) {
    this.dbPath = normalizeSqliteDbPath(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('secure_delete = ON');
    assertSupportedMemorySchema(this.db);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
    migrateMemorySchemaDatabase(this.db, dbPath, { dryRun: false });
    const encryption = makeMemoryCipher(options.encryption);
    this.encryption = encryption;
    assertMemoryEncryptionState(this.db, dbPath, encryption);
    this.accessAudit = new SqliteMemoryAccessAuditTrail(this.db, encryption);
    this.working = new SqliteWorkingMemory(
      this.db,
      {
        ...DEFAULT_WORKING_MEMORY_LIMITS,
        ...workingMemoryLimits,
      },
      options.hydrateWorkingMemoryFromDb ?? true,
      encryption,
      (event) => this.accessAudit.record(event),
    );
    this.episodic = new SqliteEpisodicMemory(
      this.db,
      encryption,
      (event) => this.accessAudit.record(event),
    );
    this.recovery = new SqliteRecoveryMemory(
      this.db,
      () => this.working.flushToDb(),
      encryption,
      (event) => this.accessAudit.record(event),
    );
    this.memoryReview = new SqliteMemoryReviewQueue(
      this.db,
      this.working,
      this.dbPath,
      encryption,
      (event) => this.accessAudit.record(event),
    );
    SqliteBrain.registerLiveBrain(this.dbPath, this);
  }

  private static registerLiveBrain(dbPath: string, brain: SqliteBrain): void {
    if (dbPath === ':memory:') return;
    let liveBrains = liveSqliteBrainsByPath.get(dbPath);
    if (!liveBrains) {
      liveBrains = new Set<SqliteBrain>();
      liveSqliteBrainsByPath.set(dbPath, liveBrains);
    }
    liveBrains.add(brain);
  }

  private static unregisterLiveBrain(dbPath: string, brain: SqliteBrain): void {
    const liveBrains = liveSqliteBrainsByPath.get(dbPath);
    if (!liveBrains) return;
    liveBrains.delete(brain);
    if (liveBrains.size === 0) {
      liveSqliteBrainsByPath.delete(dbPath);
    }
  }

  private static expireLiveWorkingMatches(dbPath: string, selector: NormalizedRightToForgetSelector): void {
    const normalizedDbPath = normalizeSqliteDbPath(dbPath);
    if (normalizedDbPath === ':memory:' || selector.type === 'episodic') return;
    const liveBrains = liveSqliteBrainsByPath.get(normalizedDbPath);
    if (!liveBrains) return;
    for (const brain of liveBrains) {
      const keys = brain.working.matchingRuntimeKeys(selector);
      brain.working.expireRuntimeKeys(keys, selector);
    }
  }

  private static matchingLiveWorkingKeys(dbPath: string, selector: NormalizedRightToForgetSelector, options: { expireRuntimeGuards?: boolean } = {}): string[] {
    const normalizedDbPath = normalizeSqliteDbPath(dbPath);
    if (normalizedDbPath === ':memory:' || selector.type === 'episodic') return [];
    const liveBrains = liveSqliteBrainsByPath.get(normalizedDbPath);
    if (!liveBrains) return [];
    return Array.from(new Set(Array.from(liveBrains).flatMap(brain => brain.working.matchingRuntimeKeys(selector, { expireGuardedEntries: options.expireRuntimeGuards ?? true }))));
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
      CREATE INDEX IF NOT EXISTS idx_memory_review_suppressions_target_key
        ON memory_review_suppressions(target_store, memory_key);
      CREATE TABLE IF NOT EXISTS memory_deletion_guards (
        selector_hash TEXT NOT NULL,
        guard_kind TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION},
        PRIMARY KEY (guard_kind, value_hash)
      );
      CREATE TABLE IF NOT EXISTS memory_deletion_hash_keys (
        id TEXT PRIMARY KEY,
        key_material TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE TABLE IF NOT EXISTS memory_access_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        store TEXT NOT NULL,
        key_hash TEXT,
        query_hash TEXT,
        outcome TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE INDEX IF NOT EXISTS idx_memory_access_audit_created
        ON memory_access_audit_events(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_access_audit_operation
        ON memory_access_audit_events(store, operation, created_at DESC);
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
    const dryRun = normalizedSelector.dryRun ?? false;
    const selectorHash = hashSelector(this.db, normalizedSelector, this.encryption
      ? { createKey: !dryRun, encryption: this.encryption }
      : { createKey: !dryRun });
    const memoryType = normalizedSelector.type ?? 'all';
    let deletedWorkingKeys = new Set<string>();
    let runtimeWorkingKeysToDelete = new Set<string>();
    let episodicMatchCount = 0;
    let checkpointMatchCount = 0;
    let reviewMatchCount = 0;
    let finalizePersistedWorkingDelete: (() => void) | undefined;

    if (dryRun) {
      const workingMatches = memoryType === 'episodic'
        ? []
        : this.matchingWorkingKeys(normalizedSelector, { expireRuntimeGuards: false });
      deletedWorkingKeys = new Set(workingMatches.map(match => match.key));
      const reviewMatches = memoryType === 'episodic'
        ? []
        : this.matchingReviewPayloads(normalizedSelector);
      for (const key of this.reviewWorkingKeysToDelete(reviewMatches)) {
        deletedWorkingKeys.add(key);
      }
      for (const key of SqliteBrain.matchingLiveWorkingKeys(this.dbPath, normalizedSelector, { expireRuntimeGuards: false })) {
        deletedWorkingKeys.add(key);
      }
      episodicMatchCount = memoryType === 'working'
        ? 0
        : this.matchingEpisodicIds(normalizedSelector).length;
      checkpointMatchCount = memoryType === 'all'
        ? this.matchingCheckpointIds(normalizedSelector).length
        : 0;
      reviewMatchCount = memoryType === 'episodic'
        ? 0
        : this.matchingReviewPayloads(normalizedSelector).length;
    } else {
      const tx = this.db.transaction(() => {
        const workingMatches = memoryType === 'episodic'
          ? []
          : this.matchingWorkingKeys(normalizedSelector, { expireRuntimeGuards: true });
        const persistedWorkingMatches = new Set(workingMatches.filter(match => match.source === 'persisted').map(match => match.key));
        runtimeWorkingKeysToDelete = new Set(workingMatches.filter(match => match.source === 'runtime').map(match => match.key));
        deletedWorkingKeys = new Set(workingMatches.map(match => match.key));
        for (const key of SqliteBrain.matchingLiveWorkingKeys(this.dbPath, normalizedSelector, { expireRuntimeGuards: true })) {
          deletedWorkingKeys.add(key);
          runtimeWorkingKeysToDelete.add(key);
        }
        const episodicMatches = memoryType === 'working'
          ? []
          : this.matchingEpisodicIds(normalizedSelector);
        const checkpointMatches = memoryType === 'all'
          ? this.matchingCheckpointIds(normalizedSelector)
          : [];
        const reviewMatches = memoryType === 'episodic'
          ? []
          : this.matchingReviewPayloads(normalizedSelector);
        for (const key of this.reviewWorkingKeysToDelete(reviewMatches)) {
          persistedWorkingMatches.add(key);
          runtimeWorkingKeysToDelete.add(key);
          deletedWorkingKeys.add(key);
        }
        episodicMatchCount = episodicMatches.length;
        checkpointMatchCount = checkpointMatches.length;
        reviewMatchCount = reviewMatches.length;
        finalizePersistedWorkingDelete = this.working.deletePersistedKeys(Array.from(persistedWorkingMatches));
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
        this.redactReviewPayloadMatches(reviewMatches, isoNow());
        writeDeletionGuards(this.db, normalizedSelector, selectorHash, this.encryption);
        const auditSummary = 'Right-to-forget deletion completed';
        const auditDetails = JSON.stringify({
          selectorHash,
          deleted: {
            working: deletedWorkingKeys.size,
            episodic: episodicMatchCount,
            derived: episodicMatchCount + checkpointMatchCount + reviewMatchCount,
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
      const auditEventId = tx() as number;
      if (deletedWorkingKeys.size > 0 || episodicMatchCount > 0 || checkpointMatchCount > 0 || reviewMatchCount > 0) {
        finalizePersistedWorkingDelete?.();
        this.working.deleteRuntimeKeys(Array.from(runtimeWorkingKeysToDelete));
        purgeDeletedSqliteContent(this.db, this.dbPath);
      }
      SqliteBrain.expireLiveWorkingMatches(this.dbPath, normalizedSelector);
      const accessEvent: MemoryAccessAuditInput = {
        operation: 'privacy.rightToForget',
        store: 'privacy',
        outcome: 'success',
        details: {
          selectorHash,
          dryRun: false,
          deletedWorking: deletedWorkingKeys.size,
          deletedEpisodic: episodicMatchCount,
        },
      };
      if (normalizedSelector.query !== undefined) accessEvent.query = normalizedSelector.query;
      if (normalizedSelector.key !== undefined) accessEvent.key = normalizedSelector.key;
      this.accessAudit.record(accessEvent);
      return {
        selectorHash,
        dryRun,
        deleted: {
          working: deletedWorkingKeys.size,
          episodic: episodicMatchCount,
          derived: episodicMatchCount + checkpointMatchCount + reviewMatchCount,
        },
        remainingReferences: this.countRemainingReferences(normalizedSelector, { expireRuntimeGuards: true }),
        auditEventId,
      };
    }

    return {
      selectorHash,
      dryRun,
      deleted: {
        working: deletedWorkingKeys.size,
        episodic: episodicMatchCount,
        derived: episodicMatchCount + checkpointMatchCount + reviewMatchCount,
      },
      remainingReferences: this.countRemainingReferences(normalizedSelector, { expireRuntimeGuards: false }),
    };
  }

  private matchingWorkingKeys(selector: NormalizedRightToForgetSelector, options: { expireRuntimeGuards?: boolean } = {}): Array<{ key: string; source: 'persisted' | 'runtime' }> {
    return this.working.snapshotIncludingPersistedEntries({ expireRuntimeGuardedEntries: options.expireRuntimeGuards ?? true })
      .filter(({ key, value }) => workingEntryMatchesSelector(key, value, selector))
      .map(({ key, source }) => ({ key, source }));
  }

  private matchingEpisodicIds(selector: NormalizedRightToForgetSelector): number[] {
    const rows = this.db.prepare(`SELECT id, step, summary, details FROM episodic_events`).all() as Array<{
      id: number;
      step: string | null;
      summary: string;
      details: string | null;
    }>;
    return rows
      .filter((row) => {
        const step = row.step ?? '';
        const summary = this.encryption?.decrypt(row.summary) ?? row.summary;
        const details = row.details ? (this.encryption?.decrypt(row.details) ?? row.details) : null;
        const parsedDetails = details === null ? null : safeJsonParse(details);
        const eventDetails = parsedDetails !== null && typeof parsedDetails === 'object' && !Array.isArray(parsedDetails)
          ? parsedDetails as Record<string, unknown>
          : undefined;
        const candidateEvent: EpisodicEvent = {
          id: row.id,
          type: 'observation',
          step,
          summary,
          createdAt: '',
          ...(eventDetails === undefined ? {} : { details: eventDetails }),
        };
        if (isRightToForgetAuditEvent(candidateEvent)) return false;
        return episodicRowMatchesSelector(step, summary, details, selector);
      })
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

  private matchingReviewPayloads(selector: NormalizedRightToForgetSelector): ReviewPayloadMatch[] {
    const matches: ReviewPayloadMatch[] = [];
    for (const row of this.db.prepare(
      `SELECT id, target_store, memory_key, value, source, evidence_id, reason, reviewer, note FROM memory_review_candidates`,
    ).all() as ReviewPayloadRow[]) {
      if (row.id && this.reviewPayloadRowMatchesSelector(row, selector)) {
        matches.push({ table: 'memory_review_candidates', id: row.id, key: row.memory_key });
      }
    }
    for (const row of this.db.prepare(
      `SELECT target_store, memory_key, value, source, evidence_id, reason, reviewer, note FROM memory_review_provenance`,
    ).all() as ReviewPayloadRow[]) {
      if (this.reviewPayloadRowMatchesSelector(row, selector)) {
        matches.push({ table: 'memory_review_provenance', targetStore: row.target_store, key: row.memory_key });
      }
    }
    for (const row of this.db.prepare(
      `SELECT signature, target_store, memory_key, value, source, evidence_id, reason, reviewer, note FROM memory_review_suppressions`,
    ).all() as ReviewPayloadRow[]) {
      if (row.signature && this.reviewPayloadRowMatchesSelector(row, selector)) {
        matches.push({ table: 'memory_review_suppressions', signature: row.signature, key: row.memory_key });
      }
    }
    return matches;
  }

  private reviewWorkingKeysToDelete(matches: ReviewPayloadMatch[]): string[] {
    return Array.from(new Set(matches
      .filter((match): match is Extract<ReviewPayloadMatch, { table: 'memory_review_provenance' }> =>
        match.table === 'memory_review_provenance' && match.targetStore === 'working',
      )
      .map(match => match.key)));
  }

  private reviewPayloadRowMatchesSelector(row: ReviewPayloadRow, selector: NormalizedRightToForgetSelector): boolean {
    return reviewPayloadMatchesSelector(
      row.memory_key,
      {
        value: parseStoredWorkingMemoryValue(this.encryption?.decrypt(row.value) ?? row.value),
        source: this.encryption?.decrypt(row.source) ?? row.source,
        evidenceId: row.evidence_id ? this.encryption?.decrypt(row.evidence_id) ?? row.evidence_id : undefined,
        reason: this.encryption?.decrypt(row.reason) ?? row.reason,
        reviewer: row.reviewer ? this.encryption?.decrypt(row.reviewer) ?? row.reviewer : undefined,
        note: row.note ? this.encryption?.decrypt(row.note) ?? row.note : undefined,
      },
      selector,
    );
  }

  private redactReviewPayloadMatches(matches: ReviewPayloadMatch[], redactedAt: string): void {
    if (matches.length === 0) return;
    const redactCandidates = this.db.prepare(
      `UPDATE memory_review_candidates
       SET memory_key = ?, value = ?, source = ?, evidence_id = NULL, reason = ?, reviewer = NULL, note = NULL,
           status = CASE WHEN status = 'pending' THEN 'suppressed' ELSE status END,
           suppression_reason = CASE WHEN status = 'pending' THEN 'never_store' ELSE suppression_reason END,
           decided_at = CASE WHEN status = 'pending' THEN ? ELSE decided_at END,
           updated_at = ?
       WHERE id = ?`,
    );
    const redactProvenance = this.db.prepare(
      `UPDATE memory_review_provenance
       SET memory_key = ?, value = ?, source = ?, evidence_id = NULL, reason = ?, reviewer = NULL, note = NULL
       WHERE target_store = ? AND memory_key = ?`,
    );
    const redactSuppression = this.db.prepare(
      `UPDATE memory_review_suppressions
       SET memory_key = ?, value = ?, source = ?, evidence_id = NULL, reason = ?, reviewer = NULL, note = NULL
       WHERE signature = ?`,
    );
    const redactedValue = this.encryption?.encrypt(stringifyWorkingMemoryValue('memory candidate', NEVER_STORE_REDACTED_VALUE)) ?? stringifyWorkingMemoryValue('memory candidate', NEVER_STORE_REDACTED_VALUE);
    const redactedText = this.encryption?.encrypt(NEVER_STORE_REDACTED_VALUE) ?? NEVER_STORE_REDACTED_VALUE;
    for (const match of matches) {
      const redactedKey = this.redactedReviewKey(match.key, redactedAt);
      if (match.table === 'memory_review_candidates') {
        redactCandidates.run(redactedKey, redactedValue, redactedText, redactedText, redactedAt, redactedAt, match.id);
      } else if (match.table === 'memory_review_provenance') {
        redactProvenance.run(redactedKey, redactedValue, redactedText, redactedText, match.targetStore, match.key);
      } else {
        redactSuppression.run(redactedKey, redactedValue, redactedText, redactedText, match.signature);
      }
    }
  }

  private redactedReviewKey(_key: string, _redactedAt: string): string {
    const suffix = randomBytes(12).toString('base64url');
    return `${NEVER_STORE_REDACTED_VALUE}:${suffix}`;
  }

  private countRemainingReferences(selector: NormalizedRightToForgetSelector, options: { expireRuntimeGuards?: boolean } = {}): number {
    const memoryType = selector.type ?? 'all';
    let count = 0;
    if (memoryType !== 'episodic') {
      count += new Set([
        ...this.matchingWorkingKeys(selector, { expireRuntimeGuards: options.expireRuntimeGuards ?? true }).map(match => match.key),
        ...SqliteBrain.matchingLiveWorkingKeys(this.dbPath, selector, { expireRuntimeGuards: options.expireRuntimeGuards ?? true }),
      ]).size;
    }
    if (memoryType !== 'working') {
      count += this.matchingEpisodicIds(selector).length;
    }
    if (memoryType === 'all') {
      count += this.matchingCheckpointIds(selector).length;
    }
    if (memoryType !== 'episodic') {
      count += this.matchingReviewPayloads(selector).length;
    }
    return count;
  }

  serialize(): BrainSnapshot {
    this.flush();
    const deletionGuardHashKey = readDeletionHashKey(this.db, this.encryption);
    return {
      version: 1,
      timestamp: isoNow(),
      working: this.working.snapshot(),
      episodic: this.episodic.snapshotForHandoff(100),
      checkpoint: this.recovery.lastCheckpoint(),
      deletionGuards: readDeletionGuardSnapshot(this.db),
      ...(deletionGuardHashKey ? { deletionGuardHashKey } : {}),
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
      const snapshotDeletionGuards: MemoryDeletionGuardSnapshot[] = snapshot.deletionGuards ?? [];
      if (!snapshot.deletionGuardHashKey && snapshotDeletionGuards.some(guard => !isLegacyDeletionGuardSnapshot(guard))) {
        throw new MemoryDeletionGuardError('Refusing to hydrate snapshot with keyed deletion guards but no right-to-forget hash key material');
      }
      if (snapshot.deletionGuardHashKey) {
        const existingDeletionHashKey = readDeletionHashKey(brain.db, brain.encryption);
        if (
          existingDeletionHashKey
          && existingDeletionHashKey !== snapshot.deletionGuardHashKey
          && (snapshotDeletionGuards.length > 0 || countDeletionGuards(brain.db) > 0)
        ) {
          throw new MemoryDeletionGuardError('Refusing to hydrate snapshot with deletion guards that use different right-to-forget hash key material');
        }
      }

      const finalizeWorkingMemoryFlush: { current: (() => void) | undefined } =
        { current: undefined };
      const restoreSnapshot = brain.db.transaction(() => {
        brain.db.prepare(`DELETE FROM episodic_events`).run();
        brain.db.prepare(`DELETE FROM checkpoints`).run();
        if (snapshot.deletionGuardHashKey && snapshotDeletionGuards.length > 0) {
          writeDeletionHashKey(brain.db, snapshot.deletionGuardHashKey, brain.encryption);
        }
        for (const guard of snapshotDeletionGuards) {
          if (guard.schemaVersion > CURRENT_MEMORY_SCHEMA_VERSION) {
            throw new UnsupportedMemorySchemaVersionError(
              `Unsupported memory_deletion_guards schema version ${guard.schemaVersion}; current version is ${CURRENT_MEMORY_SCHEMA_VERSION}`,
            );
          }
          insertDeletionGuard.run(
            guard.selectorHash,
            guard.guardKind,
            guard.valueHash,
            guard.createdAt,
            guard.schemaVersion,
          );
        }

        brain.db.prepare(`DELETE FROM memory_review_candidates`).run();
        brain.db.prepare(`DELETE FROM memory_review_provenance`).run();
        brain.db.prepare(`DELETE FROM memory_review_suppressions`).run();

        brain.working.restore(snapshot.working);
        finalizeWorkingMemoryFlush.current =
          brain.working.flushToDb() ?? undefined;

        for (const event of snapshot.episodic) {
          if (!isRightToForgetAuditEvent(event)) {
            assertEpisodicNotDeletionGuarded(brain.db, event, brain.encryption);
          }
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
          assertCheckpointNotDeletionGuarded(brain.db, snapshot.checkpoint, brain.encryption);
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
    SqliteBrain.unregisterLiveBrain(this.dbPath, this);
    this.db.close();
  }
}

function migrateMemorySchemaDatabase(
  db: Database.Database,
  dbPath: string,
  options: MemorySchemaMigrationOptions = {},
): MemorySchemaMigrationResult {
  const dryRun = options.dryRun ?? false;
  const stores = MEMORY_STORES;
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
  if (!existingTables.has('memory_deletion_hash_keys')) {
    operations.push({ table: 'memory_deletion_hash_keys', action: 'create right-to-forget keyed hash secret store' });
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
    if (!existingTables.has(store)) {
      operations.push({
        table: store,
        action: `create ${store} store`,
      });
      fromVersion = 0;
      continue;
    }
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
      CREATE TABLE IF NOT EXISTS memory_deletion_hash_keys (
        id TEXT PRIMARY KEY,
        key_material TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE TABLE IF NOT EXISTS memory_access_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        store TEXT NOT NULL,
        key_hash TEXT,
        query_hash TEXT,
        outcome TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
      );
      CREATE INDEX IF NOT EXISTS idx_memory_access_audit_created
        ON memory_access_audit_events(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_access_audit_operation
        ON memory_access_audit_events(store, operation, created_at DESC);
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
      CREATE INDEX IF NOT EXISTS idx_memory_review_suppressions_target_key
        ON memory_review_suppressions(target_store, memory_key);
    `);
    for (const store of stores) {
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
  for (const store of ENCRYPTED_MEMORY_STORES) {
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
      stores: ENCRYPTED_MEMORY_STORES.map((store) => ({ store, encrypted: false })),
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
    stores: ENCRYPTED_MEMORY_STORES.map((store) => ({
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
  for (const store of ENCRYPTED_MEMORY_STORES) {
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
  return ENCRYPTED_MEMORY_STORES.every((store) => encrypted.has(store));
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
  if (!tableExists(db, store)) return [];
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
    case 'memory_review_candidates':
      return readReviewPayloads(
        db,
        `SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_candidates`,
      );
    case 'memory_review_provenance':
      return readReviewPayloads(
        db,
        `SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_provenance`,
      );
    case 'memory_review_suppressions':
      return readReviewPayloads(
        db,
        `SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_suppressions`,
      );
    case 'memory_deletion_hash_keys':
      return (
        db.prepare(`SELECT key_material FROM memory_deletion_hash_keys`).all() as Array<{
          key_material: string;
        }>
      ).map((row) => row.key_material);
  }
  return [];
}

function readReviewPayloads(db: Database.Database, sql: string): string[] {
  return (
    db.prepare(sql).all() as Array<{
      value: string;
      source: string;
      evidence_id: string | null;
      reason: string;
      reviewer: string | null;
      note: string | null;
    }>
  ).flatMap((row) =>
    [row.value, row.source, row.evidence_id, row.reason, row.reviewer, row.note].filter(
      (value): value is string => value !== null,
    ),
  );
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
  if (!tableExists(db, store)) return 0;
  return (
    db.prepare(`SELECT COUNT(*) AS count FROM ${store}`).get() as {
      count: number;
    }
  ).count;
}

function encryptIfPlaintext(value: string, cipher: MemoryCipher): string {
  return isDecryptableEncryptedPayload(value, cipher) ? value : cipher.encrypt(value);
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
      encryptIfPlaintext(row.summary, cipher),
      row.details === null ? null : encryptIfPlaintext(row.details, cipher),
      row.id,
    );
  }
  for (const row of db
    .prepare(`SELECT id, state FROM checkpoints`)
    .all() as Array<{ id: number; state: string }>) {
    db.prepare(`UPDATE checkpoints SET state = ? WHERE id = ?`).run(
      encryptIfPlaintext(row.state, cipher),
      row.id,
    );
  }
  encryptReviewPayloadRows(db, cipher, 'memory_review_candidates', 'id');
  encryptReviewPayloadRows(
    db,
    cipher,
    'memory_review_provenance',
    'target_store, memory_key',
  );
  encryptReviewPayloadRows(
    db,
    cipher,
    'memory_review_suppressions',
    'signature',
  );
  encryptDeletionHashKeys(db, cipher);
}

function encryptReviewPayloadRows(
  db: Database.Database,
  cipher: MemoryCipher,
  table: 'memory_review_candidates' | 'memory_review_provenance' | 'memory_review_suppressions',
  keyColumns: 'id' | 'signature' | 'target_store, memory_key',
): void {
  if (!tableExists(db, table)) return;
  const rows = db
    .prepare(`SELECT ${keyColumns}, ${MEMORY_REVIEW_PAYLOAD_COLUMNS.join(', ')} FROM ${table}`)
    .all() as Array<Record<string, string | null>>;
  for (const row of rows) {
    const assignments = MEMORY_REVIEW_PAYLOAD_COLUMNS.map(
      (column) => `${column} = ?`,
    ).join(', ');
    const where =
      keyColumns === 'target_store, memory_key'
        ? `target_store = ? AND memory_key = ?`
        : `${keyColumns} = ?`;
    const payloadValues = MEMORY_REVIEW_PAYLOAD_COLUMNS.map((column) => {
      const value = row[column];
      return value === null || value === undefined
        ? null
        : encryptIfPlaintext(value, cipher);
    });
    const keyValues: Array<string | null> =
      keyColumns === 'target_store, memory_key'
        ? [row.target_store ?? null, row.memory_key ?? null]
        : [row[keyColumns] ?? null];
    db.prepare(`UPDATE ${table} SET ${assignments} WHERE ${where}`).run(
      ...payloadValues,
      ...keyValues,
    );
  }
}

function encryptDeletionHashKeys(db: Database.Database, cipher: MemoryCipher): void {
  if (!tableExists(db, 'memory_deletion_hash_keys')) return;
  for (const row of db
    .prepare(`SELECT id, key_material FROM memory_deletion_hash_keys`)
    .all() as Array<{ id: string; key_material: string }>) {
    if (!isDecryptableEncryptedPayload(row.key_material, cipher)) {
      db.prepare(`UPDATE memory_deletion_hash_keys SET key_material = ? WHERE id = ?`).run(
        cipher.encrypt(row.key_material),
        row.id,
      );
    }
  }
}

function readMemorySchemaMetadata(db: Database.Database): MemorySchemaMetadata {
  const stores = MEMORY_STORES;
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
      recordCount: countStoreRows(db, store),
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

  for (const store of MEMORY_STORES) {
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

function purgeDeletedSqliteContent(db: Database.Database, dbPath: string): void {
  if (dbPath === ':memory:') return;
  db.pragma('secure_delete = ON');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
}

type NormalizedRightToForgetSelector = Omit<RightToForgetSelector, 'type'> & { type?: RightToForgetMemoryType };

function normalizeRightToForgetSelector(selector: RightToForgetSelector): NormalizedRightToForgetSelector {
  const normalized: NormalizedRightToForgetSelector = {};
  for (const field of ['key', 'category', 'sourceScope', 'query'] as const) {
    const value = selector[field];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new Error(`right-to-forget ${field} must be a non-empty string when provided`);
      }
      if (field === 'key') {
        if (value.length === 0) {
          throw new Error('right-to-forget key must be a non-empty string when provided');
        }
        normalized[field] = value;
      } else {
        if (value.trim().length === 0) {
          throw new Error(`right-to-forget ${field} must be a non-empty string when provided`);
        }
        if (field === 'query' && normalizeForMatch(value).length < MIN_QUERY_GUARD_CHUNK_LENGTH) {
          throw new Error(`right-to-forget query must be at least ${MIN_QUERY_GUARD_CHUNK_LENGTH} normalized characters when provided`);
        }
        normalized[field] = value.trim();
      }
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

const DELETION_HASH_KEY_ID = 'right-to-forget-hmac-v1';

function readDeletionHashKey(db: Database.Database, encryption?: MemoryCipher): string | undefined {
  const row = db.prepare(`SELECT key_material FROM memory_deletion_hash_keys WHERE id = ? LIMIT 1`)
    .get(DELETION_HASH_KEY_ID) as { key_material: string } | undefined;
  return row ? encryption?.decrypt(row.key_material) ?? row.key_material : undefined;
}

function countDeletionGuards(db: Database.Database): number {
  if (!tableExists(db, 'memory_deletion_guards')) return 0;
  return (
    db.prepare(`SELECT COUNT(*) AS count FROM memory_deletion_guards`).get() as {
      count: number;
    }
  ).count;
}

function writeDeletionHashKey(db: Database.Database, key: string, encryption?: MemoryCipher): void {
  db.prepare(`INSERT OR IGNORE INTO memory_deletion_hash_keys (id, key_material, created_at, schema_version) VALUES (?, ?, ?, ${CURRENT_MEMORY_SCHEMA_VERSION})`)
    .run(DELETION_HASH_KEY_ID, encryption?.encrypt(key) ?? key, isoNow());
}

function readOrCreateDeletionHashKey(db: Database.Database, encryption?: MemoryCipher): string {
  db.exec(`CREATE TABLE IF NOT EXISTS memory_deletion_hash_keys (
    id TEXT PRIMARY KEY,
    key_material TEXT NOT NULL,
    created_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT ${CURRENT_MEMORY_SCHEMA_VERSION}
  )`);
  const existing = readDeletionHashKey(db, encryption);
  if (existing) return existing;
  const key = randomBytes(32).toString('base64url');
  writeDeletionHashKey(db, key, encryption);
  return key;
}

function keyedDeletionHash(db: Database.Database, value: string, encryption?: MemoryCipher): string {
  return createHmac('sha256', readOrCreateDeletionHashKey(db, encryption)).update(value).digest('hex');
}

function existingKeyedDeletionHash(db: Database.Database, value: string, encryption?: MemoryCipher): string | undefined {
  const key = readDeletionHashKey(db, encryption);
  return key ? createHmac('sha256', key).update(value).digest('hex') : undefined;
}

function hashSelector(
  db: Database.Database,
  selector: NormalizedRightToForgetSelector,
  options: { createKey?: boolean; encryption?: MemoryCipher } = {},
): string {
  const key = options.createKey === false
    ? readDeletionHashKey(db, options.encryption) ?? randomBytes(32).toString('base64url')
    : readOrCreateDeletionHashKey(db, options.encryption);
  return createHmac('sha256', key)
    .update(JSON.stringify({
      key: selector.key,
      category: normalizeForMatch(selector.category),
      sourceScope: normalizeForMatch(selector.sourceScope),
      query: normalizeForMatch(selector.query),
      type: selector.type ?? 'all',
    }))
    .digest('hex');
}

function legacyHashGuardValue(value: string, normalize = true): string {
  return createHash('sha256').update(normalize ? normalizeForMatch(value) : value).digest('hex');
}

function hashGuardValue(db: Database.Database, value: string, normalize = true, encryption?: MemoryCipher): string {
  return keyedDeletionHash(db, normalize ? normalizeForMatch(value) : value, encryption);
}

function guardHashCandidates(db: Database.Database, value: string, normalize = true, encryption?: MemoryCipher): string[] {
  const normalized = normalize ? normalizeForMatch(value) : value;
  return Array.from(new Set([
    existingKeyedDeletionHash(db, normalized, encryption),
    legacyHashGuardValue(value, normalize),
  ].filter((hash): hash is string => typeof hash === 'string')));
}

function guardTokens(value: string | undefined): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) return [];
  return Array.from(new Set([
    normalized,
    ...(normalized.match(/[a-z0-9][a-z0-9@._:-]*/g) ?? []),
  ]));
}

const MIN_QUERY_GUARD_CHUNK_LENGTH = 8;
const MAX_QUERY_GUARD_CHUNK_LENGTH = 128;
const MAX_LEGACY_QUERY_GUARD_SCAN_CHARS = 8192;
const MAX_QUERY_GUARD_SCAN_CANDIDATES = 20_000;

function* iterateGuardMatchCandidates(value: string | undefined): Iterable<string> {
  const tokens = guardTokens(value).sort((a, b) => a.length - b.length);
  yield* tokens;
  for (const token of tokens) {
    if (token.length <= MIN_QUERY_GUARD_CHUNK_LENGTH) continue;
    for (let start = 0; start < token.length; start += 1) {
      const maxEnd = Math.min(token.length, start + MAX_QUERY_GUARD_CHUNK_LENGTH);
      for (let end = start + MIN_QUERY_GUARD_CHUNK_LENGTH; end <= maxEnd; end += 1) {
        yield token.slice(start, end);
      }
    }
  }
}

function queryGuardHashValue(db: Database.Database, value: string, encryption?: MemoryCipher): string {
  const normalized = normalizeForMatch(value);
  return `${normalized.length}:${hashGuardValue(db, normalized, true, encryption)}`;
}

function legacyQueryGuardHashValue(value: string): string {
  const normalized = normalizeForMatch(value);
  return `${normalized.length}:${legacyHashGuardValue(normalized)}`;
}

function queryGuardHashCandidates(db: Database.Database, value: string, encryption?: MemoryCipher): string[] {
  const normalized = normalizeForMatch(value);
  const keyed = existingKeyedDeletionHash(db, normalized, encryption);
  return Array.from(new Set([
    keyed ? `${normalized.length}:${keyed}` : undefined,
    legacyQueryGuardHashValue(value),
  ].filter((hash): hash is string => typeof hash === 'string')));
}

function readQueryGuardIndex(db: Database.Database, scope: 'working' | 'episodic' | 'checkpoint'): {
  lengths: Set<number>;
  hasLegacyHashes: boolean;
} {
  const rows = db.prepare(`SELECT value_hash FROM memory_deletion_guards WHERE guard_kind = ?`).all(`${scope}:query`) as Array<{ value_hash: string }>;
  const lengths = new Set<number>();
  let hasLegacyHashes = false;
  for (const row of rows) {
    const match = /^(\d+):[a-f0-9]{64}$/i.exec(row.value_hash);
    if (match) {
      lengths.add(Number(match[1]));
    } else {
      hasLegacyHashes = true;
    }
  }
  return { lengths, hasLegacyHashes };
}

function* iterateSizedGuardMatchCandidates(value: string | undefined, lengths: Set<number>): Iterable<string> {
  const tokens = guardTokens(value).sort((a, b) => a.length - b.length);
  yield* tokens;
  const relevantLengths = Array.from(lengths).filter(length => length > 0).sort((a, b) => a - b);
  if (relevantLengths.length === 0) return;
  for (const token of tokens) {
    for (const length of relevantLengths) {
      if (token.length < length) continue;
      for (let start = 0; start <= token.length - length; start += 1) {
        yield token.slice(start, start + length);
      }
    }
  }
}

function queryGuardCandidatesForReplay(value: string | undefined, index: ReturnType<typeof readQueryGuardIndex>): string[] {
  const normalized = normalizeForMatch(value);
  if (index.hasLegacyHashes && normalized.length > MAX_LEGACY_QUERY_GUARD_SCAN_CHARS) {
    throw new MemoryDeletionGuardError('Refusing to store memory because legacy right-to-forget query guards cannot be safely evaluated for this large value');
  }
  const candidates = index.hasLegacyHashes
    ? iterateGuardMatchCandidates(value)
    : iterateSizedGuardMatchCandidates(value, index.lengths);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
    if (result.length > MAX_QUERY_GUARD_SCAN_CANDIDATES) {
      throw new MemoryDeletionGuardError('Refusing to store memory because right-to-forget query guards cannot be safely evaluated for this large value');
    }
  }
  return result;
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

function objectMetadataStrings(value: unknown, names: string[]): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const result: string[] = [];
  for (const name of names) {
    const raw = record[name];
    if (typeof raw === 'string') {
      result.push(raw);
    } else if (Array.isArray(raw) && raw.every(item => typeof item === 'string')) {
      result.push(...raw as string[]);
    }
  }
  return result;
}

function metadataMatchesSelectorValue(metadataValues: readonly string[], selectorValue: string): boolean {
  const normalizedSelectorValue = normalizeForMatch(selectorValue);
  return metadataValues.some((value) => {
    const normalized = normalizeForMatch(value);
    return normalized === normalizedSelectorValue || normalized.split(/\s+/).includes(normalizedSelectorValue);
  });
}

function workingEntryMatchesSelector(key: string, value: unknown, selector: NormalizedRightToForgetSelector): boolean {
  const lowerKey = normalizeForMatch(key);
  const text = normalizeForMatch(`${key} ${valueToSearchText(value)}`);
  if (selector.key && key === selector.key) return true;
  if (selector.query && text.includes(normalizeForMatch(selector.query))) return true;
  if (selector.category) {
    const category = normalizeForMatch(selector.category);
    if (
      metadataMatchesSelectorValue(objectMetadataStrings(value, ['category', 'categories', 'kind']), category)
      || extractStructuredMarkerValues(text, 'category').some(candidate => normalizeForMatch(candidate) === category)
      || lowerKey === category
      || lowerKey.startsWith(`${category}:`)
    ) return true;
  }
  if (selector.sourceScope) {
    const sourceScope = normalizeForMatch(selector.sourceScope);
    if (
      metadataMatchesSelectorValue(objectMetadataStrings(value, ['sourceScope', 'source', 'scope', 'sourceId']), sourceScope)
      || extractStructuredMarkerValues(text, 'sourceScope').some(candidate => normalizeForMatch(candidate) === sourceScope)
      || lowerKey === sourceScope
      || lowerKey.startsWith(`${sourceScope}:`)
      || lowerKey.includes(`:${sourceScope}:`)
      || lowerKey.endsWith(`:${sourceScope}`)
    ) return true;
  }
  return false;
}

function isRightToForgetAuditEvent(event: EpisodicEvent): boolean {
  if (event.type !== 'observation' || event.step !== 'right-to-forget') return false;
  if (event.summary !== 'Right-to-forget deletion completed') return false;
  const details = event.details;
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return false;
  const record = details as Record<string, unknown>;
  const detailKeys = Object.keys(record).sort();
  if (detailKeys.join(',') !== 'deleted,selectorHash') return false;
  if (typeof record.selectorHash !== 'string' || !/^[a-f0-9]{64}$/i.test(record.selectorHash)) return false;
  const deleted = record.deleted;
  if (deleted === null || typeof deleted !== 'object' || Array.isArray(deleted)) return false;
  const counts = deleted as Record<string, unknown>;
  const countKeys = Object.keys(counts).sort();
  if (countKeys.join(',') !== 'derived,episodic,working') return false;
  return ['working', 'episodic', 'derived'].every((name) => (
    Number.isSafeInteger(counts[name]) && Number(counts[name]) >= 0
  ));
}

function episodicRowMatchesSelector(step: string, summary: string, details: string | null, selector: NormalizedRightToForgetSelector): boolean {
  const parsedDetails = details ? safeJsonParse(details) : undefined;
  const text = normalizeForMatch(`${step} ${summary} ${details ?? ''}`);
  if (selector.query && text.includes(normalizeForMatch(selector.query))) return true;
  if (selector.category) {
    const category = normalizeForMatch(selector.category);
    if (
      metadataMatchesSelectorValue(objectMetadataStrings(parsedDetails, ['category', 'categories', 'kind']), category)
      || extractStructuredMarkerValues(text, 'category').some(value => normalizeForMatch(value) === category)
    ) return true;
  }
  if (selector.sourceScope) {
    const sourceScope = normalizeForMatch(selector.sourceScope);
    if (
      metadataMatchesSelectorValue(objectMetadataStrings(parsedDetails, ['sourceScope', 'source', 'scope', 'sourceId']), sourceScope)
      || extractStructuredMarkerValues(text, 'sourceScope').some(value => normalizeForMatch(value) === sourceScope)
    ) return true;
  }
  return false;
}

function writeDeletionGuards(
  db: Database.Database,
  selector: NormalizedRightToForgetSelector,
  selectorHash: string,
  encryption?: MemoryCipher,
): void {
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
    const values = [value];
    for (const guardValue of values) {
      for (const scope of scopes) {
        if (kind === 'key' && scope !== 'working') continue;
        insert.run(selectorHash, `${scope}:${kind}`, kind === 'query'
          ? queryGuardHashValue(db, guardValue, encryption)
          : hashGuardValue(db, guardValue, kind !== 'key', encryption), now);
      }
    }
  }
}

function keySegmentCandidates(key: string): string[] {
  const segments = key.split(':').filter(Boolean);
  const candidates = new Set(segments);
  for (let start = 0; start < segments.length; start += 1) {
    for (let end = start + 2; end <= segments.length; end += 1) {
      candidates.add(segments.slice(start, end).join(':'));
    }
  }
  return Array.from(candidates);
}

function keyPrefixCandidates(key: string): string[] {
  const segments = key.split(':').map(segment => normalizeForMatch(segment)).filter(Boolean);
  const candidates = new Set<string>();
  for (let end = 1; end < segments.length; end += 1) {
    candidates.add(segments.slice(0, end).join(':'));
  }
  return Array.from(candidates);
}

function assertMemoryCandidateNotDeletionGuarded(
  db: Database.Database,
  proposal: MemoryCandidateProposal,
  encryption?: MemoryCipher,
  options: { checkNeverStore?: boolean } = {},
): void {
  assertNotDeletionGuarded(
    db,
    proposal.key,
    stringifyWorkingMemoryValue(proposal.key, proposal.value),
    encryption,
    options,
  );
  assertNotDeletionGuarded(
    db,
    proposal.key,
    stringifyWorkingMemoryValue(proposal.key, {
      value: proposal.value,
      source: proposal.source,
      evidenceId: proposal.evidenceId,
      reason: proposal.reason,
    }),
    encryption,
    options,
  );
}

function reviewPayloadMatchesSelector(
  key: string,
  payload: {
    value: unknown;
    source: string;
    evidenceId?: string | undefined;
    reason: string;
    reviewer?: string | undefined;
    note?: string | undefined;
  },
  selector: NormalizedRightToForgetSelector,
): boolean {
  return (
    workingEntryMatchesSelector(key, payload, selector) ||
    workingEntryMatchesSelector(key, payload.value, selector)
  );
}

function assertNotDeletionGuarded(
  db: Database.Database,
  key: string,
  serializedValue: string,
  encryption?: MemoryCipher,
  options: { checkNeverStore?: boolean } = {},
): void {
  if (options.checkNeverStore !== false && hasNeverStoreSuppressionForKey(db, 'working', key, encryption)) {
    throw new MemoryDeletionGuardError('Refusing to store memory because it matches a prior never-store review decision');
  }
  const parsed = safeJsonParse(serializedValue);
  const text = `${key} ${typeof parsed === 'string' ? parsed : valueToSearchText(parsed)}`;
  const keyPrefix = key.includes(':') ? key.split(':', 1)[0] : undefined;
  const keySegments = keySegmentCandidates(key);
  const keyPrefixes = keyPrefixCandidates(key);
  const candidates: Array<[string, string | undefined]> = [
    ['key', key],
    ...objectMetadataStrings(parsed, ['category', 'categories', 'kind']).map(value => ['category', value] as [string, string]),
    ...extractStructuredMarkerValues(text, 'category').map(value => ['category', value] as [string, string]),
    ['category', key],
    ['category', keyPrefix],
    ...keyPrefixes.map(segment => ['category', segment] as [string, string]),
    ...objectMetadataStrings(parsed, ['sourceScope', 'source', 'scope', 'sourceId']).map(value => ['sourceScope', value] as [string, string]),
    ...extractStructuredMarkerValues(text, 'sourceScope').map(value => ['sourceScope', value] as [string, string]),
    ...keySegments.map(segment => ['sourceScope', segment] as [string, string]),
  ];
  for (const [kind, value] of candidates) {
    if (!value) continue;
    const guardValues = kind === 'key' ? [value] : Array.from(new Set([value, ...value.split(/\s+/).filter(Boolean)]));
    for (const candidate of guardValues) {
      if (hasDeletionGuard(db, 'working', kind, candidate, encryption)) {
        throw new MemoryDeletionGuardError(`Refusing to store memory because it matches a prior right-to-forget ${kind} guard`);
      }
    }
  }
  const queryGuardIndex = readQueryGuardIndex(db, 'working');
  if (queryGuardIndex.lengths.size > 0 || queryGuardIndex.hasLegacyHashes) {
    const values = queryGuardCandidatesForReplay(text, queryGuardIndex);
    if (hasAnyDeletionQueryGuard(db, 'working', values, encryption)) {
      throw new MemoryDeletionGuardError('Refusing to store memory because it matches a prior right-to-forget query guard');
    }
  }
}

function assertEpisodicNotDeletionGuarded(db: Database.Database, event: EpisodicEvent, encryption?: MemoryCipher): void {
  const text = `${event.step ?? ''} ${event.summary} ${event.details ? valueToSearchText(event.details) : ''}`;
  const candidates: Array<[string, string | undefined]> = [
    ...objectMetadataStrings(event.details, ['category', 'categories', 'kind']).map(value => ['category', value] as [string, string]),
    ...extractStructuredMarkerValues(text, 'category').map(value => ['category', value] as [string, string]),
    ...objectMetadataStrings(event.details, ['sourceScope', 'source', 'scope', 'sourceId']).map(value => ['sourceScope', value] as [string, string]),
    ...extractStructuredMarkerValues(text, 'sourceScope').map(value => ['sourceScope', value] as [string, string]),
  ];
  for (const [kind, value] of candidates) {
    if (!value) continue;
    for (const candidate of Array.from(new Set([value, ...value.split(/\s+/).filter(Boolean)]))) {
      if (hasDeletionGuard(db, 'episodic', kind, candidate, encryption)) {
        throw new MemoryDeletionGuardError(`Refusing to store episodic memory because it matches a prior right-to-forget ${kind} guard`);
      }
    }
  }
  const queryGuardIndex = readQueryGuardIndex(db, 'episodic');
  if (queryGuardIndex.lengths.size > 0 || queryGuardIndex.hasLegacyHashes) {
    const values = queryGuardCandidatesForReplay(text, queryGuardIndex);
    if (hasAnyDeletionQueryGuard(db, 'episodic', values, encryption)) {
      throw new MemoryDeletionGuardError('Refusing to store episodic memory because it matches a prior right-to-forget query guard');
    }
  }
}

function extractStructuredMarkerValues(text: string, name: string): string[] {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedName}\\s*[:=]\\s*([a-z0-9@._:-]+)`, 'gi');
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
    if (
      metadataMatchesSelectorValue(objectMetadataStrings(context, ['category', 'categories', 'kind']), category)
      || extractStructuredMarkerValues(text, 'category').some(candidate => normalizeForMatch(candidate) === category)
    ) return true;
  }
  if (selector.sourceScope) {
    const sourceScope = normalizeForMatch(selector.sourceScope);
    if (
      metadataMatchesSelectorValue(objectMetadataStrings(context, ['sourceScope', 'source', 'scope', 'sourceId']), sourceScope)
      || extractStructuredMarkerValues(text, 'sourceScope').some(candidate => normalizeForMatch(candidate) === sourceScope)
    ) return true;
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

function isLegacyDeletionGuardSnapshot(guard: MemoryDeletionGuardSnapshot): boolean {
  // Pre-HMAC deletion guard snapshots did not carry key material. Current keyed
  // snapshots use a 64-character HMAC selector hash and must be accompanied by
  // deletionGuardHashKey, otherwise the imported guards cannot be enforced.
  return !/^[a-f0-9]{64}$/i.test(guard.selectorHash);
}

function hasDeletionGuard(db: Database.Database, scope: string, kind: string, value: string, encryption?: MemoryCipher): boolean {
  const normalize = kind !== 'key';
  const hashes = kind === 'query'
    ? queryGuardHashCandidates(db, value, encryption)
    : guardHashCandidates(db, value, normalize, encryption);
  const stmt = db.prepare(`SELECT 1 FROM memory_deletion_guards WHERE guard_kind = ? AND value_hash = ? LIMIT 1`);
  return hashes.some(hash => Boolean(stmt.get(`${scope}:${kind}`, hash)));
}

function hasNeverStoreSuppressionForKey(
  db: Database.Database,
  targetStore: MemoryCandidateTargetStore,
  key: string,
  encryption?: MemoryCipher,
): boolean {
  const parts = ['never_store', targetStore, key];
  const signatureCandidates = Array.from(new Set([
    existingKeyedDeletionHash(db, stableStringify(parts), encryption),
    stableMemorySignature(parts),
  ].filter((signature): signature is string => typeof signature === 'string')));
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM memory_review_suppressions
         WHERE suppression_reason = 'never_store'
           AND target_store = ?
           AND (memory_key = ? OR signature IN (${signatureCandidates.map(() => '?').join(', ')}))
         LIMIT 1`,
      )
      .get(targetStore, key, ...signatureCandidates),
  );
}

function hasAnyDeletionQueryGuard(db: Database.Database, scope: string, values: readonly string[], encryption?: MemoryCipher): boolean {
  if (values.length === 0) return false;
  const rows = db.prepare(`SELECT value_hash FROM memory_deletion_guards WHERE guard_kind = ?`).all(`${scope}:query`) as Array<{ value_hash: string }>;
  if (rows.length === 0) return false;
  const guardHashes = new Set(rows.map(row => row.value_hash));
  const key = readDeletionHashKey(db, encryption);
  for (const value of values) {
    const normalized = normalizeForMatch(value);
    if (key && guardHashes.has(`${normalized.length}:${createHmac('sha256', key).update(normalized).digest('hex')}`)) {
      return true;
    }
    if (guardHashes.has(legacyQueryGuardHashValue(value))) return true;
  }
  return false;
}

function assertCheckpointNotDeletionGuarded(db: Database.Database, state: ExecutionState, encryption?: MemoryCipher): void {
  const context = state.context;
  const candidates: Array<[string, string | undefined]> = [
    ...objectMetadataStrings(context, ['category', 'categories', 'kind']).map(value => ['category', value] as [string, string]),
    ...extractStructuredMarkerValues(valueToSearchText(state), 'category').map(value => ['category', value] as [string, string]),
    ...objectMetadataStrings(context, ['sourceScope', 'source', 'scope', 'sourceId']).map(value => ['sourceScope', value] as [string, string]),
    ...extractStructuredMarkerValues(valueToSearchText(state), 'sourceScope').map(value => ['sourceScope', value] as [string, string]),
  ];
  for (const [kind, value] of candidates) {
    if (!value) continue;
    for (const candidate of Array.from(new Set([value, ...value.split(/\s+/).filter(Boolean)]))) {
      if (hasDeletionGuard(db, 'checkpoint', kind, candidate, encryption)) {
        throw new MemoryDeletionGuardError(`Refusing to store checkpoint because it matches a prior right-to-forget ${kind} guard`);
      }
    }
  }
  const queryGuardIndex = readQueryGuardIndex(db, 'checkpoint');
  if (queryGuardIndex.lengths.size > 0 || queryGuardIndex.hasLegacyHashes) {
    const text = valueToSearchText(state);
    const values = queryGuardCandidatesForReplay(text, queryGuardIndex);
    if (hasAnyDeletionQueryGuard(db, 'checkpoint', values, encryption)) {
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
