import { readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { BrainSnapshotSchema, type BrainSnapshot, type EpisodicEvent } from '@franken/types';

const CURRENT_MEMORY_SCHEMA_VERSION = 1;
const REQUIRED_BACKUP_TABLES = [
  'working_memory',
  'episodic_events',
  'checkpoints',
] as const;
const MEMORY_BACKUP_TABLES = [
  'memory_schema_versions',
  ...REQUIRED_BACKUP_TABLES,
  'memory_deletion_guards',
  'memory_deletion_hash_keys',
] as const;
const JSON_COLUMNS_BY_TABLE: Record<string, readonly string[]> = {
  episodic_events: ['details'],
  checkpoints: ['state'],
};
const ENCRYPTED_PAYLOAD_COLUMNS_BY_TABLE: Record<string, readonly string[]> = {
  working_memory: ['value'],
  episodic_events: ['summary', 'details'],
  checkpoints: ['state'],
  memory_deletion_hash_keys: ['key_material'],
};
const REQUIRED_COLUMNS_BY_TABLE: Record<string, readonly string[]> = {
  working_memory: ['key', 'value', 'updated_at'],
  episodic_events: ['id', 'type', 'step', 'summary', 'details', 'created_at'],
  checkpoints: ['id', 'state', 'created_at'],
  memory_schema_versions: ['store', 'version', 'migrated_at'],
  memory_deletion_guards: ['selector_hash', 'guard_kind', 'value_hash', 'created_at'],
  memory_deletion_hash_keys: ['id', 'key_material', 'created_at'],
};
const ENCRYPTED_MEMORY_PREFIX = 'enc:v1:';

export interface SnapshotDiff<T = unknown> {
  readonly added: Record<string, T>;
  readonly removed: Record<string, T>;
  readonly changed: Record<string, { before: T; after: T }>;
  readonly unchanged: string[];
}

export interface MemorySnapshotDiffReport {
  readonly ok: true;
  readonly command: 'memory snapshot-diff';
  readonly before: { readonly path: string; readonly timestamp: string };
  readonly after: { readonly path: string; readonly timestamp: string };
  readonly summary: {
    readonly workingAdded: number;
    readonly workingRemoved: number;
    readonly workingChanged: number;
    readonly episodicAdded: number;
    readonly episodicRemoved: number;
    readonly episodicChanged: number;
    readonly checkpointChanged: boolean;
    readonly metadataChanged: boolean;
  };
  readonly diff: {
    readonly working: SnapshotDiff;
    readonly episodic: SnapshotDiff<EpisodicEvent>;
    readonly checkpoint: { readonly changed: boolean; readonly before: BrainSnapshot['checkpoint']; readonly after: BrainSnapshot['checkpoint'] };
    readonly metadata: SnapshotDiff;
  };
}

export interface MemoryBackupVerificationReport {
  readonly ok: true;
  readonly command: 'memory verify-backup';
  readonly path: string;
  readonly integrity: {
    readonly integrityCheck: string;
    readonly quickCheck: string;
  };
  readonly schema: {
    readonly version: number;
    readonly requiredTablesPresent: boolean;
    readonly stores: Array<{ readonly store: string; readonly version: number; readonly recordCount: number }>;
  };
  readonly summary: {
    readonly workingEntries: number;
    readonly episodicEvents: number;
    readonly checkpoints: number;
    readonly deletionGuards: number;
    readonly deletionHashKeys: number;
  };
}

export interface MemoryCommandDeps {
  readonly action: 'snapshot-diff' | 'verify-backup' | undefined;
  readonly beforePath?: string | undefined;
  readonly afterPath?: string | undefined;
  readonly backupPath?: string | undefined;
  readonly print: (message: string) => void;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}

function diffRecords<T>(before: Record<string, T>, after: Record<string, T>): SnapshotDiff<T> {
  const added: Record<string, T> = {};
  const removed: Record<string, T> = {};
  const changed: Record<string, { before: T; after: T }> = {};
  const unchanged: string[] = [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

  for (const key of keys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
    if (!hasBefore && hasAfter) {
      added[key] = after[key] as T;
      continue;
    }
    if (hasBefore && !hasAfter) {
      removed[key] = before[key] as T;
      continue;
    }
    const beforeValue = before[key] as T;
    const afterValue = after[key] as T;
    if (stableStringify(beforeValue) === stableStringify(afterValue)) {
      unchanged.push(key);
      continue;
    }
    changed[key] = { before: beforeValue, after: afterValue };
  }

  return { added, removed, changed, unchanged };
}

function eventDiffKey(event: EpisodicEvent, index: number): string {
  if (event.id !== undefined) {
    return `id:${event.id}`;
  }
  return `event:${event.createdAt}:${event.type}:${event.step ?? ''}:${event.summary}:${index}`;
}

function indexEvents(events: EpisodicEvent[]): Record<string, EpisodicEvent> {
  return Object.fromEntries(events.map((event, index) => [eventDiffKey(event, index), event]));
}

function sqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

function readSinglePragmaValue(db: Database.Database, pragma: string): string {
  const row = db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown> | undefined;
  const value = row ? Object.values(row)[0] : undefined;
  return typeof value === 'string' ? value : String(value ?? '');
}

function readTables(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function readTableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${sqliteIdentifier(table)})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function countRows(db: Database.Database, table: string, tables: Set<string>): number {
  if (!tables.has(table)) return 0;
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${sqliteIdentifier(table)}`).get() as { count: number };
  return row.count;
}

function readEncryptedStores(db: Database.Database, tables: Set<string>): Set<string> {
  if (!tables.has('memory_encryption_status')) return new Set();
  const columns = readTableColumns(db, 'memory_encryption_status');
  const missingColumns = ['store', 'encrypted', 'verifier'].filter((column) => !columns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Memory backup table memory_encryption_status is missing required column(s): ${missingColumns.join(', ')}`);
  }
  const rows = db
    .prepare(`SELECT store, encrypted, verifier FROM memory_encryption_status WHERE encrypted = 1`)
    .all() as Array<{ store: string; encrypted: number; verifier: string | null }>;
  const stores = new Set<string>();
  for (const row of rows) {
    if (!row.verifier) {
      throw new Error(`Encrypted memory store ${row.store} is missing verifier metadata`);
    }
    validateEncryptedPayload('memory_encryption_status', 'verifier', 0, row.verifier);
    stores.add(row.store);
  }
  return stores;
}
function validateEncryptedPayload(table: string, column: string, rowid: number, value: string): void {
  const parts = value.slice(ENCRYPTED_MEMORY_PREFIX.length).split(':');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error(`Malformed encrypted payload in ${table}.${column} row ${rowid}`);
  }
}

function verifyPayloadColumn(
  db: Database.Database,
  table: string,
  column: string,
  encryptedStores: Set<string>,
  options: { readonly requireJsonWhenPlaintext: boolean },
): void {
  const encryptedStore = encryptedStores.has(table);
  const rows = db
    .prepare(`SELECT rowid AS rowid, ${sqliteIdentifier(column)} AS value FROM ${sqliteIdentifier(table)} WHERE ${sqliteIdentifier(column)} IS NOT NULL`)
    .iterate() as Iterable<{ rowid: number; value: unknown }>;
  for (const row of rows) {
    if (typeof row.value !== 'string') continue;
    if (row.value.startsWith(ENCRYPTED_MEMORY_PREFIX)) {
      if (!encryptedStore) {
        throw new Error(`Unexpected encrypted payload marker in plaintext ${table}.${column} row ${row.rowid}`);
      }
      validateEncryptedPayload(table, column, row.rowid, row.value);
      continue;
    }
    if (encryptedStore) {
      throw new Error(`Plaintext payload in encrypted memory store ${table}.${column} row ${row.rowid}`);
    }
    if (!options.requireJsonWhenPlaintext) continue;
    try {
      JSON.parse(row.value) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON payload in ${table}.${column} row ${row.rowid}: ${message}`);
    }
  }
}

function verifyPayloadColumns(db: Database.Database, table: string, columns: Set<string>, encryptedStores: Set<string>): void {
  const payloadColumns = new Set([
    ...(JSON_COLUMNS_BY_TABLE[table] ?? []),
    ...(ENCRYPTED_PAYLOAD_COLUMNS_BY_TABLE[table] ?? []),
  ]);
  for (const column of payloadColumns) {
    if (!columns.has(column)) continue;
    verifyPayloadColumn(db, table, column, encryptedStores, {
      requireJsonWhenPlaintext: (JSON_COLUMNS_BY_TABLE[table] ?? []).includes(column),
    });
  }
}

function verifyRequiredColumns(table: string, columns: Set<string>): void {
  const requiredColumns = REQUIRED_COLUMNS_BY_TABLE[table] ?? [];
  const missingColumns = requiredColumns.filter((column) => !columns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Memory backup table ${table} is missing required column(s): ${missingColumns.join(', ')}`);
  }
}

function readSchemaStores(db: Database.Database, tables: Set<string>): MemoryBackupVerificationReport['schema']['stores'] {
  if (!tables.has('memory_schema_versions')) {
    return REQUIRED_BACKUP_TABLES.map((store) => ({
      store,
      version: 0,
      recordCount: countRows(db, store, tables),
    }));
  }
  return (db
    .prepare(`SELECT store, version FROM memory_schema_versions ORDER BY store ASC`)
    .all() as Array<{ store: string; version: number }>).map((row) => {
    if (row.version > CURRENT_MEMORY_SCHEMA_VERSION) {
      throw new Error(
        `Memory store ${row.store} uses schema version ${row.version}, but this runtime supports only ${CURRENT_MEMORY_SCHEMA_VERSION}`,
      );
    }
    return {
      store: row.store,
      version: row.version,
      recordCount: countRows(db, row.store, tables),
    };
  });
}

export function diffMemorySnapshots(
  beforePath: string,
  before: BrainSnapshot,
  afterPath: string,
  after: BrainSnapshot,
): MemorySnapshotDiffReport {
  const working = diffRecords(before.working, after.working);
  const episodic = diffRecords(indexEvents(before.episodic), indexEvents(after.episodic));
  const checkpointChanged = stableStringify(before.checkpoint) !== stableStringify(after.checkpoint);
  const metadata = diffRecords(before.metadata, after.metadata);

  return {
    ok: true,
    command: 'memory snapshot-diff',
    before: { path: beforePath, timestamp: before.timestamp },
    after: { path: afterPath, timestamp: after.timestamp },
    summary: {
      workingAdded: Object.keys(working.added).length,
      workingRemoved: Object.keys(working.removed).length,
      workingChanged: Object.keys(working.changed).length,
      episodicAdded: Object.keys(episodic.added).length,
      episodicRemoved: Object.keys(episodic.removed).length,
      episodicChanged: Object.keys(episodic.changed).length,
      checkpointChanged,
      metadataChanged: Object.keys(metadata.added).length > 0
        || Object.keys(metadata.removed).length > 0
        || Object.keys(metadata.changed).length > 0,
    },
    diff: {
      working,
      episodic,
      checkpoint: { changed: checkpointChanged, before: before.checkpoint, after: after.checkpoint },
      metadata,
    },
  };
}

export function verifyMemoryBackup(path: string): MemoryBackupVerificationReport {
  let db: Database.Database;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to open memory backup ${path}: ${message}`);
  }

  try {
    const integrityCheck = readSinglePragmaValue(db, 'integrity_check');
    if (integrityCheck !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${integrityCheck}`);
    }
    const quickCheck = readSinglePragmaValue(db, 'quick_check');
    if (quickCheck !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${quickCheck}`);
    }

    const tables = readTables(db);
    const missingTables = REQUIRED_BACKUP_TABLES.filter((table) => !tables.has(table));
    if (missingTables.length > 0) {
      throw new Error(`Memory backup is missing required table(s): ${missingTables.join(', ')}`);
    }

    const encryptedStores = readEncryptedStores(db, tables);
    for (const table of MEMORY_BACKUP_TABLES) {
      if (!tables.has(table)) continue;
      const columns = readTableColumns(db, table);
      verifyRequiredColumns(table, columns);
      if (columns.has('schema_version')) {
        const future = db
          .prepare(`SELECT schema_version FROM ${sqliteIdentifier(table)} WHERE schema_version > ? LIMIT 1`)
          .get(CURRENT_MEMORY_SCHEMA_VERSION) as { schema_version: number } | undefined;
        if (future) {
          throw new Error(
            `Memory table ${table} contains record schema version ${future.schema_version}, but this runtime supports only ${CURRENT_MEMORY_SCHEMA_VERSION}`,
          );
        }
      }
      verifyPayloadColumns(db, table, columns, encryptedStores);
    }

    const stores = readSchemaStores(db, tables);
    return {
      ok: true,
      command: 'memory verify-backup',
      path,
      integrity: { integrityCheck, quickCheck },
      schema: {
        version: Math.max(...stores.map((store) => store.version), CURRENT_MEMORY_SCHEMA_VERSION),
        requiredTablesPresent: true,
        stores,
      },
      summary: {
        workingEntries: countRows(db, 'working_memory', tables),
        episodicEvents: countRows(db, 'episodic_events', tables),
        checkpoints: countRows(db, 'checkpoints', tables),
        deletionGuards: countRows(db, 'memory_deletion_guards', tables),
        deletionHashKeys: countRows(db, 'memory_deletion_hash_keys', tables),
      },
    };
  } finally {
    db.close();
  }
}

async function readSnapshot(path: string): Promise<BrainSnapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read memory snapshot ${path}: ${message}`);
  }

  const result = BrainSnapshotSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid memory snapshot ${path}: ${result.error.issues.map((issue) => issue.path.join('.') + ' ' + issue.message).join('; ')}`);
  }
  return result.data as unknown as BrainSnapshot;
}

export async function handleMemoryCommand(deps: MemoryCommandDeps): Promise<void> {
  const { action, beforePath, afterPath, backupPath, print } = deps;
  if (action === 'verify-backup') {
    if (!backupPath) {
      throw new Error('memory verify-backup requires one SQLite backup file: <backup.sqlite>');
    }
    print(JSON.stringify(verifyMemoryBackup(backupPath), null, 2));
    return;
  }
  if (action !== 'snapshot-diff') {
    throw new Error('Usage: frankenbeast memory snapshot-diff <before-snapshot.json> <after-snapshot.json> OR frankenbeast memory verify-backup <backup.sqlite>');
  }
  if (!beforePath || !afterPath) {
    throw new Error('memory snapshot-diff requires two BrainSnapshot JSON files: <before> <after>');
  }

  const [before, after] = await Promise.all([
    readSnapshot(beforePath),
    readSnapshot(afterPath),
  ]);
  print(JSON.stringify(diffMemorySnapshots(beforePath, before, afterPath, after), null, 2));
}
