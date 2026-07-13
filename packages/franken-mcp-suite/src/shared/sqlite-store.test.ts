import { describe, it, expect, afterEach } from 'vitest';
import { createSqliteStore } from './sqlite-store.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

describe('SqliteStore', () => {
  const paths: string[] = [];

  function tracked(p: string): string {
    paths.push(p);
    return p;
  }

  afterEach(() => {
    for (const p of paths) {
      const dir = join(p, '..');
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
    paths.length = 0;
  });

  it('creates database with WAL mode and all tables', () => {
    const dbPath = tracked(tmpDbPath());
    const store = createSqliteStore(dbPath);

    expect(store.db).toBeDefined();

    const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((row) => row.name);

    expect(tableNames).toContain('memory');
    expect(tableNames).toContain('plans');
    expect(tableNames).toContain('audit_trail');
    expect(tableNames).toContain('cost_ledger');
    expect(tableNames).toContain('governor_log');
    expect(tableNames).toContain('firewall_log');
    expect(tableNames).not.toContain('skill_state');

    const costColumns = store.db.pragma('table_info(cost_ledger)') as Array<{ name: string }>;
    expect(costColumns.map((column) => column.name)).toContain('cost_source');

    const walMode = store.db.pragma('journal_mode', { simple: true });
    expect(walMode).toBe('wal');

    store.close();
  });

  it('sets busy_timeout to 5000ms', () => {
    const dbPath = tracked(tmpDbPath());
    const store = createSqliteStore(dbPath);

    const timeout = store.db.pragma('busy_timeout', { simple: true });
    expect(timeout).toBe(5000);

    store.close();
  });

  it('migrates existing cost ledgers with legacy source for pre-column rows', () => {
    const dbPath = tracked(tmpDbPath());
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE cost_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES ('legacy', 'gpt-4o', 1000, 1000, 0);
    `);
    db.close();

    const store = createSqliteStore(dbPath);
    const row = store.db.prepare('SELECT cost_source FROM cost_ledger WHERE session_id = ?').get('legacy') as { cost_source: string };

    expect(row.cost_source).toBe('legacy');
    store.close();
  });

  it('creates .fbeast directory if it does not exist', () => {
    const dir = join(tmpdir(), `fbeast-test-${randomUUID()}`, '.fbeast');
    const dbPath = join(dir, 'beast.db');
    paths.push(dbPath);

    const store = createSqliteStore(dbPath);
    expect(existsSync(dir)).toBe(true);

    store.close();
  });

  it('blocks audit_trail mutation unless explicitly unlocked for migration', () => {
    const dbPath = tracked(tmpDbPath());
    const store = createSqliteStore(dbPath);

    store.db
      .prepare('INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash) VALUES (?, ?, ?, ?, ?)')
      .run('session-immutable', 'tool_call', 'payload', 'sha256:0', null);

    expect(() => {
      store.db.prepare('UPDATE audit_trail SET payload = ? WHERE session_id = ?').run('tampered', 'session-immutable');
    }).toThrowError(/append-only/i);

    expect(() => {
      store.db.prepare('DELETE FROM audit_trail WHERE session_id = ?').run('session-immutable');
    }).toThrowError(/append-only/i);

    store.setAuditTrailMutationEnabled(true);
    expect(() => {
      store.db.prepare('UPDATE audit_trail SET payload = ? WHERE session_id = ?').run('tampered', 'session-immutable');
    }).not.toThrow();

    expect(store.db.prepare('SELECT payload FROM audit_trail WHERE session_id = ?').get('session-immutable')).toMatchObject({
      payload: 'tampered',
    });

    store.close();
  });

  it('keeps audit_trail append-only for independent sqlite connections', () => {
    const dbPath = tracked(tmpDbPath());
    const store = createSqliteStore(dbPath);

    store.db
      .prepare('INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash) VALUES (?, ?, ?, ?, ?)')
      .run('session-external', 'tool_call', 'payload', 'sha256:0', null);
    store.close();

    const db = new Database(dbPath);
    try {
      expect(() => {
        db.prepare('UPDATE audit_trail SET payload = ? WHERE session_id = ?').run('tampered', 'session-external');
      }).toThrowError(/append-only|fbeast_can_mutate_audit_trail/i);

      expect(() => {
        db.prepare('DELETE FROM audit_trail WHERE session_id = ?').run('session-external');
      }).toThrowError(/append-only|fbeast_can_mutate_audit_trail/i);

      expect(db.prepare('SELECT payload FROM audit_trail WHERE session_id = ?').get('session-external')).toMatchObject({
        payload: 'payload',
      });
    } finally {
      db.close();
    }
  });
});
