import { describe, it, expect, afterEach } from 'vitest';
import { createSqliteStore, type SqliteStore } from './sqlite-store.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

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
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('memory');
    expect(tables).toContain('plans');
    expect(tables).toContain('audit_trail');
    expect(tables).toContain('cost_ledger');
    expect(tables).toContain('governor_log');
    expect(tables).toContain('firewall_log');
    expect(tables).toContain('skill_state');

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

  it('creates .fbeast directory if it does not exist', () => {
    const dir = join(tmpdir(), `fbeast-test-${randomUUID()}`, '.fbeast');
    const dbPath = join(dir, 'beast.db');
    paths.push(dbPath);

    const store = createSqliteStore(dbPath);
    expect(existsSync(dir)).toBe(true);

    store.close();
  });
});
