import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { SqliteBrain } from '../../src/sqlite-brain.js';

describe('memory access audit trail', () => {
  it('records working-memory reads and writes without storing raw keys or values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'franken-memory-access-audit-'));
    const dbPath = join(dir, 'brain.db');

    try {
      const brain = new SqliteBrain(dbPath);

      brain.working.set('operator-secret', { token: 'do-not-store-in-audit' });
      expect(brain.working.get('operator-secret')).toEqual({ token: 'do-not-store-in-audit' });
      expect(brain.working.get('missing-secret')).toBeUndefined();
      expect(brain.working.delete('operator-secret')).toBe(true);

      const audit = brain.accessAudit.list({ store: 'working' });
      expect(audit.map((event) => event.operation)).toEqual([
        'working.delete',
        'working.get',
        'working.get',
        'working.set',
      ]);
      expect(audit.map((event) => event.outcome)).toEqual([
        'success',
        'miss',
        'success',
        'success',
      ]);
      expect(audit[0]?.keyHash).toBe(audit[2]?.keyHash);
      expect(audit[2]?.keyHash).toBe(audit[3]?.keyHash);
      expect(audit[1]?.keyHash).not.toBe(audit[0]?.keyHash);
      expect(JSON.stringify(audit)).not.toContain('operator-secret');
      expect(JSON.stringify(audit)).not.toContain('do-not-store-in-audit');

      brain.close();

      const rawDb = new Database(dbPath, { readonly: true });
      const rawRows = rawDb
        .prepare('SELECT operation, key_hash, details FROM memory_access_audit_events ORDER BY id ASC')
        .all() as Array<{ operation: string; key_hash: string | null; details: string | null }>;
      expect(rawRows).toHaveLength(4);
      expect(rawRows.every((row) => row.key_hash !== 'operator-secret')).toBe(true);
      expect(JSON.stringify(rawRows)).not.toContain('operator-secret');
      expect(JSON.stringify(rawRows)).not.toContain('do-not-store-in-audit');
      rawDb.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('filters audit events by operation and limit', () => {
    const brain = new SqliteBrain(':memory:');

    brain.working.set('alpha', 1);
    brain.working.get('alpha');
    brain.working.has('beta');

    expect(brain.accessAudit.list({ operation: 'working.get' })).toMatchObject([
      { operation: 'working.get', store: 'working', outcome: 'success' },
    ]);
    expect(brain.accessAudit.list({ limit: 2 })).toHaveLength(2);

    brain.close();
  });

  it('audits denied learning writes without exposing raw selectors', () => {
    const brain = new SqliteBrain(':memory:');

    brain.rightToForget({ query: 'sensitive-learning-secret' });

    expect(() => brain.episodic.recordLearning(
      {
        type: 'observation',
        summary: 'sensitive-learning-secret should stay forgotten',
        createdAt: new Date().toISOString(),
      },
      { key: 'learning-secret-key' },
    )).toThrow(/right-to-forget/);

    const deniedAudit = brain.accessAudit.list({ operation: 'episodic.recordLearning' });
    expect(deniedAudit).toMatchObject([
      {
        operation: 'episodic.recordLearning',
        store: 'episodic',
        outcome: 'denied',
      },
    ]);
    expect(deniedAudit[0]?.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(deniedAudit)).not.toContain('learning-secret-key');
    expect(JSON.stringify(deniedAudit)).not.toContain('sensitive-learning-secret');

    brain.close();
  });
});
