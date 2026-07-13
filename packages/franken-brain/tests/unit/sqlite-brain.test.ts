import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrainSnapshotSchema } from '@franken/types';
import type { EpisodicEvent, ExecutionState, BrainSnapshot } from '@franken/types';
import {
  SqliteBrain,
  WorkingMemoryLimitError,
  UnsupportedMemorySchemaVersionError,
  CURRENT_MEMORY_SCHEMA_VERSION,
  DEFAULT_WORKING_MEMORY_LIMITS,
} from '../../src/sqlite-brain.js';

describe('SqliteBrain', () => {
  let brain: SqliteBrain;

  beforeEach(() => {
    brain = new SqliteBrain(); // in-memory
  });

  afterEach(() => {
    brain.close();
  });

  describe('working memory', () => {
    it('stores and retrieves values', () => {
      brain.working.set('key', 'value');
      expect(brain.working.get('key')).toBe('value');
    });

    it('snapshot() returns all key-value pairs', () => {
      brain.working.set('a', 1);
      brain.working.set('b', 'two');
      const snap = brain.working.snapshot();
      expect(snap).toEqual({ a: 1, b: 'two' });
    });

    it('restore() replaces all state', () => {
      brain.working.set('old', 'data');
      brain.working.restore({ new1: 'val1', new2: 'val2' });
      expect(brain.working.has('old')).toBe(false);
      expect(brain.working.get('new1')).toBe('val1');
      expect(brain.working.get('new2')).toBe('val2');
    });

    it('clear() removes everything', () => {
      brain.working.set('a', 1);
      brain.working.set('b', 2);
      brain.working.clear();
      expect(brain.working.keys()).toEqual([]);
    });

    it('has() and keys() reflect current state', () => {
      brain.working.set('x', 10);
      expect(brain.working.has('x')).toBe(true);
      expect(brain.working.has('y')).toBe(false);
      expect(brain.working.keys()).toEqual(['x']);
    });

    it('delete() removes a key and returns true', () => {
      brain.working.set('key', 'val');
      expect(brain.working.delete('key')).toBe(true);
      expect(brain.working.has('key')).toBe(false);
    });

    it('delete() returns false for non-existent key', () => {
      expect(brain.working.delete('nope')).toBe(false);
    });
  });

  describe('working memory limits (issue #37)', () => {
    it('applies generous default limits', () => {
      const usage = brain.working.usage();
      expect(usage.limits).toEqual(DEFAULT_WORKING_MEMORY_LIMITS);
      expect(usage.entries).toBe(0);
      expect(usage.totalBytes).toBe(0);
    });

    it('rejects new keys past maxEntries', () => {
      const bounded = new SqliteBrain(':memory:', { maxEntries: 2 });
      bounded.working.set('a', 1);
      bounded.working.set('b', 2);
      expect(() => bounded.working.set('c', 3)).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('allows overwriting an existing key at maxEntries', () => {
      const bounded = new SqliteBrain(':memory:', { maxEntries: 2 });
      bounded.working.set('a', 1);
      bounded.working.set('b', 2);
      expect(() => bounded.working.set('a', 'updated')).not.toThrow();
      expect(bounded.working.get('a')).toBe('updated');
      bounded.close();
    });

    it('rejects a single value larger than maxValueBytes', () => {
      const bounded = new SqliteBrain(':memory:', { maxValueBytes: 16 });
      expect(() => bounded.working.set('big', 'x'.repeat(100))).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('rejects writes that would exceed maxTotalBytes', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      bounded.working.set('a', 'x'.repeat(10));
      expect(() => bounded.working.set('b', 'y'.repeat(20))).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('frees byte budget when keys are deleted or overwritten', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      bounded.working.set('a', 'x'.repeat(10));
      bounded.working.delete('a');
      expect(() => bounded.working.set('b', 'y'.repeat(20))).not.toThrow();
      bounded.working.set('b', 'z');
      expect(() => bounded.working.set('c', 'w'.repeat(20))).not.toThrow();
      bounded.close();
    });

    it('resets accounting on clear()', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      bounded.working.set('a', 'x'.repeat(20));
      bounded.working.clear();
      expect(bounded.working.usage().totalBytes).toBe(0);
      expect(() => bounded.working.set('b', 'y'.repeat(20))).not.toThrow();
      bounded.close();
    });

    it('enforces limits on restore()', () => {
      const bounded = new SqliteBrain(':memory:', { maxEntries: 1 });
      expect(() => bounded.working.restore({ a: 1, b: 2 })).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('tracks usage as entries are added, counting key and value bytes', () => {
      brain.working.set('a', 'hello');
      const usage = brain.working.usage();
      expect(usage.entries).toBe(1);
      expect(usage.totalBytes).toBe('a'.length + JSON.stringify('hello').length);
    });

    it('counts key bytes against the byte budget', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      expect(() => bounded.working.set('k'.repeat(40), 1)).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('rejects values that are not JSON-serializable', () => {
      expect(() => brain.working.set('fn', () => 'hidden closure')).toThrow(
        WorkingMemoryLimitError,
      );
    });

    it('rejects circular values with a working-memory error and keeps prior state', () => {
      const circular: Record<string, unknown> = { label: 'loop' };
      circular.self = circular;
      brain.working.set('safe', { status: 'persisted' });

      expect(() => brain.working.set('cycle', circular)).toThrow(WorkingMemoryLimitError);
      expect(() => brain.working.restore({ cycle: circular })).toThrow(WorkingMemoryLimitError);
      expect(brain.working.snapshot()).toEqual({ safe: { status: 'persisted' } });
      expect(brain.working.has('cycle')).toBe(false);
    });

    it('accounts for the serialized form, not a deceptive small JSON facade', () => {
      // A Map stringifies to '{}' but would retain its full contents if stored
      // by reference. The store normalizes to the JSON round-trip, so what is
      // retained is exactly what was measured (and what flushToDb persists).
      const big = new Map([['payload', 'x'.repeat(1000)]]);
      brain.working.set('m', big);
      expect(brain.working.get('m')).toEqual({});
    });

    it('hydrate() honors custom working memory limits', () => {
      const roomy = new SqliteBrain(':memory:', { maxEntries: 20_000 });
      for (let i = 0; i < 15; i++) roomy.working.set(`k${i}`, i);
      const snapshot = roomy.serialize();
      roomy.close();

      // Defaults would allow this, so prove the override flows through both ways.
      expect(() => SqliteBrain.hydrate(snapshot, ':memory:', { maxEntries: 10 })).toThrow(
        WorkingMemoryLimitError,
      );
      const hydrated = SqliteBrain.hydrate(snapshot, ':memory:', { maxEntries: 20_000 });
      expect(hydrated.working.keys()).toHaveLength(15);
      hydrated.close();
    });

    it('constructor hydration honors stricter custom working memory limits', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const roomy = new SqliteBrain(dbPath, { maxEntries: 3 });
        roomy.working.set('a', 1);
        roomy.working.set('b', 2);
        roomy.flush();
        roomy.close();

        expect(() => new SqliteBrain(dbPath, { maxEntries: 1 })).toThrow(
          WorkingMemoryLimitError,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps previous state when restore() exceeds limits', () => {
      const bounded = new SqliteBrain(':memory:', { maxEntries: 2 });
      bounded.working.set('keep', 'me');
      expect(() => bounded.working.restore({ a: 1, b: 2, c: 3 })).toThrow(
        WorkingMemoryLimitError,
      );
      expect(bounded.working.get('keep')).toBe('me');
      expect(bounded.working.keys()).toEqual(['keep']);
      bounded.close();
    });

    it('handles complex objects (nested JSON)', () => {
      const complex = { nested: { deep: [1, 2, { three: true }] } };
      brain.working.set('complex', complex);
      expect(brain.working.get('complex')).toEqual(complex);
    });

    it('returns defensive clones from get() so callers cannot mutate accounted state', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');
      const persistent = new SqliteBrain(dbPath);
      const validated = { nested: { steps: ['validated'] } };

      try {
        persistent.working.set('rules', validated);
        const accountedBytes = persistent.working.usage().totalBytes;
        const returned = persistent.working.get('rules') as { nested: { steps: string[] } };

        returned.nested.steps.push('unvalidated'.repeat(100));

        expect(persistent.working.get('rules')).toEqual(validated);
        expect(persistent.working.usage().totalBytes).toBe(accountedBytes);

        persistent.serialize();
        persistent.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.get('rules')).toEqual(validated);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns defensive clones from snapshot() so callers cannot mutate accounted state', () => {
      const validated = { nested: { items: [{ name: 'validated' }] } };
      brain.working.set('rules', validated);
      const accountedBytes = brain.working.usage().totalBytes;

      const snap = brain.working.snapshot() as { rules: { nested: { items: Array<{ name: string }> } } };
      snap.rules.nested.items[0].name = 'unvalidated';
      snap.rules.nested.items.push({ name: 'oversized'.repeat(100) });

      expect(brain.working.snapshot()).toEqual({ rules: validated });
      expect(brain.working.get('rules')).toEqual(validated);
      expect(brain.working.usage().totalBytes).toBe(accountedBytes);
    });
  });


  describe('memory schema versioning and migrations', () => {
    it('exposes store-level and record-level schema version metadata', () => {
      brain.working.set('goal', 'ship migrations');
      brain.flush();
      brain.episodic.record({
        type: 'decision',
        summary: 'use explicit schema versions',
        createdAt: '2026-07-13T00:00:00.000Z',
      });
      brain.recovery.checkpoint({
        runId: 'run-1',
        phase: 'migration',
        step: 1,
        context: {},
        timestamp: '2026-07-13T00:00:01.000Z',
      });

      const metadata = brain.getMemorySchemaMetadata();
      expect(metadata.version).toBe(CURRENT_MEMORY_SCHEMA_VERSION);
      expect(metadata.stores).toEqual([
        { store: 'working_memory', version: CURRENT_MEMORY_SCHEMA_VERSION, recordCount: 1 },
        { store: 'episodic_events', version: CURRENT_MEMORY_SCHEMA_VERSION, recordCount: 1 },
        { store: 'checkpoints', version: CURRENT_MEMORY_SCHEMA_VERSION, recordCount: 1 },
      ]);

      const db = (brain as unknown as {
        db: { prepare: (sql: string) => { get: () => { schema_version: number } | undefined } };
      }).db;
      expect(db.prepare('SELECT schema_version FROM working_memory').get()?.schema_version).toBe(
        CURRENT_MEMORY_SCHEMA_VERSION,
      );
      expect(db.prepare('SELECT schema_version FROM episodic_events').get()?.schema_version).toBe(
        CURRENT_MEMORY_SCHEMA_VERSION,
      );
      expect(db.prepare('SELECT schema_version FROM checkpoints').get()?.schema_version).toBe(
        CURRENT_MEMORY_SCHEMA_VERSION,
      );
    });

    it('dry-runs and then migrates an old fixture with a backup before opening', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-migration-'));
      const dbPath = join(dir, 'brain.db');
      const backupPath = join(dir, 'brain.backup.db');

      try {
        const legacy = new Database(dbPath);
        legacy.exec(`
          CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE episodic_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            step TEXT,
            summary TEXT NOT NULL,
            details TEXT,
            embedding BLOB,
            created_at TEXT NOT NULL
          );
          CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
          INSERT INTO working_memory (key, value, updated_at) VALUES ('legacy', '"value"', '2026-07-13T00:00:00.000Z');
        `);
        legacy.close();

        const dryRun = SqliteBrain.migrateMemorySchema(dbPath, { dryRun: true });
        expect(dryRun.dryRun).toBe(true);
        expect(dryRun.migrated).toBe(true);
        expect(dryRun.operations.map(op => op.table)).toContain('working_memory');
        const afterDryRun = new Database(dbPath);
        expect(
          afterDryRun.prepare(`PRAGMA table_info(working_memory)`).all().some(row => (row as { name: string }).name === 'schema_version'),
        ).toBe(false);
        afterDryRun.close();
        expect(existsSync(`${dbPath}-wal`)).toBe(false);
        expect(existsSync(`${dbPath}-shm`)).toBe(false);

        const migrated = SqliteBrain.migrateMemorySchema(dbPath, { backupBeforeMigrate: true, backupPath });
        expect(migrated.dryRun).toBe(false);
        expect(migrated.backupPath).toBe(backupPath);
        expect(existsSync(backupPath)).toBe(true);
        const backup = new Database(backupPath, { readonly: true });
        expect(backup.prepare(`SELECT value FROM working_memory WHERE key = ?`).get('legacy')).toEqual({
          value: '"value"',
        });
        expect(
          backup.prepare(`PRAGMA table_info(working_memory)`).all().some(row => (row as { name: string }).name === 'schema_version'),
        ).toBe(false);
        backup.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.get('legacy')).toBe('value');
        expect(reopened.getMemorySchemaMetadata().stores).toEqual([
          { store: 'working_memory', version: CURRENT_MEMORY_SCHEMA_VERSION, recordCount: 1 },
          { store: 'episodic_events', version: CURRENT_MEMORY_SCHEMA_VERSION, recordCount: 0 },
          { store: 'checkpoints', version: CURRENT_MEMORY_SCHEMA_VERSION, recordCount: 0 },
        ]);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects unsupported future store and record schema versions', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-future-version-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const created = new SqliteBrain(dbPath);
        created.working.set('future', 'blocked');
        created.flush();
        created.close();

        const db = new Database(dbPath);
        db.prepare(`UPDATE memory_schema_versions SET version = ? WHERE store = ?`).run(
          CURRENT_MEMORY_SCHEMA_VERSION + 1,
          'working_memory',
        );
        db.close();
        expect(() => new SqliteBrain(dbPath)).toThrow(UnsupportedMemorySchemaVersionError);

        const rowFutureDb = new Database(dbPath);
        rowFutureDb.prepare(`UPDATE memory_schema_versions SET version = ? WHERE store = ?`).run(
          CURRENT_MEMORY_SCHEMA_VERSION,
          'working_memory',
        );
        rowFutureDb.prepare(`UPDATE working_memory SET schema_version = ? WHERE key = ?`).run(
          CURRENT_MEMORY_SCHEMA_VERSION + 1,
          'future',
        );
        rowFutureDb.close();
        expect(() => new SqliteBrain(dbPath)).toThrow(UnsupportedMemorySchemaVersionError);

        const futureShapeDir = mkdtempSync(join(tmpdir(), 'sqlite-brain-future-shape-'));
        const futureShapePath = join(futureShapeDir, 'brain.db');
        try {
          const futureShapeDb = new Database(futureShapePath);
          futureShapeDb.exec(`
            CREATE TABLE memory_schema_versions (store TEXT PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
            INSERT INTO memory_schema_versions (store, version, migrated_at)
            VALUES ('semantic_memory', ${CURRENT_MEMORY_SCHEMA_VERSION + 1}, '2026-07-13T00:00:00.000Z');
          `);
          futureShapeDb.close();

          expect(() => new SqliteBrain(futureShapePath)).toThrow(UnsupportedMemorySchemaVersionError);
          const afterRejectedOpen = new Database(futureShapePath, { readonly: true });
          const tables = afterRejectedOpen
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`)
            .all()
            .map(row => (row as { name: string }).name);
          expect(tables).toEqual(['memory_schema_versions']);
          afterRejectedOpen.close();
        } finally {
          rmSync(futureShapeDir, { recursive: true, force: true });
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('flush()', () => {
    it('serialize() calls flush to persist working memory to SQLite', () => {
      brain.working.set('task', 'test-flush');
      const snapshot = brain.serialize();
      // Working memory data is in the snapshot
      expect(snapshot.working).toEqual({ task: 'test-flush' });
    });

    it('persists only changed working-memory rows on subsequent flushes', () => {
      const db = (brain as unknown as {
        db: {
          exec: (sql: string) => void;
          prepare: (sql: string) => { all: () => Array<{ action: string; key: string }> };
        };
      }).db;

      brain.working.set('alpha', 'one');
      brain.working.set('beta', 'two');
      brain.working.set('gamma', 'three');
      brain.flush();

      db.exec(`
        CREATE TEMP TABLE working_memory_audit (action TEXT NOT NULL, key TEXT NOT NULL);
        CREATE TEMP TRIGGER working_memory_audit_delete
        AFTER DELETE ON working_memory
        BEGIN
          INSERT INTO working_memory_audit (action, key) VALUES ('delete', OLD.key);
        END;
        CREATE TEMP TRIGGER working_memory_audit_insert
        AFTER INSERT ON working_memory
        BEGIN
          INSERT INTO working_memory_audit (action, key) VALUES ('insert', NEW.key);
        END;
        CREATE TEMP TRIGGER working_memory_audit_update
        AFTER UPDATE ON working_memory
        BEGIN
          INSERT INTO working_memory_audit (action, key) VALUES ('update', NEW.key);
        END;
      `);

      brain.working.set('beta', 'two-updated');
      brain.flush();

      const auditRows = db.prepare('SELECT action, key FROM working_memory_audit').all();
      expect(new Set(auditRows.map(row => row.key))).toEqual(new Set(['beta']));
    });

    it('deletes only removed persisted working-memory rows on flush', () => {
      const db = (brain as unknown as {
        db: {
          exec: (sql: string) => void;
          prepare: (sql: string) => { all: () => Array<{ action: string; key: string }> };
        };
      }).db;

      brain.working.restore({ keep: true, remove: false, alsoKeep: 3 });
      brain.flush();

      db.exec(`
        CREATE TEMP TABLE working_memory_delete_audit (action TEXT NOT NULL, key TEXT NOT NULL);
        CREATE TEMP TRIGGER working_memory_delete_audit_delete
        AFTER DELETE ON working_memory
        BEGIN
          INSERT INTO working_memory_delete_audit (action, key) VALUES ('delete', OLD.key);
        END;
        CREATE TEMP TRIGGER working_memory_delete_audit_insert
        AFTER INSERT ON working_memory
        BEGIN
          INSERT INTO working_memory_delete_audit (action, key) VALUES ('insert', NEW.key);
        END;
      `);

      expect(brain.working.delete('remove')).toBe(true);
      brain.flush();

      const auditRows = db.prepare('SELECT action, key FROM working_memory_delete_audit').all();
      expect(auditRows).toEqual([{ action: 'delete', key: 'remove' }]);
    });

    it('deletes externally added persisted rows when flushing a stale cleared instance', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('local', 'value');
        stale.flush();

        const concurrent = new SqliteBrain(dbPath);
        concurrent.working.set('external', 'value');
        concurrent.flush();
        concurrent.close();

        stale.working.clear();
        stale.flush();
        stale.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.keys()).toEqual([]);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('episodic memory', () => {
    const makeEvent = (overrides: Partial<EpisodicEvent> = {}): EpisodicEvent => ({
      type: 'success',
      summary: 'Test event',
      createdAt: new Date().toISOString(),
      ...overrides,
    });

    it('records events with auto-generated id', () => {
      brain.episodic.record(makeEvent());
      expect(brain.episodic.count()).toBe(1);
    });

    it('recent() returns most recent first', () => {
      brain.episodic.record(makeEvent({ summary: 'first', createdAt: '2026-03-18T10:00:00Z' }));
      brain.episodic.record(makeEvent({ summary: 'second', createdAt: '2026-03-18T10:05:00Z' }));
      brain.episodic.record(makeEvent({ summary: 'third', createdAt: '2026-03-18T10:10:00Z' }));

      const events = brain.episodic.recent(2);
      expect(events).toHaveLength(2);
      expect(events[0]!.summary).toBe('third');
      expect(events[1]!.summary).toBe('second');
    });

    it('recentFailures() filters by type=failure', () => {
      brain.episodic.record(makeEvent({ type: 'success', summary: 'ok' }));
      brain.episodic.record(makeEvent({ type: 'failure', summary: 'bad' }));
      brain.episodic.record(makeEvent({ type: 'failure', summary: 'worse' }));

      const failures = brain.episodic.recentFailures();
      expect(failures).toHaveLength(2);
      expect(failures.every(e => e.type === 'failure')).toBe(true);
    });

    it('count() returns total events', () => {
      brain.episodic.record(makeEvent());
      brain.episodic.record(makeEvent());
      brain.episodic.record(makeEvent());
      expect(brain.episodic.count()).toBe(3);
    });

    it('records events with optional fields', () => {
      brain.episodic.record(makeEvent({
        step: 'build',
        details: { file: 'auth.ts', line: 42 },
      }));
      const events = brain.episodic.recent(1);
      expect(events[0]!.step).toBe('build');
      expect(events[0]!.details).toEqual({ file: 'auth.ts', line: 42 });
    });

    it('recall() finds matching events by keyword', () => {
      brain.episodic.record(makeEvent({ summary: 'first test event' }));
      brain.episodic.record(makeEvent({ summary: 'second test event' }));
      const results = brain.episodic.recall('test event', 1);
      expect(results).toHaveLength(1);
    });

    it('recall() handles very large keyword sets without exceeding SQLite query limits', () => {
      brain.episodic.record(makeEvent({
        summary: 'early match kw0000',
        createdAt: '2026-07-10T00:00:00.000Z',
      }));
      brain.episodic.record(makeEvent({
        summary: 'late match kw1199',
        createdAt: '2026-07-10T00:01:00.000Z',
      }));

      const query = Array.from({ length: 1200 }, (_, i) => `kw${String(i).padStart(4, '0')}`).join(' ');

      expect(() => brain.episodic.recall(query, 10)).not.toThrow();
      expect(brain.episodic.recall(query, 10).map(event => event.summary)).toEqual([
        'late match kw1199',
        'early match kw0000',
      ]);
    });

    it('skips corrupt persisted details while keeping healthy recent and failure rows available', () => {
      brain.episodic.record(makeEvent({
        type: 'failure',
        summary: 'older healthy failure',
        createdAt: '2026-07-10T00:00:00.000Z',
        details: { marker: 'healthy' },
      }));
      brain.episodic.record(makeEvent({
        type: 'failure',
        summary: 'newer corrupt failure',
        createdAt: '2026-07-10T00:01:00.000Z',
        details: { marker: 'corrupt-me' },
      }));
      brain.episodic.record(makeEvent({
        type: 'success',
        summary: 'newest healthy success',
        createdAt: '2026-07-10T00:02:00.000Z',
        details: { marker: 'healthy' },
      }));

      const db = (brain as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE summary = ?`).run('{', 'newer corrupt failure');

      expect(() => brain.episodic.recent(2)).not.toThrow();
      expect(brain.episodic.recent(2).map(event => event.summary)).toEqual([
        'newest healthy success',
        'older healthy failure',
      ]);

      expect(() => brain.episodic.recentFailures(1)).not.toThrow();
      expect(brain.episodic.recentFailures(1).map(event => event.summary)).toEqual([
        'older healthy failure',
      ]);
    });

    it('skips corrupt persisted details during recall', () => {
      brain.episodic.record(makeEvent({
        summary: 'healthy searchable event',
        createdAt: '2026-07-10T00:00:00.000Z',
        details: { marker: 'searchable' },
      }));
      brain.episodic.record(makeEvent({
        summary: 'corrupt searchable event',
        createdAt: '2026-07-10T00:01:00.000Z',
        details: { marker: 'searchable' },
      }));

      const db = (brain as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE summary = ?`).run('{', 'corrupt searchable event');

      expect(() => brain.episodic.recall('searchable', 10)).not.toThrow();
      expect(brain.episodic.recall('searchable', 10).map(event => event.summary)).toEqual([
        'healthy searchable event',
      ]);
      expect(brain.episodic.recall('searchable', 0)).toEqual([]);
      expect(brain.episodic.recent(0)).toEqual([]);
      expect(brain.episodic.recentFailures(0)).toEqual([]);
    });
  });

  describe('recovery memory', () => {
    const makeState = (overrides: Partial<ExecutionState> = {}): ExecutionState => ({
      runId: 'run-1',
      phase: 'execution',
      step: 3,
      context: { files: ['auth.ts'] },
      timestamp: new Date().toISOString(),
      ...overrides,
    });

    it('checkpoint() stores execution state and returns id', () => {
      const result = brain.recovery.checkpoint(makeState());
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('checkpoint() flushes working memory to SQLite', () => {
      brain.working.set('key1', 'value1');

      // Before checkpoint, working memory is in-memory only
      brain.recovery.checkpoint(makeState());

      // Verify by reading directly from SQLite
      const row = (brain as unknown as { db: { prepare: (sql: string) => { get: (key: string) => { value: string } | undefined } } })
        .db.prepare('SELECT value FROM working_memory WHERE key = ?').get('key1');
      expect(row?.value).toBe('"value1"');
    });

    it('checkpoint() rolls back working memory flush when checkpoint insert fails', () => {
      const db = (brain as unknown as {
        db: {
          exec: (sql: string) => void;
          prepare: (sql: string) => { get: (key: string) => { value: string } | undefined };
        };
      }).db;

      brain.working.set('key1', 'value1');
      db.exec(`
        CREATE TRIGGER fail_checkpoint_insert
        BEFORE INSERT ON checkpoints
        BEGIN
          SELECT RAISE(ABORT, 'simulated checkpoint insert failure');
        END;
      `);

      expect(() => brain.recovery.checkpoint(makeState())).toThrow(
        'simulated checkpoint insert failure',
      );

      const row = db.prepare('SELECT value FROM working_memory WHERE key = ?').get('key1');
      expect(row).toBeUndefined();

      db.exec(`DROP TRIGGER fail_checkpoint_insert`);
      brain.recovery.checkpoint(makeState({ step: 4 }));

      const recovered = db.prepare('SELECT value FROM working_memory WHERE key = ?').get('key1');
      expect(recovered?.value).toBe('"value1"');
    });

    it('lastCheckpoint() returns most recent', () => {
      brain.recovery.checkpoint(makeState({ step: 1 }));
      brain.recovery.checkpoint(makeState({ step: 2 }));
      brain.recovery.checkpoint(makeState({ step: 3 }));

      const last = brain.recovery.lastCheckpoint();
      expect(last).not.toBeNull();
      expect(last!.step).toBe(3);
    });

    it('falls back to the newest valid checkpoint when later persisted state is corrupt', () => {
      brain.recovery.checkpoint(makeState({ step: 1, timestamp: '2026-07-10T00:00:00.000Z' }));
      brain.recovery.checkpoint(makeState({ step: 2, timestamp: '2026-07-10T00:01:00.000Z' }));

      const db = (brain as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
      db.prepare(`UPDATE checkpoints SET state = ? WHERE id = (SELECT MAX(id) FROM checkpoints)`).run('{');

      expect(() => brain.recovery.lastCheckpoint()).not.toThrow();
      expect(brain.recovery.lastCheckpoint()?.step).toBe(1);
      expect(() => brain.serialize()).not.toThrow();
      expect(brain.serialize().checkpoint?.step).toBe(1);
    });

    it('lastCheckpoint() returns null when empty', () => {
      expect(brain.recovery.lastCheckpoint()).toBeNull();
    });

    it('clearCheckpoints() removes all', () => {
      brain.recovery.checkpoint(makeState());
      brain.recovery.checkpoint(makeState());
      brain.recovery.clearCheckpoints();
      expect(brain.recovery.lastCheckpoint()).toBeNull();
    });

    it('listCheckpoints() returns all with id and timestamp', () => {
      brain.recovery.checkpoint(makeState({ timestamp: '2026-03-18T10:00:00Z' }));
      brain.recovery.checkpoint(makeState({ timestamp: '2026-03-18T10:05:00Z' }));

      const list = brain.recovery.listCheckpoints();
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBeDefined();
      expect(list[0]!.timestamp).toBeDefined();
    });
  });

  describe('serialize/hydrate', () => {
    it('round-trips working memory', () => {
      brain.working.set('task', 'fix auth');
      brain.working.set('progress', 0.75);

      const snapshot = brain.serialize();
      const brain2 = SqliteBrain.hydrate(snapshot);

      expect(brain2.working.get('task')).toBe('fix auth');
      expect(brain2.working.get('progress')).toBe(0.75);
      brain2.close();
    });

    it('round-trips episodic events', () => {
      brain.episodic.record({
        type: 'failure',
        step: 'build',
        summary: 'TypeScript error',
        createdAt: '2026-03-18T10:00:00Z',
      });
      brain.episodic.record({
        type: 'success',
        summary: 'Tests passed',
        createdAt: '2026-03-18T10:05:00Z',
      });

      const snapshot = brain.serialize();
      const brain2 = SqliteBrain.hydrate(snapshot);

      expect(brain2.episodic.count()).toBe(2);
      expect(brain2.episodic.recentFailures(1)[0]!.summary).toBe('TypeScript error');
      brain2.close();
    });

    it('round-trips checkpoint', () => {
      brain.recovery.checkpoint({
        runId: 'run-1',
        phase: 'execution',
        step: 5,
        context: { files: ['auth.ts'] },
        timestamp: '2026-03-18T10:00:00Z',
      });

      const snapshot = brain.serialize();
      const brain2 = SqliteBrain.hydrate(snapshot);

      const cp = brain2.recovery.lastCheckpoint();
      expect(cp).not.toBeNull();
      expect(cp!.phase).toBe('execution');
      expect(cp!.step).toBe(5);
      brain2.close();
    });

    it('hydrate() replaces existing persistent database rows without duplicating snapshot data', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        brain.working.set('task', 'snapshot');
        brain.episodic.record({
          type: 'success',
          summary: 'hydrated once only',
          createdAt: '2026-07-10T00:00:00Z',
        });
        brain.recovery.checkpoint({
          runId: 'run-1',
          phase: 'execution',
          step: 1,
          context: {},
          timestamp: '2026-07-10T00:01:00Z',
        });
        const snapshot = brain.serialize();

        const first = SqliteBrain.hydrate(snapshot, dbPath);
        first.close();
        const second = SqliteBrain.hydrate(snapshot, dbPath);

        expect(second.working.snapshot()).toEqual({ task: 'snapshot' });
        expect(second.episodic.count()).toBe(1);
        expect(second.episodic.recent(10)).toEqual(snapshot.episodic);
        expect(second.serialize().episodic).toEqual(snapshot.episodic);
        expect(second.recovery.listCheckpoints()).toHaveLength(1);
        expect(second.recovery.lastCheckpoint()?.runId).toBe('run-1');
        second.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('round-trips with null checkpoint', () => {
      brain.working.set('key', 'val');
      const snapshot = brain.serialize();
      expect(snapshot.checkpoint).toBeNull();

      const brain2 = SqliteBrain.hydrate(snapshot);
      expect(brain2.recovery.lastCheckpoint()).toBeNull();
      expect(brain2.working.get('key')).toBe('val');
      brain2.close();
    });

    it('hydrate() rolls back working memory, episodic replay, and checkpoint together on failure', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-07-09T00:00:00Z',
        working: { fresh: 'snapshot' },
        episodic: [
          {
            type: 'success',
            summary: 'first event should roll back',
            createdAt: '2026-07-09T00:00:00Z',
          },
          {
            type: 'failure',
            summary: undefined,
            createdAt: '2026-07-09T00:01:00Z',
          } as unknown as EpisodicEvent,
        ],
        checkpoint: {
          runId: 'run-rollback',
          phase: 'execution',
          step: 1,
          context: {},
          timestamp: '2026-07-09T00:02:00Z',
        },
        metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
      };

      try {
        expect(() => SqliteBrain.hydrate(snapshot, dbPath)).toThrow();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.keys()).toEqual([]);
        expect(reopened.episodic.count()).toBe(0);
        expect(reopened.recovery.lastCheckpoint()).toBeNull();
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrate creates independent brain instance', () => {
      brain.working.set('shared', 'original');
      const snapshot = brain.serialize();
      const brain2 = SqliteBrain.hydrate(snapshot);

      brain2.working.set('shared', 'modified');
      expect(brain.working.get('shared')).toBe('original');
      expect(brain2.working.get('shared')).toBe('modified');
      brain2.close();
    });

    it('serialize → hydrate → serialize produces equivalent output', () => {
      brain.working.set('task', 'test');
      brain.episodic.record({
        type: 'decision',
        summary: 'Use SQLite',
        createdAt: '2026-03-18T10:00:00Z',
      });
      brain.recovery.checkpoint({
        runId: 'run-1',
        phase: 'planning',
        step: 1,
        context: {},
        timestamp: '2026-03-18T10:00:00Z',
      });

      const snap1 = brain.serialize();
      const brain2 = SqliteBrain.hydrate(snap1);
      const snap2 = brain2.serialize();

      // Compare content (ignore top-level timestamp which changes)
      expect(snap2.working).toEqual(snap1.working);
      expect(snap2.episodic).toEqual(snap1.episodic);
      expect(snap2.checkpoint).toEqual(snap1.checkpoint);
      expect(snap2.version).toEqual(snap1.version);
      brain2.close();
    });

    it('serialize() produces valid BrainSnapshot per Zod schema', () => {
      brain.working.set('key', 'value');
      brain.episodic.record({
        type: 'observation',
        summary: 'Schema test',
        createdAt: new Date().toISOString(),
      });

      const snapshot = brain.serialize();
      expect(() => BrainSnapshotSchema.parse(snapshot)).not.toThrow();
    });
  });

  describe('constructor', () => {
    it('accepts custom db path', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const tmpBrain = new SqliteBrain(dbPath);
        tmpBrain.working.set('test', 'value');
        expect(tmpBrain.working.get('test')).toBe('value');
        tmpBrain.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrates persisted working memory from an existing SQLite file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const first = new SqliteBrain(dbPath);
        first.working.set('adrs', ['ADR-001']);
        first.working.set('rules', { review: 'required' });
        first.flush();
        first.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.get('adrs')).toEqual(['ADR-001']);
        expect(reopened.working.get('rules')).toEqual({ review: 'required' });
        expect(reopened.working.usage().entries).toBe(2);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrates legacy plain-text working memory values', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const first = new SqliteBrain(dbPath);
        (first as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
          .db.prepare('INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)')
          .run('legacy', 'plain text value', '2026-07-04T00:00:00Z');
        first.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.get('legacy')).toBe('plain text value');
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('preserves special keys such as __proto__ when hydrating from SQLite', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const first = new SqliteBrain(dbPath);
        first.working.set('__proto__', 'safe value');
        first.flush();
        first.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.has('__proto__')).toBe(true);
        expect(reopened.working.get('__proto__')).toBe('safe value');
        expect(Object.entries(reopened.working.snapshot())).toEqual([['__proto__', 'safe value']]);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('skips existing SQLite working memory when hydrating from a snapshot', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('old-a', 1);
        stale.working.set('old-b', 2);
        stale.flush();
        stale.close();

        const snapshot: BrainSnapshot = {
          version: 1,
          timestamp: '2026-07-04T00:00:00Z',
          working: { fresh: 'snapshot' },
          episodic: [],
          checkpoint: null,
          metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
        };

        const hydrated = SqliteBrain.hydrate(snapshot, dbPath, { maxEntries: 1 });
        expect(hydrated.working.snapshot()).toEqual({ fresh: 'snapshot' });
        hydrated.close();

        const reopened = new SqliteBrain(dbPath, { maxEntries: 1 });
        expect(reopened.working.snapshot()).toEqual({ fresh: 'snapshot' });
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('defaults to in-memory database', () => {
      const memBrain = new SqliteBrain();
      memBrain.working.set('test', true);
      expect(memBrain.working.get('test')).toBe(true);
      memBrain.close();
    });
  });
});
