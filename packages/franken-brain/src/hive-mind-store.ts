import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  ConsolidatedLesson,
  EpisodicEvent,
} from '@franken/types';
import Database from 'better-sqlite3';

export type HiveMindNamespace = `agent-type:${string}` | 'global';
export const HIVE_MIND_GLOBAL_NAMESPACE: HiveMindNamespace = 'global';
export const HIVE_MIN_LESSON_CONFIDENCE = 0.65;

const MAX_AGENT_TYPE_ID_BYTES = 255;
const MAX_PUBLISHER_ID_BYTES = 255;
const MAX_ENTRY_BYTES = 64 * 1024;
const MAX_POLL_LIMIT = 1_000;
const DEFAULT_MAX_ENTRIES_PER_NAMESPACE = 10_000;
const MAX_CONFIGURED_ENTRIES_PER_NAMESPACE = 1_000_000;
const SECURE_DELETE_PENDING_KEY = 'secure-delete-pending';
const MIGRATION_SECURE_DELETE_PENDING_VALUE = 'migration';
const LEGACY_PUBLISHER_MIGRATION_KEY_PREFIX = 'legacy-publisher-migration:';
const MIGRATION_CHECKPOINT_RETRY_MS = 10;
const MIGRATION_CHECKPOINT_TIMEOUT_MS = 5_000;
const UNSAFE_AGENT_TYPE_ID_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_AGENT_TYPE_ID =
  /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export interface HiveMindLessonPublishEntry {
  readonly kind: 'lesson';
  /** Stable review-candidate identity used for precise revision revocation. */
  readonly candidateId?: string;
  readonly key: string;
  readonly status: 'pending' | 'approved';
  readonly lesson: ConsolidatedLesson;
}

export interface HiveMindEpisodePublishEntry {
  readonly kind: 'episode';
  readonly event: EpisodicEvent;
}

export type HiveMindPublishEntry = HiveMindLessonPublishEntry | HiveMindEpisodePublishEntry;

export type HiveMindEntry = HiveMindPublishEntry & {
  readonly id: number;
  readonly namespace: HiveMindNamespace;
  readonly publisherId: string;
  readonly publishedAt: string;
};

export interface HiveMindPollOptions {
  /** Return entries whose monotonically increasing id is greater than this cursor. */
  readonly sinceId?: number;
  /** Maximum entries returned. Defaults to 100; maximum 1,000. */
  readonly limit?: number;
  /** Exclude entries emitted by this publisher, leaving peer-only results. */
  readonly excludePublisherId?: string;
  /** Apply the kind filter in SQLite before the row limit. */
  readonly kind?: HiveMindPublishEntry['kind'];
}

export type HiveMindRecentOptions = Omit<HiveMindPollOptions, 'sinceId'>;

export interface HiveMindStoreOptions {
  /** Retained rows per namespace. Defaults to 10,000. */
  readonly maxEntriesPerNamespace?: number;
}

interface HiveMindRow {
  id: number;
  namespace: string;
  publisherId: string;
  kind: string;
  payload: string;
  publishedAt: string;
}

interface WalCheckpointResult {
  busy: number;
  log: number;
  checkpointed: number;
}

function truncateWalOrThrow(db: Database.Database): void {
  const [result] = db.pragma('wal_checkpoint(TRUNCATE)') as WalCheckpointResult[];
  if (!result || result.busy !== 0) {
    throw new Error('Secure deletion could not truncate the Hive WAL because a reader is active');
  }
}

function truncateWalAfterConcurrentMigrationOrThrow(db: Database.Database): void {
  const deadline = Date.now() + MIGRATION_CHECKPOINT_TIMEOUT_MS;
  const waitBuffer = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  do {
    const [result] = db.pragma('wal_checkpoint(TRUNCATE)') as WalCheckpointResult[];
    if (result?.busy === 0) return;
    Atomics.wait(waitBuffer, 0, 0, MIGRATION_CHECKPOINT_RETRY_MS);
  } while (Date.now() < deadline);
  throw new Error('Secure deletion could not truncate the Hive WAL because a reader is active');
}

function assertSafeAgentTypeId(agentTypeId: string): void {
  if (
    typeof agentTypeId !== 'string'
    || agentTypeId.length === 0
    || agentTypeId !== agentTypeId.trim()
    || agentTypeId === '.'
    || agentTypeId === '..'
    || agentTypeId.endsWith('.')
    || UNSAFE_AGENT_TYPE_ID_CHARACTERS.test(agentTypeId)
    || WINDOWS_RESERVED_AGENT_TYPE_ID.test(agentTypeId)
    || Buffer.byteLength(agentTypeId, 'utf8') > MAX_AGENT_TYPE_ID_BYTES
  ) {
    throw new RangeError(
      'agentTypeId must be a non-empty, portable path-component identifier of at most 255 UTF-8 bytes',
    );
  }
}

export function hiveMindAgentTypeNamespace(agentTypeId: string): HiveMindNamespace {
  assertSafeAgentTypeId(agentTypeId);
  return `agent-type:${agentTypeId}`;
}

function assertNamespace(namespace: string): asserts namespace is HiveMindNamespace {
  if (namespace === HIVE_MIND_GLOBAL_NAMESPACE) return;
  if (!namespace.startsWith('agent-type:')) {
    throw new RangeError('Hive mind namespace must be global or an agent-type namespace');
  }
  assertSafeAgentTypeId(namespace.slice('agent-type:'.length));
}

function assertPublisherId(publisherId: string): void {
  if (
    typeof publisherId !== 'string'
    || publisherId.length === 0
    || publisherId !== publisherId.trim()
    || Buffer.byteLength(publisherId, 'utf8') > MAX_PUBLISHER_ID_BYTES
  ) {
    throw new RangeError('publisherId must be non-empty and at most 255 UTF-8 bytes');
  }
}

function assertPollOptions(options: HiveMindPollOptions): { sinceId: number; limit: number } {
  const sinceId = options.sinceId ?? 0;
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(sinceId) || sinceId < 0) {
    throw new RangeError('Hive mind sinceId must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_POLL_LIMIT) {
    throw new RangeError(`Hive mind poll limit must be a safe integer between 1 and ${MAX_POLL_LIMIT}`);
  }
  if (options.excludePublisherId !== undefined) assertPublisherId(options.excludePublisherId);
  if (options.kind !== undefined && options.kind !== 'lesson' && options.kind !== 'episode') {
    throw new RangeError('Hive mind kind must be lesson or episode');
  }
  return { sinceId, limit };
}

function parseRow(row: HiveMindRow): HiveMindEntry {
  assertNamespace(row.namespace);
  assertPublisherId(row.publisherId);
  const payload = JSON.parse(row.payload) as unknown;
  if (!payload || typeof payload !== 'object' || !('kind' in payload) || payload.kind !== row.kind) {
    throw new Error(`Corrupt hive mind entry ${row.id}`);
  }
  if (row.kind === 'lesson') {
    const lessonPayload = payload as HiveMindLessonPublishEntry;
    if (
      typeof lessonPayload.key !== 'string'
      || (lessonPayload.candidateId !== undefined && typeof lessonPayload.candidateId !== 'string')
      || (lessonPayload.status !== 'pending' && lessonPayload.status !== 'approved')
      || !lessonPayload.lesson
      || lessonPayload.lesson.kind !== 'consolidated-lesson'
    ) {
      throw new Error(`Corrupt hive mind lesson entry ${row.id}`);
    }
  } else if (row.kind === 'episode') {
    const episodePayload = payload as HiveMindEpisodePublishEntry;
    if (!episodePayload.event || typeof episodePayload.event.summary !== 'string') {
      throw new Error(`Corrupt hive mind episode entry ${row.id}`);
    }
  } else {
    throw new Error(`Unsupported hive mind entry kind in row ${row.id}`);
  }
  return {
    ...(payload as HiveMindPublishEntry),
    id: row.id,
    namespace: row.namespace,
    publisherId: row.publisherId,
    publishedAt: row.publishedAt,
  };
}

/**
 * Durable, bounded polling store shared by concurrently running agent processes.
 * Namespaces are validated on every operation; cross-type reads require callers
 * to opt into the literal global namespace explicitly.
 */
export class HiveMindStore {
  private readonly db: Database.Database;
  private readonly maxEntriesPerNamespace: number;

  constructor(
    private readonly dbPath = '.fbeast/hive/hive.db',
    options: HiveMindStoreOptions = {},
  ) {
    this.maxEntriesPerNamespace = options.maxEntriesPerNamespace ?? DEFAULT_MAX_ENTRIES_PER_NAMESPACE;
    if (
      !Number.isSafeInteger(this.maxEntriesPerNamespace)
      || this.maxEntriesPerNamespace < 1
      || this.maxEntriesPerNamespace > MAX_CONFIGURED_ENTRIES_PER_NAMESPACE
    ) {
      throw new RangeError(
        `maxEntriesPerNamespace must be between 1 and ${MAX_CONFIGURED_ENTRIES_PER_NAMESPACE}`,
      );
    }
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('busy_timeout = 5000');
    if (dbPath !== ':memory:') this.db.pragma('secure_delete = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hive_mind_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace TEXT NOT NULL,
        publisher_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('lesson', 'episode')),
        payload TEXT NOT NULL,
        published_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hive_mind_poll
        ON hive_mind_entries(namespace, id);
      CREATE TABLE IF NOT EXISTS hive_mind_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.retryPendingSecureDelete();
  }

  publish(
    namespace: HiveMindNamespace,
    publisherId: string,
    entry: HiveMindPublishEntry,
  ): HiveMindEntry {
    assertNamespace(namespace);
    assertPublisherId(publisherId);
    this.retryPendingSecureDelete();
    if (entry.kind !== 'lesson' && entry.kind !== 'episode') {
      throw new TypeError('Hive mind entry kind must be lesson or episode');
    }
    const payload = JSON.stringify(entry);
    if (Buffer.byteLength(payload, 'utf8') > MAX_ENTRY_BYTES) {
      throw new RangeError(`Hive mind entry must not exceed ${MAX_ENTRY_BYTES} UTF-8 bytes`);
    }
    const publishedAt = new Date().toISOString();
    const insertAndTrim = this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT INTO hive_mind_entries (namespace, publisher_id, kind, payload, published_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(namespace, publisherId, entry.kind, payload, publishedAt);
      this.db.prepare(`
        DELETE FROM hive_mind_entries
         WHERE namespace = ?
           AND id < COALESCE((
             SELECT id FROM hive_mind_entries
              WHERE namespace = ?
              ORDER BY id DESC
              LIMIT 1 OFFSET ?
           ), 0)
      `).run(namespace, namespace, this.maxEntriesPerNamespace - 1);
      return result;
    });
    const result = insertAndTrim.immediate();
    return {
      ...entry,
      id: Number(result.lastInsertRowid),
      namespace,
      publisherId,
      publishedAt,
    };
  }

  poll(namespace: HiveMindNamespace, options: HiveMindPollOptions = {}): HiveMindEntry[] {
    assertNamespace(namespace);
    this.retryPendingSecureDelete();
    const { sinceId, limit } = assertPollOptions(options);
    const clauses = ['namespace = ?', 'id > ?'];
    const parameters: Array<string | number> = [namespace, sinceId];
    if (options.excludePublisherId !== undefined) {
      clauses.push('publisher_id <> ?');
      parameters.push(options.excludePublisherId);
    }
    if (options.kind !== undefined) {
      clauses.push('kind = ?');
      parameters.push(options.kind);
    }
    parameters.push(limit);
    const rows = this.db.prepare(`
      SELECT id, namespace, publisher_id AS publisherId, kind, payload,
             published_at AS publishedAt
        FROM hive_mind_entries
       WHERE ${clauses.join(' AND ')}
       ORDER BY id ASC
       LIMIT ?
    `).all(...parameters);
    return (rows as HiveMindRow[]).map(parseRow);
  }

  /** Return the newest bounded window, ordered newest first. */
  recent(namespace: HiveMindNamespace, options: HiveMindRecentOptions = {}): HiveMindEntry[] {
    assertNamespace(namespace);
    this.retryPendingSecureDelete();
    const { limit } = assertPollOptions(options);
    const clauses = ['namespace = ?'];
    const parameters: Array<string | number> = [namespace];
    if (options.excludePublisherId !== undefined) {
      clauses.push('publisher_id <> ?');
      parameters.push(options.excludePublisherId);
    }
    if (options.kind !== undefined) {
      clauses.push('kind = ?');
      parameters.push(options.kind);
    }
    parameters.push(limit);
    const rows = this.db.prepare(`
      SELECT id, namespace, publisher_id AS publisherId, kind, payload,
             published_at AS publishedAt
        FROM hive_mind_entries
       WHERE ${clauses.join(' AND ')}
       ORDER BY id DESC
       LIMIT ?
    `).all(...parameters);
    return (rows as HiveMindRow[]).map(parseRow);
  }

  deleteLesson(namespace: HiveMindNamespace, publisherId: string, key: string): number {
    return this.deletePublishedWhere(
      namespace,
      publisherId,
      entry => entry.kind === 'lesson' && entry.key === key,
    );
  }

  deleteLessonPublication(
    namespace: HiveMindNamespace,
    publisherId: string,
    candidateId: string,
    key: string,
  ): number {
    return this.deletePublishedWhere(
      namespace,
      publisherId,
      entry => entry.kind === 'lesson'
        && (entry.candidateId === candidateId
          || (entry.candidateId === undefined && entry.key === key && entry.status === 'pending')),
    );
  }

  /** Purge every legacy publication in one namespace before durable ownership is adopted. */
  deleteNamespace(namespace: HiveMindNamespace): number {
    assertNamespace(namespace);
    this.retryPendingSecureDelete();
    const remove = this.db.transaction(() => {
      const result = this.db.prepare(`
        DELETE FROM hive_mind_entries WHERE namespace = ?
      `).run(namespace);
      if (result.changes > 0 && this.dbPath !== ':memory:') {
        this.db.prepare(`
          INSERT OR REPLACE INTO hive_mind_metadata (key, value) VALUES (?, '1')
        `).run(SECURE_DELETE_PENDING_KEY);
      }
      return result.changes;
    });
    const removed = remove.immediate();
    if (removed > 0 && this.dbPath !== ':memory:') this.purgeDeletedContent();
    return removed;
  }

  /**
   * Record durable publisher adoption once per namespace, optionally purging
   * publications from the preceding process-random ownership model.
   */
  completeLegacyPublisherMigration(
    namespace: HiveMindNamespace,
    purgeLegacyPublications: boolean,
  ): boolean {
    assertNamespace(namespace);
    this.retryPendingSecureDelete();
    const migrationKey = `${LEGACY_PUBLISHER_MIGRATION_KEY_PREFIX}${namespace}`;
    const migrate = this.db.transaction(() => {
      const migrated = this.db.prepare(`
        SELECT 1 FROM hive_mind_metadata WHERE key = ?
      `).get(migrationKey);
      if (migrated) return { completed: false, removed: 0 };

      const removed = purgeLegacyPublications
        ? this.db.prepare('DELETE FROM hive_mind_entries WHERE namespace = ?').run(namespace).changes
        : 0;
      this.db.prepare(`
        INSERT INTO hive_mind_metadata (key, value) VALUES (?, '1')
      `).run(migrationKey);
      if (removed > 0 && this.dbPath !== ':memory:') {
        this.db.prepare(`
          INSERT OR REPLACE INTO hive_mind_metadata (key, value) VALUES (?, ?)
        `).run(SECURE_DELETE_PENDING_KEY, MIGRATION_SECURE_DELETE_PENDING_VALUE);
      }
      return { completed: true, removed };
    });
    const result = migrate.immediate();
    if (result.removed > 0 && this.dbPath !== ':memory:') {
      this.purgeDeletedContent();
    }
    return result.completed;
  }

  deletePublishedWhere(
    namespace: HiveMindNamespace,
    publisherId: string,
    predicate: (entry: HiveMindEntry) => boolean,
  ): number {
    assertNamespace(namespace);
    assertPublisherId(publisherId);
    const rows = this.db.prepare(`
      SELECT id, namespace, publisher_id AS publisherId, kind, payload,
             published_at AS publishedAt
        FROM hive_mind_entries
       WHERE namespace = ? AND publisher_id = ?
       ORDER BY id ASC
    `).all(namespace, publisherId) as HiveMindRow[];
    const ids = rows.map(parseRow).filter(predicate).map(entry => entry.id);
    if (ids.length === 0) {
      if (this.dbPath !== ':memory:' && this.hasPendingSecureDelete()) {
        this.purgeDeletedContent();
      }
      return 0;
    }
    const remove = this.db.transaction(() => {
      const statement = this.db.prepare('DELETE FROM hive_mind_entries WHERE id = ?');
      for (const id of ids) statement.run(id);
      if (this.dbPath !== ':memory:') {
        this.db.prepare(`
          INSERT OR REPLACE INTO hive_mind_metadata (key, value) VALUES (?, '1')
        `).run(SECURE_DELETE_PENDING_KEY);
      }
    });
    remove.immediate();
    if (this.dbPath !== ':memory:') {
      this.purgeDeletedContent();
    }
    return ids.length;
  }

  private hasPendingSecureDelete(): boolean {
    return this.db.prepare(`
      SELECT 1 FROM hive_mind_metadata WHERE key = ?
    `).get(SECURE_DELETE_PENDING_KEY) !== undefined;
  }

  private retryPendingSecureDelete(): void {
    if (this.dbPath !== ':memory:' && this.hasPendingSecureDelete()) {
      this.purgeDeletedContent();
    }
  }

  private purgeDeletedContent(): void {
    const pending = this.db.prepare(`
      SELECT value FROM hive_mind_metadata WHERE key = ?
    `).get(SECURE_DELETE_PENDING_KEY) as { value: string } | undefined;
    if (pending?.value === MIGRATION_SECURE_DELETE_PENDING_VALUE) {
      truncateWalAfterConcurrentMigrationOrThrow(this.db);
    } else {
      truncateWalOrThrow(this.db);
    }
    this.db.prepare('DELETE FROM hive_mind_metadata WHERE key = ?').run(SECURE_DELETE_PENDING_KEY);
  }

  close(): void {
    this.retryPendingSecureDelete();
    this.db.close();
  }
}
