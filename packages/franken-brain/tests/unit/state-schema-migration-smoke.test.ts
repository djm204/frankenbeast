import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_MEMORY_SCHEMA_VERSION,
  SqliteBrain,
  UnsupportedMemorySchemaVersionError,
} from '../../src/sqlite-brain.js';

const storeNames = [
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

const readColumns = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);

describe('state schema migration smoke tests', () => {
  it('opens and upgrades a legacy v0 memory-state database without losing durable state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'franken-state-schema-smoke-'));
    const dbPath = join(dir, 'brain.db');

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
        INSERT INTO working_memory (key, value, updated_at)
          VALUES ('operator-guidance', '"preserve me"', '2026-07-15T00:00:00.000Z');
        INSERT INTO episodic_events (type, step, summary, details, created_at)
          VALUES ('decision', 'migration-smoke', 'legacy event survives migration', '{"scope":"issue-1812"}', '2026-07-15T00:00:01.000Z');
        INSERT INTO checkpoints (state, created_at)
          VALUES ('{"runId":"legacy-run","phase":"migration","step":1,"context":{"scope":"issue-1812"},"timestamp":"2026-07-15T00:00:02.000Z"}', '2026-07-15T00:00:02.000Z');
      `);
      legacy.close();

      const brain = new SqliteBrain(dbPath);
      expect(brain.working.get('operator-guidance')).toBe('preserve me');
      expect(brain.episodic.recall('legacy event survives migration', 5)).toHaveLength(1);
      expect(brain.recovery.lastCheckpoint()).toMatchObject({
        runId: 'legacy-run',
        phase: 'migration',
        step: 1,
      });
      expect(brain.getMemorySchemaMetadata().stores).toEqual(
        storeNames.map((store) => ({
          store,
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: store === 'working_memory' || store === 'episodic_events' || store === 'checkpoints' || store === 'memory_access_audit_events' ? 1 : 0,
        })),
      );
      brain.close();

      const migrated = new Database(dbPath, { readonly: true });
      for (const store of storeNames) {
        expect(readColumns(migrated, store)).toContain('schema_version');
      }
      expect(
        (migrated.prepare('SELECT COUNT(*) AS count FROM memory_schema_versions').get() as { count: number }).count,
      ).toBe(storeNames.length);
      migrated.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed on future state schema versions before changing the database shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'franken-state-schema-future-smoke-'));
    const dbPath = join(dir, 'brain.db');

    try {
      const future = new Database(dbPath);
      future.exec(`
        CREATE TABLE memory_schema_versions (store TEXT PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
        INSERT INTO memory_schema_versions (store, version, migrated_at)
          VALUES ('working_memory', ${CURRENT_MEMORY_SCHEMA_VERSION + 1}, '2026-07-15T00:00:00.000Z');
      `);
      future.close();

      expect(() => SqliteBrain.migrateMemorySchema(dbPath, { dryRun: true })).toThrow(
        UnsupportedMemorySchemaVersionError,
      );
      expect(() => new SqliteBrain(dbPath)).toThrow(UnsupportedMemorySchemaVersionError);

      const afterRejectedMigration = new Database(dbPath, { readonly: true });
      expect(
        afterRejectedMigration
          .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`)
          .all()
          .map((row) => (row as { name: string }).name),
      ).toEqual(['memory_schema_versions']);
      afterRejectedMigration.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
