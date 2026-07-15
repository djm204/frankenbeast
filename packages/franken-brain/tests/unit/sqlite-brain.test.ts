import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrainSnapshotSchema } from '@franken/types';
import type {
  EpisodicEvent,
  ExecutionState,
  BrainSnapshot,
} from '@franken/types';
import {
  SqliteBrain,
  WorkingMemoryLimitError,
  UnsupportedMemorySchemaVersionError,
  MemoryEncryptionKeyUnavailableError,
  MemoryEncryptionMigrationRequiredError,
  MemoryEncryptionRequiredError,
  MemoryEncryptionWrongKeyError,
  CURRENT_MEMORY_SCHEMA_VERSION,
  DEFAULT_WORKING_MEMORY_LIMITS,
} from '../../src/sqlite-brain.js';

describe('SqliteBrain', () => {
  let brain: SqliteBrain;

  const queryGuardHash = (value: string): string => {
    const normalized = value.trim().toLowerCase();
    return `${normalized.length}:${createHash('sha256').update(normalized).digest('hex')}`;
  };

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

    it('expires temporary operational working facts after their expiresAt timestamp', () => {
      brain.working.set('session:temp', {
        value: 'temporary process id',
        category: 'temporary-operational',
        sourceScope: 'runtime',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });
      brain.working.set('lesson:durable', {
        value: 'durable lesson',
        category: 'lesson',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
      try {
        expect(brain.working.get('session:temp')).toBeUndefined();
        expect(brain.working.has('session:temp')).toBe(false);
        expect(brain.working.keys()).toEqual(['lesson:durable']);
        expect(brain.working.snapshot()).toEqual({
          'lesson:durable': { value: 'durable lesson', category: 'lesson' },
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not expire durable episodic memories when working facts expire', () => {
      brain.working.set('handoff:temp', {
        value: 'temporary handoff',
        category: 'temporary-operational',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'learning',
        summary: 'Durable lesson survives working TTL cleanup',
        details: { category: 'lesson' },
        createdAt: '2025-12-31T23:59:00.000Z',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
      try {
        expect(brain.working.has('handoff:temp')).toBe(false);
        expect(brain.episodic.recall('Durable lesson', 5)).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('purges expired persisted working facts during hydration', () => {
      const dir = mkdtempSync(join(tmpdir(), 'franken-memory-ttl-'));
      const dbPath = join(dir, 'brain.db');
      const originalBrain = new SqliteBrain(dbPath);
      originalBrain.working.set('op:expired', {
        value: 'stale job output',
        category: 'temporary-operational',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      originalBrain.working.set('op:active', {
        value: 'current job output',
        category: 'temporary-operational',
        expiresAt: '2099-01-01T00:10:00.000Z',
      });
      originalBrain.flush();
      originalBrain.close();

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2099-01-01T00:00:01.000Z'));
      const hydratedBrain = new SqliteBrain(dbPath);
      try {
        expect(hydratedBrain.working.has('op:expired')).toBe(false);
        expect(hydratedBrain.working.get('op:active')).toEqual({
          value: 'current job output',
          category: 'temporary-operational',
          expiresAt: '2099-01-01T00:10:00.000Z',
        });
        const db = new Database(dbPath, { readonly: true });
        try {
          const rows = db.prepare('SELECT key FROM working_memory ORDER BY key').all() as Array<{ key: string }>;
          expect(rows.map(row => row.key)).toEqual(['op:active']);
        } finally {
          db.close();
        }
      } finally {
        hydratedBrain.close();
        vi.useRealTimers();
        rmSync(dir, { recursive: true, force: true });
      }
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

  describe('right-to-forget deletion workflow', () => {
    it('deletes selected working and episodic memories without echoing sensitive selectors', () => {
      brain.working.set('pii:email', {
        value: 'alice@example.test',
        category: 'pii',
        sourceScope: 'import-1',
      });
      brain.working.set('safe', { value: 'keep me', category: 'notes' });
      brain.episodic.record({
        type: 'observation',
        summary: 'User email alice@example.test was imported',
        details: { category: 'pii', sourceScope: 'import-1' },
        createdAt: new Date().toISOString(),
      });
      brain.episodic.record({
        type: 'observation',
        summary: 'Safe project note',
        details: { category: 'notes' },
        createdAt: new Date().toISOString(),
      });

      const report = brain.rightToForget({ query: 'alice@example.test', category: 'pii', sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 1, episodic: 1, derived: 1 });
      expect(report.remainingReferences).toBe(0);
      expect(report.selectorHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(report)).not.toContain('alice@example.test');
      expect(brain.working.has('pii:email')).toBe(false);
      expect(brain.working.get('safe')).toEqual({ value: 'keep me', category: 'notes' });
      expect(brain.episodic.recall('alice@example.test', 5)).toEqual([]);
      expect(brain.episodic.recall('Safe project note', 5)).toHaveLength(1);
      expect(brain.episodic.recent(5).some(event => event.step === 'right-to-forget')).toBe(true);
    });

    it('supports dry-run counts without deleting or auditing', () => {
      brain.working.set('pii:phone', { value: '+15555550123', category: 'pii' });
      brain.episodic.record({
        type: 'observation',
        summary: 'Phone +15555550123',
        details: { category: 'pii' },
        createdAt: new Date().toISOString(),
      });

      const report = brain.rightToForget({ category: 'pii', dryRun: true });

      expect(report.dryRun).toBe(true);
      expect(report.deleted).toEqual({ working: 1, episodic: 1, derived: 1 });
      expect(report.remainingReferences).toBe(2);
      expect(report.auditEventId).toBeUndefined();
      expect(brain.working.has('pii:phone')).toBe(true);
      expect(brain.episodic.recall('+15555550123', 5)).toHaveLength(1);
    });

    it('keeps dry-run right-to-forget from creating deletion hash keys', () => {
      const snapshotBefore = brain.serialize();

      const report = brain.rightToForget({ query: 'alice@example.test', dryRun: true });
      const snapshotAfter = brain.serialize();

      expect(report.selectorHash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshotBefore.deletionGuardHashKey).toBeUndefined();
      expect(snapshotAfter.deletionGuardHashKey).toBeUndefined();
      expect(snapshotAfter.deletionGuards).toEqual([]);
    });

    it('uses ephemeral non-correlatable selector hashes for dry runs before a deletion key exists', () => {
      const first = brain.rightToForget({ category: 'pii', dryRun: true });
      const second = brain.rightToForget({ category: 'pii', dryRun: true });

      expect(first.selectorHash).toMatch(/^[a-f0-9]{64}$/);
      expect(second.selectorHash).toMatch(/^[a-f0-9]{64}$/);
      expect(second.selectorHash).not.toBe(first.selectorHash);
      expect(brain.serialize().deletionGuardHashKey).toBeUndefined();
    });

    it('guards against reintroducing forgotten working memory', () => {
      brain.working.set('pii:ssn', { value: '123-45-6789', category: 'pii' });
      brain.rightToForget({ key: 'pii:ssn', category: 'pii' });

      expect(() => brain.working.set('pii:ssn', { value: '123-45-6789', category: 'pii' })).toThrow(
        /right-to-forget/,
      );
      expect(() => brain.working.set('another-key', { value: 'other', category: 'pii' })).toThrow(/right-to-forget/);
      expect(() => brain.working.restore({ restored: { value: 'other', category: 'pii' } })).toThrow(/right-to-forget/);

      brain.rightToForget({ query: 'alice@example.test' });
      expect(() => brain.working.set('contact', { value: 'alice@example.test' })).toThrow(/right-to-forget/);
    });

    it('guards forgotten working prefixes and episodic writes without over-scoping episodic-only deletions', () => {
      brain.working.set('pii:email', { value: 'alice@example.test', category: 'pii' });
      brain.rightToForget({ category: 'pii' });

      expect(() => brain.working.set('pii:new', 'another secret')).toThrow(/right-to-forget/);
      expect(() => brain.episodic.record({
        type: 'observation',
        summary: 'alice@example.test returned',
        details: { category: 'pii' },
        createdAt: new Date().toISOString(),
      })).toThrow(/right-to-forget/);

      brain.rightToForget({ query: 'episodic-only-secret', type: 'episodic' });
      expect(() => brain.working.set('safe-working', { value: 'episodic-only-secret' })).not.toThrow();
    });

    it('does not match working-memory key selectors against episodic text when type is all', () => {
      brain.working.set('user', 'alice');
      brain.episodic.record({
        type: 'observation',
        summary: 'unrelated text mentions user as a common word',
        createdAt: new Date().toISOString(),
      });

      const report = brain.rightToForget({ key: 'user' });

      expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 0 });
      expect(brain.episodic.recall('common word', 5)).toHaveLength(1);
    });

    it('deletes matching persisted working memory rows that were not hydrated in this instance', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-persisted-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const writer = new SqliteBrain(dbPath);
        writer.working.set('pii:email', { value: 'alice@example.test', category: 'pii' });
        writer.flush();
        writer.close();

        const stale = new SqliteBrain(dbPath, undefined, { hydrateWorkingMemoryFromDb: false });
        const report = stale.rightToForget({ query: 'alice@example.test' });

        expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 0 });
        stale.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.has('pii:email')).toBe(false);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('deletes persisted content hidden by an unflushed runtime overwrite without deleting the overwrite', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-overwrite-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const brainWithOverlay = new SqliteBrain(dbPath);
        brainWithOverlay.working.set('contact', 'alice@example.test');
        brainWithOverlay.flush();
        brainWithOverlay.working.set('contact', 'bob@example.test');

        const report = brainWithOverlay.rightToForget({ query: 'alice@example.test' });

        expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 0 });
        expect(brainWithOverlay.working.get('contact')).toBe('bob@example.test');
        brainWithOverlay.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.has('contact')).toBe(false);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('guards sourceScope reinsertions using middle key segments', () => {
      brain.working.set('project:import-1:item', 'secret');
      brain.rightToForget({ sourceScope: 'import-1' });

      expect(() => brain.working.set('project:import-1:new-item', 'secret')).toThrow(/right-to-forget/);
    });

    it('deletes episodic events whose step matches the query selector', () => {
      brain.episodic.record({
        type: 'observation',
        step: 'alice@example.test',
        summary: 'harmless summary',
        createdAt: new Date().toISOString(),
      });

      const report = brain.rightToForget({ query: 'alice@example.test' });

      expect(report.deleted).toEqual({ working: 0, episodic: 1, derived: 1 });
      expect(brain.episodic.recent(5).filter(event => event.step === 'alice@example.test')).toEqual([]);
    });

    it('guards stale working-memory flushes after another instance forgets the value', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-stale-flush-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');
        stale.flush();

        const forgetter = new SqliteBrain(dbPath);
        forgetter.rightToForget({ query: 'alice@example.test' });
        forgetter.close();

        stale.flush();
        stale.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.has('contact')).toBe(false);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('guards learning events and episodic steps after right-to-forget', () => {
      brain.episodic.record({
        type: 'observation',
        step: 'alice@example.test',
        summary: 'harmless summary',
        createdAt: new Date().toISOString(),
      });
      brain.rightToForget({ query: 'alice@example.test' });

      expect(() => brain.episodic.record({
        type: 'observation',
        step: 'alice@example.test',
        summary: 'harmless summary',
        createdAt: new Date().toISOString(),
      })).toThrow(/right-to-forget/);
      expect(() => brain.episodic.recordLearning({
        type: 'observation',
        summary: 'alice@example.test returned',
        createdAt: new Date().toISOString(),
      })).toThrow(/right-to-forget/);
    });

    it('guards query matches in working-memory keys and substrings', () => {
      brain.rightToForget({ query: 'alice@example.test' });
      expect(() => brain.working.set('alice@example.test', 'ok')).toThrow(/right-to-forget/);

      brain.rightToForget({ query: 'secret-token' });
      expect(() => brain.working.set('contact', 'mysecret-tokenvalue')).toThrow(/right-to-forget/);
      expect(() => brain.working.set('long-contact', `${'x'.repeat(5000)}secret-token`)).toThrow(/right-to-forget/);
    });

    it('does not guard standalone tokens from a multi-word query selector', () => {
      brain.rightToForget({ query: 'secret token' });

      expect(() => brain.working.set('standalone-token', 'token')).not.toThrow();
      expect(() => brain.working.set('phrase-token', 'contains secret token phrase')).toThrow(/right-to-forget/);
    });

    it('rejects short query selectors instead of installing incomplete substring guards', () => {
      expect(() => brain.rightToForget({ query: 'abc' })).toThrow(/at least 8/);
    });

    it('deletes episodic sourceScope markers with optional spacing', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'imported scoped record',
        details: 'sourceScope: import-1',
        createdAt: new Date().toISOString(),
      });

      const report = brain.rightToForget({ sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 0, episodic: 1, derived: 1 });
      expect(brain.episodic.recall('scoped record', 5)).toEqual([]);
    });

    it('deletes working and checkpoint sourceScope markers with optional spacing', () => {
      brain.working.set('plain-scoped-record', 'sourceScope: import-1');
      brain.recovery.checkpoint({
        runId: 'run-spaced-source-marker',
        phase: 'execution',
        step: 1,
        context: { note: 'sourceScope: import-1 marker' },
        timestamp: '2026-07-13T00:03:10.000Z',
      });

      const report = brain.rightToForget({ sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 1 });
      expect(brain.working.has('plain-scoped-record')).toBe(false);
      expect(() => brain.working.set('plain-scoped-record-2', 'sourceScope: import-1')).toThrow(/right-to-forget/);
      expect(brain.recovery.lastCheckpoint()).toBeNull();
    });

    it('expires forgotten rows from other live working-memory instances', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-live-expire-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');
        stale.flush();

        const forgetter = new SqliteBrain(dbPath);
        forgetter.rightToForget({ query: 'alice@example.test' });

        expect(stale.working.get('contact')).toBeUndefined();
        expect(stale.working.snapshot()).not.toHaveProperty('contact');

        forgetter.close();
        stale.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('invalidates cached working-memory reads after another process writes deletion guards', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-cross-process-read-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');
        stale.flush();

        db = new Database(dbPath);
        db.prepare(`INSERT INTO memory_deletion_guards (selector_hash, guard_kind, value_hash, created_at) VALUES (?, ?, ?, ?)`).run(
          'selector-hash',
          'working:query',
          queryGuardHash('alice@example.test'),
          '2026-07-14T00:00:00.000Z',
        );
        db.prepare(`DELETE FROM working_memory WHERE key = ?`).run('contact');
        db.close();
        db = undefined;

        expect(stale.working.get('contact')).toBeUndefined();
        expect(stale.working.has('contact')).toBe(false);
        expect(stale.working.snapshot()).not.toHaveProperty('contact');
      } finally {
        db?.close();
        stale?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('counts unflushed live runtime matches deleted from other instances', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-live-count-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');

        const forgetter = new SqliteBrain(dbPath);
        const report = forgetter.rightToForget({ query: 'alice@example.test' });

        expect(report.deleted.working).toBe(1);
        expect(stale.working.get('contact')).toBeUndefined();

        forgetter.close();
        stale.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('includes unflushed live runtime matches in dry-run remaining references', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-live-dry-run-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');

        const forgetter = new SqliteBrain(dbPath);
        const report = forgetter.rightToForget({ query: 'alice@example.test', dryRun: true });

        expect(report.deleted.working).toBe(1);
        expect(report.remainingReferences).toBe(1);
        expect(stale.working.get('contact')).toBe('alice@example.test');

        forgetter.close();
        stale.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps dry-run from expiring live working memory that matches existing deletion guards', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-dry-run-no-expire-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');

        db = new Database(dbPath);
        db.prepare(`INSERT INTO memory_deletion_guards (selector_hash, guard_kind, value_hash, created_at) VALUES (?, ?, ?, ?)`).run(
          'selector-hash',
          'working:query',
          queryGuardHash('alice@example.test'),
          '2026-07-14T00:00:00.000Z',
        );
        db.close();
        db = undefined;

        const preview = new SqliteBrain(dbPath);
        const report = preview.rightToForget({ query: 'alice@example.test', dryRun: true });
        preview.close();

        expect(report.dryRun).toBe(true);
        expect(stale.working.matchingRuntimeKeys(
          { query: 'alice@example.test', type: 'all' },
          { expireGuardedEntries: false },
        )).toEqual(['contact']);
      } finally {
        db?.close();
        stale?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('normalizes live database paths when expiring forgotten rows', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-live-path-'));
      const dbPath = join(dir, 'brain.db');
      const cwd = process.cwd();
      let stale: SqliteBrain | undefined;
      let forgetter: SqliteBrain | undefined;

      try {
        process.chdir(dir);
        stale = new SqliteBrain('./brain.db');
        stale.working.set('contact', 'alice@example.test');
        stale.flush();

        forgetter = new SqliteBrain(dbPath);
        forgetter.rightToForget({ query: 'alice@example.test' });

        expect(stale.working.get('contact')).toBeUndefined();
      } finally {
        forgetter?.close();
        stale?.close();
        process.chdir(cwd);
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('restores safe persisted rows when expiring matching live overlays', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-live-safe-overlay-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let forgetter: SqliteBrain | undefined;

      try {
        stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'safe persisted value');
        stale.flush();
        stale.working.set('contact', 'alice@example.test transient overwrite');

        forgetter = new SqliteBrain(dbPath);
        forgetter.rightToForget({ query: 'alice@example.test' });

        expect(stale.working.get('contact')).toBe('safe persisted value');
        stale.flush();
        forgetter.close();
        forgetter = new SqliteBrain(dbPath);
        expect(forgetter.working.get('contact')).toBe('safe persisted value');
      } finally {
        forgetter?.close();
        stale?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('preserves safe persisted rows when flushing after an external query guard drops a dirty overlay', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-flush-safe-overlay-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'safe persisted value');
        stale.flush();
        stale.working.set('contact', 'alice@example.test transient overwrite');

        db = new Database(dbPath);
        db.prepare(`INSERT INTO memory_deletion_guards (selector_hash, guard_kind, value_hash, created_at) VALUES (?, ?, ?, ?)`).run(
          'selector-hash',
          'working:query',
          queryGuardHash('alice@example.test'),
          '2026-07-14T00:00:00.000Z',
        );
        db.close();
        db = undefined;

        stale.flush();
        stale.close();
        stale = new SqliteBrain(dbPath);

        expect(stale.working.get('contact')).toBe('safe persisted value');
      } finally {
        db?.close();
        stale?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('deletes and guards checkpoints for all-memory query deletions', () => {
      brain.recovery.checkpoint({
        runId: 'run-right-to-forget',
        phase: 'execution',
        step: 1,
        context: { note: 'alice@example.test checkpoint payload' },
        timestamp: '2026-07-13T00:00:00.000Z',
      });

      const report = brain.rightToForget({ query: 'alice@example.test' });

      expect(report.deleted).toEqual({ working: 0, episodic: 0, derived: 1 });
      expect(report.remainingReferences).toBe(0);
      expect(brain.recovery.lastCheckpoint()).toBeNull();
      expect(() => brain.recovery.checkpoint({
        runId: 'run-right-to-forget-reinsert',
        phase: 'execution',
        step: 2,
        context: { note: 'xalice@example.testy' },
        timestamp: '2026-07-13T00:01:00.000Z',
      })).toThrow(/right-to-forget/);
    });

    it('matches terminal sourceScope key segments', () => {
      brain.working.set('project:import-1', 'secret');
      const report = brain.rightToForget({ sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 0 });
      expect(brain.working.has('project:import-1')).toBe(false);
      expect(() => brain.working.set('project:import-1', 'secret')).toThrow(/right-to-forget/);
    });

    it('matches exact sourceScope working-memory keys', () => {
      brain.working.set('import-1', 'secret');
      const report = brain.rightToForget({ sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 0 });
      expect(brain.working.has('import-1')).toBe(false);
      expect(() => brain.working.set('import-1', 'secret')).toThrow(/right-to-forget/);
    });

    it('matches leading sourceScope key prefixes for deletion and reinsertion guards', () => {
      brain.working.set('import-1:contact', 'secret');
      const report = brain.rightToForget({ sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 1, episodic: 0, derived: 0 });
      expect(brain.working.has('import-1:contact')).toBe(false);
      expect(() => brain.working.set('import-1:next-contact', 'secret')).toThrow(/right-to-forget/);
    });

    it('matches exact multi-word metadata array items for deletion and guards', () => {
      brain.working.set('array-working', { value: 'contact', categories: ['personal info', 'billing'], sourceScope: ['customer import 1', 'batch-2'] });
      brain.episodic.record({
        type: 'observation',
        summary: 'array scoped event',
        details: { categories: ['personal info', 'billing'], sourceScope: ['customer import 1', 'batch-2'] } as unknown as Record<string, string>,
        createdAt: new Date().toISOString(),
      });
      brain.recovery.checkpoint({
        runId: 'run-array-metadata',
        phase: 'execution',
        step: 1,
        context: { categories: ['personal info', 'billing'], sourceScope: ['customer import 1', 'batch-2'] },
        timestamp: '2026-07-13T00:03:25.000Z',
      });

      const categoryReport = brain.rightToForget({ category: 'personal info' });

      expect(categoryReport.deleted).toEqual({ working: 1, episodic: 1, derived: 2 });
      expect(categoryReport.remainingReferences).toBe(0);
      expect(() => brain.working.set('array-working-2', { categories: ['personal info', 'billing'] })).toThrow(/right-to-forget/);

      brain.working.set('source-array-working', { value: 'contact', sourceScope: ['customer import 1', 'batch-2'] });
      const sourceReport = brain.rightToForget({ sourceScope: 'customer import 1' });

      expect(sourceReport.deleted.working).toBe(1);
      expect(sourceReport.remainingReferences).toBe(0);
      expect(() => brain.working.set('source-array-working-2', { sourceScope: ['customer import 1', 'batch-2'] })).toThrow(/right-to-forget/);
    });

    it('checks every metadata alias before deciding category and sourceScope matches', () => {
      brain.working.set('aliased-working', {
        value: 'contact',
        category: 'safe',
        categories: ['pii'],
        sourceScope: 'safe-import',
        source: 'import-1',
      });
      brain.episodic.record({
        type: 'observation',
        summary: 'aliased event',
        details: {
          category: 'safe',
          categories: ['pii'],
          sourceScope: 'safe-import',
          source: 'import-1',
        },
        createdAt: new Date().toISOString(),
      });
      brain.recovery.checkpoint({
        runId: 'run-aliased-metadata',
        phase: 'execution',
        step: 1,
        context: {
          category: 'safe',
          categories: ['pii'],
          sourceScope: 'safe-import',
          source: 'import-1',
        },
        timestamp: '2026-07-13T00:03:27.000Z',
      });

      const categoryReport = brain.rightToForget({ category: 'pii' });

      expect(categoryReport.deleted).toEqual({ working: 1, episodic: 1, derived: 2 });
      expect(categoryReport.remainingReferences).toBe(0);
      expect(() => brain.working.set('aliased-category-reinsert', { category: 'safe', categories: ['pii'] })).toThrow(/right-to-forget/);

      brain.working.set('aliased-source-working', { sourceScope: 'safe-import', source: 'import-1' });
      const sourceReport = brain.rightToForget({ sourceScope: 'import-1' });

      expect(sourceReport.deleted.working).toBe(1);
      expect(sourceReport.remainingReferences).toBe(0);
      expect(() => brain.working.set('aliased-source-reinsert', { sourceScope: 'safe-import', source: 'import-1' })).toThrow(/right-to-forget/);
    });

    it('deletes spaced category markers in episodic and checkpoint rows', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'category: pii scoped event',
        details: 'contains a marker',
        createdAt: new Date().toISOString(),
      });
      brain.recovery.checkpoint({
        runId: 'run-spaced-category',
        phase: 'execution',
        step: 1,
        context: { value: 'category: pii' },
        timestamp: '2026-07-13T00:03:20.000Z',
      });

      const report = brain.rightToForget({ category: 'pii' });

      expect(report.deleted).toMatchObject({ episodic: 1 });
      expect(report.deleted.derived).toBeGreaterThanOrEqual(1);
      expect(brain.episodic.recall('scoped event', 5)).toEqual([]);
      expect(brain.recovery.lastCheckpoint()).toBeNull();
    });

    it('deletes and guards multi-word category metadata', () => {
      brain.working.set('profile', { category: 'personal info', value: 'secret' });
      brain.episodic.record({
        type: 'observation',
        summary: 'personal profile',
        details: { category: 'personal info' },
        createdAt: new Date().toISOString(),
      });
      brain.recovery.checkpoint({
        runId: 'run-multi-category',
        phase: 'execution',
        step: 1,
        context: { category: 'personal info' },
        timestamp: '2026-07-13T00:03:25.000Z',
      });

      const report = brain.rightToForget({ category: 'personal info' });

      expect(report.deleted).toMatchObject({ working: 1, episodic: 1 });
      expect(report.deleted.derived).toBeGreaterThanOrEqual(1);
      expect(() => brain.working.set('profile-2', { category: 'personal info' })).toThrow(/right-to-forget/);
      expect(() => brain.episodic.record({
        type: 'observation',
        summary: 'another profile',
        details: { category: 'personal info' },
        createdAt: new Date().toISOString(),
      })).toThrow(/right-to-forget/);
      expect(() => brain.recovery.checkpoint({
        runId: 'run-multi-category-reinsert',
        phase: 'execution',
        step: 2,
        context: { category: 'personal info' },
        timestamp: '2026-07-13T00:03:26.000Z',
      })).toThrow(/right-to-forget/);
    });

    it('preserves exact working-memory keys with surrounding spaces', () => {
      brain.working.set(' pii ', 'secret');
      const report = brain.rightToForget({ key: ' pii ' });

      expect(report.deleted.working).toBe(1);
      expect(brain.working.has(' pii ')).toBe(false);
      expect(() => brain.working.set(' pii ', 'secret')).toThrow(/right-to-forget/);
    });

    it('guards composite sourceScope key segments', () => {
      brain.working.set('project:tenant:123:item', 'secret');
      const report = brain.rightToForget({ sourceScope: 'tenant:123' });

      expect(report.deleted.working).toBe(1);
      expect(() => brain.working.set('project:tenant:123:new', 'secret')).toThrow(/right-to-forget/);
    });

    it('guards composite category key prefixes and checkpoint markers', () => {
      brain.working.set('tenant:123:item', { value: 'pii' });
      brain.recovery.checkpoint({
        runId: 'run-category',
        phase: 'execution',
        step: 1,
        context: { value: 'category:tenant:123' },
        timestamp: new Date().toISOString(),
      });

      const result = brain.rightToForget({ category: 'tenant:123' });

      expect(result.deleted).toMatchObject({ working: 1, derived: 1 });
      expect(() => brain.working.set('tenant:123:new', { value: 'blocked' })).toThrow(/right-to-forget/);
      expect(() => brain.working.set('project:tenant:123:task', { value: 'allowed' })).not.toThrow();
      expect(() => brain.recovery.checkpoint({
        runId: 'run-category-marker-reinsert',
        phase: 'execution',
        step: 2,
        context: { note: 'category:tenant:123 again' },
        timestamp: '2026-07-13T00:03:00.000Z',
      })).toThrow(/right-to-forget/);
    });

    it('deletes and guards sourceScope checkpoint markers', () => {
      brain.recovery.checkpoint({
        runId: 'run-source-marker',
        phase: 'execution',
        step: 1,
        context: { note: 'sourceScope:import-1 marker' },
        timestamp: '2026-07-13T00:03:30.000Z',
      });

      const report = brain.rightToForget({ sourceScope: 'import-1' });

      expect(report.deleted).toEqual({ working: 0, episodic: 0, derived: 1 });
      expect(brain.recovery.lastCheckpoint()).toBeNull();
      expect(() => brain.episodic.record({
        type: 'observation',
        step: 'replay',
        summary: 'sourceScope:import-1 again',
      })).toThrow(/right-to-forget/);
      expect(() => brain.recovery.checkpoint({
        runId: 'run-source-marker-reinsert',
        phase: 'execution',
        step: 2,
        context: { note: 'sourceScope:import-1 again' },
        timestamp: '2026-07-13T00:03:45.000Z',
      })).toThrow(/right-to-forget/);
    });

    it('audits guard-only forgets and preserves prior deletion audits', () => {
      const absentReport = brain.rightToForget({ query: 'absent-pii-value' });
      expect(absentReport.deleted).toEqual({ working: 0, episodic: 0, derived: 0 });
      expect(absentReport.auditEventId).toEqual(expect.any(Number));

      const auditCountBefore = brain.episodic.recent(10).filter(event => event.step === 'right-to-forget').length;
      const report = brain.rightToForget({ query: 'right-to-forget' });

      expect(report.auditEventId).toEqual(expect.any(Number));
      expect(report.deleted.episodic).toBe(0);
      const auditEvents = brain.episodic.recent(10).filter(event => event.step === 'right-to-forget');
      expect(auditEvents).toHaveLength(auditCountBefore + 1);
    });

    it('guards long query substrings without requiring exact whole-value matches', () => {
      const longSecret = `tok_${'a'.repeat(140)}_tail`;
      brain.working.set('long-token', `prefix ${longSecret} suffix`);
      const report = brain.rightToForget({ query: longSecret });

      expect(report.deleted.working).toBe(1);
      expect(() => brain.working.set('long-token-2', `other ${longSecret} copy`)).toThrow(/right-to-forget/);
      expect(() => brain.working.set('unrelated-short-fragment', 'ice test note')).not.toThrow();
    });

    it('aligns category key guards with category deletion key-prefix scope', () => {
      brain.rightToForget({ category: 'prod' });

      expect(() => brain.working.set('prod', 'secret')).toThrow(/right-to-forget/);
      expect(() => brain.working.set('prod:task', 'secret')).toThrow(/right-to-forget/);
      expect(() => brain.working.set('project:prod:task', 'allowed unrelated key segment')).not.toThrow();
    });

    it('guards exact multi-segment category key matches after deletion', () => {
      brain.working.set('tenant:123', 'secret');

      const report = brain.rightToForget({ category: 'tenant:123' });

      expect(report.deleted.working).toBe(1);
      expect(() => brain.working.set('tenant:123', 'secret again')).toThrow(/right-to-forget/);
    });

    it('counts dry-run matches from other live unflushed working-memory instances', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-rtf-dry-live-count-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const stale = new SqliteBrain(dbPath);
        stale.working.set('contact', 'alice@example.test');

        const forgetter = new SqliteBrain(dbPath);
        const report = forgetter.rightToForget({ query: 'alice@example.test', dryRun: true });

        expect(report.deleted.working).toBe(1);
        expect(report.remainingReferences).toBeGreaterThanOrEqual(1);
        expect(stale.working.get('contact')).toBe('alice@example.test');

        forgetter.close();
        stale.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('deletes and guards working rows that contain spaced category markers', () => {
      brain.working.set('marker-only', 'category: pii');

      const report = brain.rightToForget({ category: 'pii' });

      expect(report.deleted.working).toBe(1);
      expect(brain.working.has('marker-only')).toBe(false);
      expect(() => brain.working.set('marker-again', 'category: pii')).toThrow(/right-to-forget/);
    });

    it('uses keyed deletion hashes instead of deterministic unsalted selector and guard hashes', () => {
      const selector = { category: 'pii', query: 'alice@example.test', type: 'all' };
      const report = brain.rightToForget(selector);
      const snapshot = brain.serialize();

      const deterministicSelectorHash = createHash('sha256')
        .update(JSON.stringify(selector))
        .digest('hex');
      const deterministicGuardHash = queryGuardHash('alice@example.test');

      expect(report.selectorHash).toMatch(/^[a-f0-9]{64}$/);
      expect(report.selectorHash).not.toBe(deterministicSelectorHash);
      expect(snapshot.deletionGuards?.some((guard) => guard.valueHash === deterministicGuardHash)).toBe(false);
      expect(snapshot.deletionGuardHashKey).toEqual(expect.any(String));
    });

    it('requires at least one selector', () => {
      expect(() => brain.rightToForget({})).toThrow(/requires at least one/);
    });

    it('rejects short query selectors that cannot be safely guarded', () => {
      expect(() => brain.rightToForget({ query: '1234567' })).toThrow(/at least 8/);
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
      expect(() => bounded.working.set('c', 3)).toThrow(
        WorkingMemoryLimitError,
      );
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
      expect(() => bounded.working.set('big', 'x'.repeat(100))).toThrow(
        WorkingMemoryLimitError,
      );
      bounded.close();
    });

    it('rejects writes that would exceed maxTotalBytes', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      bounded.working.set('a', 'x'.repeat(10));
      expect(() => bounded.working.set('b', 'y'.repeat(20))).toThrow(
        WorkingMemoryLimitError,
      );
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
      expect(() => bounded.working.restore({ a: 1, b: 2 })).toThrow(
        WorkingMemoryLimitError,
      );
      bounded.close();
    });

    it('tracks usage as entries are added, counting key and value bytes', () => {
      brain.working.set('a', 'hello');
      const usage = brain.working.usage();
      expect(usage.entries).toBe(1);
      expect(usage.totalBytes).toBe(
        'a'.length + JSON.stringify('hello').length,
      );
    });

    it('counts key bytes against the byte budget', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      expect(() => bounded.working.set('k'.repeat(40), 1)).toThrow(
        WorkingMemoryLimitError,
      );
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

      expect(() => brain.working.set('cycle', circular)).toThrow(
        WorkingMemoryLimitError,
      );
      expect(() => brain.working.restore({ cycle: circular })).toThrow(
        WorkingMemoryLimitError,
      );
      expect(brain.working.snapshot()).toEqual({
        safe: { status: 'persisted' },
      });
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
      expect(() =>
        SqliteBrain.hydrate(snapshot, ':memory:', { maxEntries: 10 }),
      ).toThrow(WorkingMemoryLimitError);
      const hydrated = SqliteBrain.hydrate(snapshot, ':memory:', {
        maxEntries: 20_000,
      });
      expect(hydrated.working.keys()).toHaveLength(15);
      hydrated.close();
    });

    it('hydrate() ignores deletion hash key mismatches when no guards exist', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-hydrate-no-guards-key-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const seeded = new SqliteBrain(dbPath);
        seeded.close();
        const db = new Database(dbPath);
        db.prepare(`INSERT INTO memory_deletion_hash_keys (id, key_material, created_at, schema_version) VALUES (?, ?, ?, ?)`).run(
          'right-to-forget-hmac-v1',
          'existing-unused-key',
          '2026-07-14T00:00:00.000Z',
          CURRENT_MEMORY_SCHEMA_VERSION,
        );
        db.close();

        const hydrated = SqliteBrain.hydrate({
          version: 1,
          timestamp: '2026-07-14T00:00:00.000Z',
          working: { safe: 'value' },
          episodic: [],
          checkpoint: null,
          deletionGuards: [],
          deletionGuardHashKey: 'different-unused-key',
          metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
        }, dbPath);

        expect(hydrated.working.get('safe')).toBe('value');
        expect(hydrated.serialize().deletionGuards).toEqual([]);
        hydrated.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrate() accepts legacy deletion guard snapshots without hash keys', () => {
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-07-14T00:00:00.000Z',
        working: { safe: 'value' },
        episodic: [],
        checkpoint: null,
        deletionGuards: [{
          selectorHash: 'legacy-selector-hash',
          guardKind: 'working:query',
          valueHash: queryGuardHash('alice@example.test'),
          createdAt: '2026-07-14T00:00:00.000Z',
          schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
        }],
        metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
      };

      const hydrated = SqliteBrain.hydrate(snapshot);

      expect(hydrated.working.get('safe')).toBe('value');
      expect(() => hydrated.working.set('contact', 'alice@example.test')).toThrow(/right-to-forget/);
      hydrated.close();
    });

    it('hydrate() rejects keyed deletion guard snapshots without hash keys', () => {
      const source = new SqliteBrain();
      source.rightToForget({ query: 'alice@example.test' });
      const snapshot = source.serialize();
      source.close();
      const strippedSnapshot: BrainSnapshot = {
        ...snapshot,
        deletionGuardHashKey: undefined,
      };

      expect(() => SqliteBrain.hydrate(strippedSnapshot)).toThrow(/hash key material/);
    });

    it('caps query guard replay scans instead of running unbounded per-candidate checks', () => {
      brain.rightToForget({ query: 'abcdefgh' });

      const largeToken = Array.from({ length: 7_000 }, (_, index) => index.toString(36).padStart(4, '0')).join('');

      expect(() => brain.working.set('large-token', largeToken)).toThrow(/cannot be safely evaluated/);
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
        const returned = persistent.working.get('rules') as {
          nested: { steps: string[] };
        };

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

      const snap = brain.working.snapshot() as {
        rules: { nested: { items: Array<{ name: string }> } };
      };
      snap.rules.nested.items[0].name = 'unvalidated';
      snap.rules.nested.items.push({ name: 'oversized'.repeat(100) });

      expect(brain.working.snapshot()).toEqual({ rules: validated });
      expect(brain.working.get('rules')).toEqual(validated);
      expect(brain.working.usage().totalBytes).toBe(accountedBytes);
    });
  });

  describe('memory review and consent queue', () => {
    it('shows proposed memory candidates with review metadata before persistence', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        source: 'chat:turn-42',
        confidence: 0.92,
        reason: 'User explicitly requested concise responses.',
      });

      expect(candidate).toMatchObject({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        source: 'chat:turn-42',
        confidence: 0.92,
        reason: 'User explicitly requested concise responses.',
        status: 'pending',
      });
      expect(candidate.id).toMatch(/^memcand_/);
      expect(candidate.createdAt).toMatch(/Z$/);
      expect(brain.working.has('user.preference.response-style')).toBe(false);
      expect(brain.memoryReview.list()).toEqual([candidate]);
    });

    it('approves a candidate atomically and stores provenance metadata', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'main',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Observed from GitHub repository metadata.',
      });

      const result = brain.memoryReview.approve(candidate.id, {
        reviewer: 'operator',
        note: 'Verified in repository settings.',
      });

      expect(result.status).toBe('approved');
      expect(brain.working.get('env.repo.default-branch')).toBe('main');
      expect(
        brain.memoryReview.provenanceFor('working', 'env.repo.default-branch'),
      ).toMatchObject({
        candidateId: candidate.id,
        targetStore: 'working',
        key: 'env.repo.default-branch',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Observed from GitHub repository metadata.',
        reviewer: 'operator',
        note: 'Verified in repository settings.',
      });
    });

    it('edits a candidate before approval and writes the edited memory', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.tone',
        value: 'formal',
        source: 'chat:turn-7',
        confidence: 0.7,
        reason: 'Inferred from wording.',
      });

      const edited = brain.memoryReview.edit(candidate.id, {
        value: 'direct but respectful',
        confidence: 0.95,
        reason: 'Operator corrected inferred tone preference.',
      });
      expect(edited).toMatchObject({
        value: 'direct but respectful',
        confidence: 0.95,
        reason: 'Operator corrected inferred tone preference.',
        status: 'pending',
      });

      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

      expect(brain.working.get('user.preference.tone')).toBe(
        'direct but respectful',
      );
      expect(
        brain.memoryReview.provenanceFor('working', 'user.preference.tone'),
      ).toMatchObject({
        value: 'direct but respectful',
        confidence: 0.95,
      });
    });

    it('rejects a candidate without writing memory and suppresses duplicate evidence', () => {
      const proposal = {
        targetStore: 'working' as const,
        key: 'user.location.city',
        value: 'Paris',
        source: 'chat:turn-9',
        evidenceId: 'msg-9',
        confidence: 0.55,
        reason: 'Weak inference from travel discussion.',
      };
      const candidate = brain.memoryReview.propose(proposal);

      const rejected = brain.memoryReview.reject(candidate.id, {
        reviewer: 'operator',
        note: 'Travel mention is not residence.',
      });

      expect(rejected.status).toBe('rejected');
      expect(brain.working.has('user.location.city')).toBe(false);
      expect(brain.memoryReview.propose(proposal)).toMatchObject({
        status: 'suppressed',
        suppressionReason: 'rejected',
        source: 'chat:turn-9',
        evidenceId: 'msg-9',
      });
    });

    it('marks a candidate as never-store and suppresses future matching proposals', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.secret.api-token',
        value: 'sk-test-redacted',
        source: 'terminal-output',
        confidence: 0.99,
        reason: 'Sensitive token should not persist without consent.',
      });

      const neverStored = brain.memoryReview.neverStore(candidate.id, {
        reviewer: 'operator',
        note: 'Secrets must never be stored in memory.',
      });

      expect(neverStored.status).toBe('never_store');
      expect(brain.working.has('env.secret.api-token')).toBe(false);
      expect(brain.memoryReview.propose({
          targetStore: 'working',
          key: 'env.secret.api-token',
          value: '«redacted:sk-…»',
          source: 'later-terminal-output',
          confidence: 0.99,
          reason: 'Same secret appeared again.',
        }),
      ).toMatchObject({
        status: 'suppressed',
        suppressionReason: 'never_store',
      });
    });

    it('redacts never-store candidate and suppression payloads at rest', () => {
      const secret = 'sk-live-secret-that-must-not-persist';
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.secret.api-token',
        value: secret,
        source: 'terminal-output',
        confidence: 0.99,
        reason: 'Sensitive token should not persist without consent.',
      });

      const neverStored = brain.memoryReview.neverStore(candidate.id, {
        reviewer: 'operator',
      });

      expect(neverStored.value).toBe('[never-store-redacted]');
      const db = (brain as unknown as { db: Database.Database }).db;
      const candidateRow = db
        .prepare(`SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_candidates WHERE id = ?`)
        .get(candidate.id) as { value: string; source: string; evidence_id: string | null; reason: string; reviewer: string | null; note: string | null };
      const suppressionRow = db
        .prepare(`SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_suppressions`)
        .get() as { value: string; source: string; evidence_id: string | null; reason: string; reviewer: string | null; note: string | null };
      expect(candidateRow.value).toBe(JSON.stringify('[never-store-redacted]'));
      expect(suppressionRow.value).toBe(JSON.stringify('[never-store-redacted]'));
      expect(candidateRow.value).not.toContain(secret);
      expect(suppressionRow.value).not.toContain(secret);
      for (const row of [candidateRow, suppressionRow]) {
        expect(row.source).toBe('[never-store-redacted]');
        expect(row.evidence_id).toBeNull();
        expect(row.reason).toBe('[never-store-redacted]');
        expect(row.reviewer).toBeNull();
        expect(row.note).toBeNull();
      }
    });

    it('does not let stale rejection decisions overwrite settled candidates', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-review-race-'));
      const dbPath = join(dir, 'brain.db');
      const reviewerA = new SqliteBrain(dbPath);
      const reviewerB = new SqliteBrain(dbPath);

      try {
        const candidate = reviewerA.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.review-race',
          value: 'keep this memory',
          source: 'chat:turn-12',
          confidence: 0.8,
          reason: 'Operator-visible review race regression.',
        });

        reviewerB.memoryReview.approve(candidate.id, { reviewer: 'reviewer-b' });

        expect(() =>
          reviewerA.memoryReview.reject(candidate.id, { reviewer: 'reviewer-a' }),
        ).toThrow(/expected pending|no longer pending/);
        const db = (reviewerA as unknown as { db: Database.Database }).db;
        expect(
          db
            .prepare(`SELECT status FROM memory_review_candidates WHERE id = ?`)
            .get(candidate.id),
        ).toEqual({ status: 'approved' });
        expect(
          db.prepare(`SELECT COUNT(*) AS count FROM memory_review_suppressions`).get(),
        ).toEqual({ count: 0 });
      } finally {
        reviewerA.close();
        reviewerB.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('clears review candidates, provenance, and suppressions when hydrating over an existing database', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-review-hydrate-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const existing = new SqliteBrain(dbPath);
        const approved = existing.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.reviewed',
          value: 'approved memory',
          source: 'chat:turn-13',
          confidence: 0.9,
          reason: 'Hydrate should clear stale provenance.',
        });
        existing.memoryReview.approve(approved.id, { reviewer: 'operator' });
        const neverStored = existing.memoryReview.propose({
          targetStore: 'working',
          key: 'env.secret.api-token',
          value: 'stale-secret',
          source: 'terminal-output',
          confidence: 0.99,
          reason: 'Hydrate should clear stale suppressions.',
        });
        existing.memoryReview.neverStore(neverStored.id, { reviewer: 'operator' });
        const snapshot = existing.serialize();
        existing.close();

        const hydrated = SqliteBrain.hydrate(snapshot, dbPath);
        const db = (hydrated as unknown as { db: Database.Database }).db;
        expect(
          db.prepare(`SELECT COUNT(*) AS count FROM memory_review_candidates`).get(),
        ).toEqual({ count: 0 });
        expect(
          db.prepare(`SELECT COUNT(*) AS count FROM memory_review_provenance`).get(),
        ).toEqual({ count: 0 });
        expect(
          db.prepare(`SELECT COUNT(*) AS count FROM memory_review_suppressions`).get(),
        ).toEqual({ count: 0 });
        expect(
          hydrated.memoryReview.propose({
            targetStore: 'working',
            key: 'env.secret.api-token',
            value: 'stale-secret',
            source: 'later-terminal-output',
            confidence: 0.99,
            reason: 'A hydrated snapshot should not inherit stale suppression.',
          }).status,
        ).toBe('pending');
        hydrated.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('suppresses already-pending duplicates before they can be approved', () => {
      const proposal = {
        targetStore: 'working' as const,
        key: 'env.secret.api-token',
        value: 'duplicate-secret',
        source: 'terminal-output',
        confidence: 0.99,
        reason: 'Sensitive token should not persist without consent.',
      };
      const first = brain.memoryReview.propose(proposal);
      const duplicate = brain.memoryReview.propose({
        ...proposal,
        source: 'later-terminal-output',
        reason: 'Same secret appeared again.',
      });

      brain.memoryReview.neverStore(first.id, { reviewer: 'operator' });
      const suppressedDuplicate = brain.memoryReview.list('suppressed')[0];

      expect(suppressedDuplicate).toMatchObject({
        id: duplicate.id,
        status: 'suppressed',
        suppressionReason: 'never_store',
        value: '[never-store-redacted]',
      });
      expect(brain.working.has('env.secret.api-token')).toBe(false);
    });

    it('purges approved working memory and provenance when a key is marked never-store', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.sensitive',
        value: 'approved value',
        source: 'chat:turn-14',
        confidence: 0.9,
        reason: 'Initially approved memory.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });
      expect(brain.working.get('user.preference.sensitive')).toBe('approved value');
      expect(
        brain.memoryReview.provenanceFor('working', 'user.preference.sensitive'),
      ).not.toBeNull();

      const neverStored = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.sensitive',
        value: 'do not keep this key',
        source: 'chat:turn-15',
        confidence: 0.99,
        reason: 'Operator opted this key out of memory.',
      });
      brain.memoryReview.neverStore(neverStored.id, { reviewer: 'operator' });

      expect(brain.working.has('user.preference.sensitive')).toBe(false);
      expect(
        brain.memoryReview.provenanceFor('working', 'user.preference.sensitive'),
      ).toBeNull();
    });

    it('redacts review payloads that match right-to-forget selectors', () => {
      const secret = 'alice@example.test';
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'contact.review-candidate',
        value: `Candidate contains ${secret}`,
        source: 'chat:turn-secret',
        evidenceId: `evidence-${secret}`,
        confidence: 0.9,
        reason: `Review reason mentions ${secret}`,
      });
      brain.memoryReview.reject(candidate.id, {
        reviewer: `reviewer-${secret}`,
        note: `note ${secret}`,
      });

      const report = brain.rightToForget({ query: secret });

      expect(report.remainingReferences).toBe(0);
      const db = (brain as unknown as { db: Database.Database }).db;
      const rows = db.prepare(
        `SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_candidates`,
      ).all() as Array<{ value: string; source: string; evidence_id: string | null; reason: string; reviewer: string | null; note: string | null }>;
      expect(rows).toHaveLength(1);
      for (const row of rows) {
        expect(JSON.stringify(row)).not.toContain(secret);
        expect(row.value).toBe(JSON.stringify('[never-store-redacted]'));
        expect(row.source).toBe('[never-store-redacted]');
        expect(row.evidence_id).toBeNull();
        expect(row.reason).toBe('[never-store-redacted]');
        expect(row.reviewer).toBeNull();
        expect(row.note).toBeNull();
      }
    });

    it('retires pending review candidates that match right-to-forget selectors', () => {
      const secret = 'alice@example.test';
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'contact.pending-review',
        value: `Candidate contains ${secret}`,
        source: 'chat:turn-secret',
        confidence: 0.9,
        reason: 'Pending candidate should be retired by deletion.',
      });

      const report = brain.rightToForget({ query: secret });

      expect(report.remainingReferences).toBe(0);
      expect(brain.memoryReview.list()).toHaveLength(0);
      const suppressed = brain.memoryReview.list('suppressed')[0];
      expect(suppressed).toMatchObject({
        id: candidate.id,
        status: 'suppressed',
        suppressionReason: 'never_store',
        value: '[never-store-redacted]',
      });
      brain.memoryReview.approve(candidate.id);
      expect(brain.working.has('contact.pending-review')).toBe(false);
    });

    it('keeps never-store enforcement after redacting suppression keys', () => {
      const secret = 'alice@example.test';
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.secret-contact',
        value: secret,
        source: 'chat:turn-secret',
        confidence: 0.99,
        reason: 'Operator opted this key out of memory.',
      });
      brain.memoryReview.neverStore(candidate.id, { reviewer: 'operator' });

      brain.rightToForget({ query: 'secret-contact' });

      const db = (brain as unknown as { db: Database.Database }).db;
      const suppression = db
        .prepare(`SELECT memory_key, created_at FROM memory_review_suppressions`)
        .get() as { memory_key: string; created_at: string };
      expect(suppression.memory_key).not.toBe('user.preference.secret-contact');
      const legacyRedactedKey = `[never-store-redacted]:${createHash('sha256')
        .update(`user.preference.secret-contact:${suppression.created_at}`)
        .digest('hex')
        .slice(0, 12)}`;
      expect(suppression.memory_key).not.toBe(legacyRedactedKey);
      expect(() => brain.working.set('user.preference.secret-contact', 'new value')).toThrow(
        /never-store/,
      );
    });

    it('checks deletion guards before returning suppressed review proposals', () => {
      const secret = 'alice@example.test';
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.secret-contact',
        value: secret,
        source: 'chat:turn-secret',
        confidence: 0.99,
        reason: 'Operator opted this key out of memory.',
      });
      brain.memoryReview.neverStore(candidate.id, { reviewer: 'operator' });
      brain.rightToForget({ query: 'secret-contact' });

      expect(() =>
        brain.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.secret-contact',
          value: secret,
          source: 'later-chat-turn',
          confidence: 0.99,
          reason: 'Suppression should not bypass right-to-forget guards.',
        }),
      ).toThrow(/right-to-forget/);
    });

    it('uses keyed signatures for review suppressions', () => {
      const key = 'user.preference.low-entropy';
      const source = 'chat:turn-17';
      const evidenceId = 'evt-17';
      const value = 'tiny-secret';
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key,
        value,
        source,
        evidenceId,
        confidence: 0.8,
        reason: 'Rejected candidate should use keyed lookup material.',
      });

      brain.memoryReview.reject(candidate.id, { reviewer: 'operator' });

      const db = (brain as unknown as { db: Database.Database }).db;
      const suppression = db
        .prepare(`SELECT signature FROM memory_review_suppressions`)
        .get() as { signature: string };
      const legacySignature = createHash('sha256')
        .update(JSON.stringify(['rejected', 'working', key, source, evidenceId, JSON.stringify(value)]))
        .digest('hex');
      expect(suppression.signature).not.toBe(legacySignature);
      expect(
        db.prepare(`SELECT COUNT(*) AS count FROM memory_deletion_hash_keys`).get(),
      ).toEqual({ count: 1 });
    });

    it('indexes review suppression lookup by target store and memory key', () => {
      const db = (brain as unknown as { db: Database.Database }).db;
      const indexes = db.prepare(`PRAGMA index_list(memory_review_suppressions)`).all() as Array<{ name: string }>;

      expect(indexes.some(index => index.name === 'idx_memory_review_suppressions_target_key')).toBe(true);
    });

    it('does not create deletion hash keys while only checking suppressions', () => {
      const db = (brain as unknown as { db: Database.Database }).db;

      brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.new-candidate',
        value: 'safe value',
        source: 'chat:turn-no-suppression',
        confidence: 0.8,
        reason: 'Normal proposals should not create suppression signing keys.',
      });

      expect(
        db.prepare(`SELECT COUNT(*) AS count FROM memory_deletion_hash_keys`).get(),
      ).toEqual({ count: 0 });
      expect(brain.serialize()).not.toHaveProperty('deletionGuardHashKey');
    });

    it('deletes approved working memory when matching review provenance by source scope', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'main',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Repository metadata.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });
      expect(brain.working.get('env.repo.default-branch')).toBe('main');

      const report = brain.rightToForget({ sourceScope: 'repo-config' });

      expect(report.deleted.working).toBe(1);
      expect(report.remainingReferences).toBe(0);
      expect(brain.working.has('env.repo.default-branch')).toBe(false);
      expect(
        brain.memoryReview.provenanceFor('working', 'env.repo.default-branch'),
      ).toBeNull();
    });

    it('does not expose approved memory in working state when approval transaction rolls back', () => {
      const db = (brain as unknown as { db: Database.Database }).db;
      db.exec(`
        CREATE TRIGGER fail_review_provenance_insert
        BEFORE INSERT ON memory_review_provenance
        BEGIN
          SELECT RAISE(FAIL, 'forced provenance failure');
        END;
      `);
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.rollback',
        value: 'rolled back value',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Approval failure should remain atomic.',
      });

      expect(() => brain.memoryReview.approve(candidate.id, { reviewer: 'operator' })).toThrow(
        /forced provenance failure/,
      );
      expect(brain.working.has('env.repo.rollback')).toBe(false);
      expect(db.prepare(`SELECT COUNT(*) AS count FROM working_memory WHERE key = ?`).get('env.repo.rollback')).toEqual({ count: 0 });
    });

    it('uses persisted value normalization when signing suppressions', () => {
      const value = { seenAt: new Date('2026-07-14T00:00:00.000Z') };
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.timestamped',
        value,
        source: 'chat:turn-10',
        confidence: 0.8,
        reason: 'Timestamped preference candidate.',
      });

      brain.memoryReview.neverStore(candidate.id, { reviewer: 'operator' });

      expect(
        brain.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.timestamped',
          value,
          source: 'chat:turn-11',
          confidence: 0.8,
          reason: 'Same timestamped preference candidate.',
        }),
      ).toMatchObject({
        status: 'suppressed',
        suppressionReason: 'never_store',
      });
    });

    it('blocks stale working-memory flushes from resurrecting never-store keys', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-review-never-store-stale-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let reviewer: SqliteBrain | undefined;

      try {
        stale = new SqliteBrain(dbPath);
        stale.working.set('env.secret.api-token', 'stale secret value');

        reviewer = new SqliteBrain(dbPath);
        const candidate = reviewer.memoryReview.propose({
          targetStore: 'working',
          key: 'env.secret.api-token',
          value: 'new secret value',
          source: 'terminal-output',
          confidence: 0.99,
          reason: 'Operator opted this key out of memory.',
        });
        reviewer.memoryReview.neverStore(candidate.id, { reviewer: 'operator' });

        stale.flush();
        stale.close();
        stale = new SqliteBrain(dbPath);

        expect(stale.working.has('env.secret.api-token')).toBe(false);
        expect(stale.working.get('env.secret.api-token')).toBeUndefined();
      } finally {
        reviewer?.close();
        stale?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rechecks deletion guards before editing or recording review decisions', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.pending',
        value: 'safe value',
        source: 'chat:turn-safe',
        confidence: 0.8,
        reason: 'Pending candidate for guard regression.',
      });
      brain.rightToForget({ query: 'forgotten secret', sourceScope: 'blocked-source' });

      expect(() => brain.memoryReview.edit(candidate.id, {
        value: 'contains forgotten secret',
      })).toThrow(/right-to-forget/);
      expect(() => brain.memoryReview.edit(candidate.id, {
        source: 'blocked-source',
      })).toThrow(/right-to-forget/);
      expect(() => brain.memoryReview.approve(candidate.id, {
        note: 'decision mentions forgotten secret',
      })).toThrow(/right-to-forget/);
    });

    it('guards and redacts nested review candidate metadata for right-to-forget selectors', () => {
      brain.rightToForget({ category: 'pii' });
      expect(() => brain.memoryReview.propose({
        targetStore: 'working',
        key: 'review.nested-category',
        value: { category: 'pii', email: 'alice@example.test' },
        source: 'chat:turn-16',
        confidence: 0.9,
        reason: 'Nested category should be guarded.',
      })).toThrow(/right-to-forget/);

      const fresh = new SqliteBrain();
      try {
        fresh.memoryReview.propose({
          targetStore: 'working',
          key: 'review.nested-category',
          value: { category: 'pii', email: 'alice@example.test' },
          source: 'chat:turn-16',
          confidence: 0.9,
          reason: 'Nested category should be redacted.',
        });
        const report = fresh.rightToForget({ category: 'pii' });
        expect(report.deleted.derived).toBe(1);
        expect(report.remainingReferences).toBe(0);
        const db = (fresh as unknown as { db: Database.Database }).db;
        const row = db.prepare(`SELECT memory_key, value FROM memory_review_candidates`).get() as { memory_key: string; value: string };
        expect(row.memory_key).not.toContain('review.nested-category');
        expect(row.value).not.toContain('alice@example.test');
      } finally {
        fresh.close();
      }
    });

    it('refreshes persisted state before approved writes skip an upsert', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-review-stale-persist-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let concurrent: SqliteBrain | undefined;
      let verifier: SqliteBrain | undefined;

      try {
        stale = new SqliteBrain(dbPath);
        stale.working.set('preference', 'approved');
        stale.flush();

        concurrent = new SqliteBrain(dbPath);
        concurrent.working.set('preference', 'concurrent overwrite');
        concurrent.flush();

        const candidate = stale.memoryReview.propose({
          targetStore: 'working',
          key: 'preference',
          value: 'approved',
          source: 'chat:turn-17',
          confidence: 0.9,
          reason: 'Approved value equals stale cache.',
        });
        stale.memoryReview.approve(candidate.id, { reviewer: 'operator' });
        stale.close();
        stale = undefined;

        verifier = new SqliteBrain(dbPath);
        expect(verifier.working.get('preference')).toBe('approved');
      } finally {
        stale?.close();
        concurrent?.close();
        verifier?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('clears stale review suppressions before hydrating snapshot working memory', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-review-hydrate-stale-suppression-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const existing = new SqliteBrain(dbPath);
        const staleSuppression = existing.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.restore',
          value: 'old value',
          source: 'chat:turn-18',
          confidence: 0.9,
          reason: 'Stale suppression from old DB state.',
        });
        existing.memoryReview.neverStore(staleSuppression.id, { reviewer: 'operator' });
        existing.close();

        const hydrated = SqliteBrain.hydrate({
          version: 1,
          timestamp: '2026-07-15T00:00:00.000Z',
          working: { 'user.preference.restore': 'restored safe value' },
          episodic: [],
          checkpoint: null,
          metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
        }, dbPath);
        expect(hydrated.working.get('user.preference.restore')).toBe('restored safe value');
        const db = (hydrated as unknown as { db: Database.Database }).db;
        expect(db.prepare(`SELECT COUNT(*) AS count FROM memory_review_suppressions`).get()).toEqual({ count: 0 });
        hydrated.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
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
        {
          store: 'working_memory',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 1,
        },
        {
          store: 'episodic_events',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 1,
        },
        {
          store: 'checkpoints',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 1,
        },
        {
          store: 'memory_review_candidates',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 0,
        },
        {
          store: 'memory_review_provenance',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 0,
        },
        {
          store: 'memory_review_suppressions',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 0,
        },
        {
          store: 'memory_deletion_guards',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 0,
        },
        {
          store: 'memory_deletion_hash_keys',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 0,
        },
      ]);

      const db = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => {
              get: () => { schema_version: number } | undefined;
            };
          };
        }
      ).db;
      expect(
        db.prepare('SELECT schema_version FROM working_memory').get()
          ?.schema_version,
      ).toBe(CURRENT_MEMORY_SCHEMA_VERSION);
      expect(
        db.prepare('SELECT schema_version FROM episodic_events').get()
          ?.schema_version,
      ).toBe(CURRENT_MEMORY_SCHEMA_VERSION);
      expect(
        db.prepare('SELECT schema_version FROM checkpoints').get()
          ?.schema_version,
      ).toBe(CURRENT_MEMORY_SCHEMA_VERSION);
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

        const dryRun = SqliteBrain.migrateMemorySchema(dbPath, {
          dryRun: true,
        });
        expect(dryRun.dryRun).toBe(true);
        expect(dryRun.migrated).toBe(true);
        expect(dryRun.operations.map((op) => op.table)).toContain(
          'working_memory',
        );
        expect(dryRun.backupPath).toBeUndefined();
        const dryRunWithBackupPath = SqliteBrain.migrateMemorySchema(dbPath, {
          dryRun: true,
          backupPath,
        });
        expect(dryRunWithBackupPath.backupPath).toBeUndefined();
        const afterDryRun = new Database(dbPath);
        expect(
          afterDryRun
            .prepare(`PRAGMA table_info(working_memory)`)
            .all()
            .some((row) => (row as { name: string }).name === 'schema_version'),
        ).toBe(false);
        afterDryRun.close();
        expect(existsSync(`${dbPath}-wal`)).toBe(false);
        expect(existsSync(`${dbPath}-shm`)).toBe(false);

        const migrated = SqliteBrain.migrateMemorySchema(dbPath, {
          backupBeforeMigrate: true,
          backupPath,
        });
        expect(migrated.dryRun).toBe(false);
        expect(migrated.backupPath).toBe(backupPath);
        expect(existsSync(backupPath)).toBe(true);
        const backup = new Database(backupPath, { readonly: true });
        expect(
          backup
            .prepare(`SELECT value FROM working_memory WHERE key = ?`)
            .get('legacy'),
        ).toEqual({
          value: '"value"',
        });
        expect(
          backup
            .prepare(`PRAGMA table_info(working_memory)`)
            .all()
            .some((row) => (row as { name: string }).name === 'schema_version'),
        ).toBe(false);
        backup.close();

        const reopened = new SqliteBrain(dbPath);
        expect(reopened.working.get('legacy')).toBe('value');
        expect(reopened.getMemorySchemaMetadata().stores).toEqual([
          {
            store: 'working_memory',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 1,
          },
          {
            store: 'episodic_events',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
          {
            store: 'checkpoints',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
          {
            store: 'memory_review_candidates',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
          {
            store: 'memory_review_provenance',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
          {
            store: 'memory_review_suppressions',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
          {
            store: 'memory_deletion_guards',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
          {
            store: 'memory_deletion_hash_keys',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 0,
          },
        ]);
        reopened.close();

        const noOpDryRunAfterMigration = SqliteBrain.migrateMemorySchema(dbPath, { dryRun: true });
        expect(noOpDryRunAfterMigration.migrated).toBe(false);
        expect(noOpDryRunAfterMigration.operations).toEqual([]);

        const staleRegistryDb = new Database(dbPath);
        staleRegistryDb
          .prepare(
            `UPDATE memory_schema_versions SET version = ? WHERE store = ?`,
          )
          .run(CURRENT_MEMORY_SCHEMA_VERSION - 1, 'working_memory');
        staleRegistryDb.close();
        const registryMigration = SqliteBrain.migrateMemorySchema(dbPath);
        expect(registryMigration.migrated).toBe(true);
        expect(registryMigration.operations.map((op) => op.table)).toContain(
          'memory_schema_versions',
        );
        const afterRegistryMigration = new SqliteBrain(dbPath);
        expect(
          afterRegistryMigration.getMemorySchemaMetadata().stores[0],
        ).toEqual({
          store: 'working_memory',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 1,
        });
        afterRegistryMigration.close();
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
        db.prepare(
          `UPDATE memory_schema_versions SET version = ? WHERE store = ?`,
        ).run(CURRENT_MEMORY_SCHEMA_VERSION + 1, 'working_memory');
        db.close();
        expect(() => new SqliteBrain(dbPath)).toThrow(
          UnsupportedMemorySchemaVersionError,
        );

        const rowFutureDb = new Database(dbPath);
        rowFutureDb
          .prepare(
            `UPDATE memory_schema_versions SET version = ? WHERE store = ?`,
          )
          .run(CURRENT_MEMORY_SCHEMA_VERSION, 'working_memory');
        rowFutureDb
          .prepare(`UPDATE working_memory SET schema_version = ? WHERE key = ?`)
          .run(CURRENT_MEMORY_SCHEMA_VERSION + 1, 'future');
        rowFutureDb.close();
        expect(() => new SqliteBrain(dbPath)).toThrow(
          UnsupportedMemorySchemaVersionError,
        );

        const futureShapeDir = mkdtempSync(
          join(tmpdir(), 'sqlite-brain-future-shape-'),
        );
        const futureShapePath = join(futureShapeDir, 'brain.db');
        try {
          const futureShapeDb = new Database(futureShapePath);
          futureShapeDb.exec(`
            CREATE TABLE memory_schema_versions (store TEXT PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
            INSERT INTO memory_schema_versions (store, version, migrated_at)
            VALUES ('semantic_memory', ${CURRENT_MEMORY_SCHEMA_VERSION + 1}, '2026-07-13T00:00:00.000Z');
          `);
          futureShapeDb.close();

          expect(() => new SqliteBrain(futureShapePath)).toThrow(
            UnsupportedMemorySchemaVersionError,
          );
          expect(() =>
            SqliteBrain.migrateMemorySchema(futureShapePath),
          ).toThrow(UnsupportedMemorySchemaVersionError);
          const afterRejectedOpen = new Database(futureShapePath, {
            readonly: true,
          });
          const tables = afterRejectedOpen
            .prepare(
              `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`,
            )
            .all()
            .map((row) => (row as { name: string }).name);
          expect(tables).toEqual(['memory_schema_versions']);
          afterRejectedOpen.close();
          expect(existsSync(`${futureShapePath}-wal`)).toBe(false);
          expect(existsSync(`${futureShapePath}-shm`)).toBe(false);
        } finally {
          rmSync(futureShapeDir, { recursive: true, force: true });
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('memory encryption at rest', () => {
    const encryption = {
      enabled: true,
      key: 'correct horse battery staple',
    } as const;

    it('encrypts persisted working, episodic, and checkpoint payloads while preserving runtime roundtrip', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-encrypted-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.working.set('project-secret', {
          token: 'visible only after decrypt',
        });
        encrypted.episodic.record({
          type: 'decision',
          summary: 'encrypt durable memories',
          details: { rationale: 'security issue 1756' },
          createdAt: '2026-07-13T00:00:00.000Z',
        });
        encrypted.recovery.checkpoint({
          runId: 'run-encrypted',
          phase: 'execution',
          step: 2,
          context: { secret: 'checkpoint payload' },
          timestamp: '2026-07-13T00:01:00.000Z',
        });
        expect(
          encrypted
            .getMemoryEncryptionMetadata()
            .stores.every((store) => store.encrypted),
        ).toBe(true);
        encrypted.close();

        const raw = new Database(dbPath, { readonly: true });
        const workingRow = raw
          .prepare(`SELECT value FROM working_memory WHERE key = ?`)
          .get('project-secret') as { value: string };
        const eventRow = raw
          .prepare(`SELECT summary, details FROM episodic_events LIMIT 1`)
          .get() as { summary: string; details: string };
        const checkpointRow = raw
          .prepare(`SELECT state FROM checkpoints LIMIT 1`)
          .get() as { state: string };
        expect(workingRow.value).toMatch(/^enc:v1:/);
        expect(eventRow.summary).toMatch(/^enc:v1:/);
        expect(eventRow.details).toMatch(/^enc:v1:/);
        expect(checkpointRow.state).toMatch(/^enc:v1:/);
        expect(workingRow.value).not.toContain('visible only after decrypt');
        expect(eventRow.summary).not.toContain('encrypt durable memories');
        expect(checkpointRow.state).not.toContain('checkpoint payload');
        raw.close();

        const reopened = new SqliteBrain(dbPath, undefined, { encryption });
        expect(reopened.working.get('project-secret')).toEqual({
          token: 'visible only after decrypt',
        });
        expect(reopened.episodic.recent(1)[0]?.summary).toBe(
          'encrypt durable memories',
        );
        expect(
          reopened.episodic.recall('security issue', 1)[0]?.details,
        ).toEqual({ rationale: 'security issue 1756' });
        expect(reopened.recovery.lastCheckpoint()?.context).toEqual({
          secret: 'checkpoint payload',
        });
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('deletes and audits encrypted right-to-forget matches without leaving plaintext rows', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-encrypted-rtf-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.working.set('pii:email', { value: 'alice@example.test', category: 'pii' });
        encrypted.episodic.record({
          type: 'observation',
          summary: 'User email alice@example.test was imported',
          details: { category: 'pii', sourceScope: ['import-1', 'import-2'] },
          createdAt: '2026-07-13T00:00:00.000Z',
        });

        const report = encrypted.rightToForget({ sourceScope: 'import-1' });

        expect(report.deleted).toEqual({ working: 0, episodic: 1, derived: 1 });
        expect(encrypted.episodic.recall('alice@example.test', 5)).toEqual([]);
        encrypted.close();

        const raw = new Database(dbPath, { readonly: true });
        const auditRow = raw
          .prepare(`SELECT summary, details FROM episodic_events WHERE step = ?`)
          .get('right-to-forget') as { summary: string; details: string };
        const keyRow = raw
          .prepare(`SELECT key_material FROM memory_deletion_hash_keys LIMIT 1`)
          .get() as { key_material: string };
        expect(auditRow.summary).toMatch(/^enc:v1:/);
        expect(auditRow.details).toMatch(/^enc:v1:/);
        expect(auditRow.details).not.toContain('selectorHash');
        expect(keyRow.key_material).toMatch(/^enc:v1:/);
        expect(keyRow.key_material).not.toContain('right-to-forget-hmac-v1');
        raw.close();

        const reopened = new SqliteBrain(dbPath, undefined, { encryption });
        expect(reopened.episodic.recent(1)[0]?.step).toBe('right-to-forget');
        expect(() => reopened.episodic.record({
          type: 'observation',
          summary: 'sourceScope: import-1 returned',
          createdAt: '2026-07-13T00:00:00.000Z',
        })).toThrow(/right-to-forget/);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('requires explicit migration before opening a plaintext store with encryption enabled', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-required-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const plaintext = new SqliteBrain(dbPath);
        plaintext.working.set('legacy', 'plaintext memory');
        plaintext.flush();
        plaintext.close();

        expect(
          () => new SqliteBrain(dbPath, undefined, { encryption }),
        ).toThrow(MemoryEncryptionMigrationRequiredError);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('migrates plaintext stores with a backup and verifies encrypted status', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-migration-'),
      );
      const dbPath = join(dir, 'brain.db');
      const backupPath = join(dir, 'brain.plaintext.backup.db');

      try {
        const plaintext = new SqliteBrain(dbPath);
        plaintext.working.set('legacy', 'plaintext memory');
        plaintext.episodic.record({
          type: 'observation',
          summary: 'legacy summary',
          details: { body: 'legacy details' },
          createdAt: '2026-07-13T00:00:00.000Z',
        });
        const approved = plaintext.memoryReview.propose({
          targetStore: 'working',
          key: 'review.approved',
          value: { secret: 'approved review payload' },
          source: 'legacy review source',
          evidenceId: 'legacy-evidence',
          confidence: 0.9,
          reason: 'legacy review reason',
        });
        plaintext.memoryReview.approve(approved.id, {
          reviewer: 'legacy reviewer',
          note: 'legacy approval note',
        });
        const rejected = plaintext.memoryReview.propose({
          targetStore: 'working',
          key: 'review.rejected',
          value: 'rejected review payload',
          source: 'legacy rejection source',
          confidence: 0.4,
          reason: 'legacy rejection reason',
        });
        plaintext.memoryReview.reject(rejected.id, {
          reviewer: 'legacy reviewer',
          note: 'legacy rejection note',
        });
        plaintext.flush();
        plaintext.close();

        const dryRun = SqliteBrain.migrateMemoryEncryption(dbPath, {
          ...encryption,
          dryRun: true,
        });
        expect(dryRun.dryRun).toBe(true);
        expect(dryRun.migrated).toBe(true);
        expect(dryRun.operations.map((op) => op.table)).toEqual([
          'working_memory',
          'episodic_events',
          'memory_review_candidates',
          'memory_review_provenance',
          'memory_review_suppressions',
          'memory_deletion_hash_keys',
        ]);

        const migrated = SqliteBrain.migrateMemoryEncryption(dbPath, {
          ...encryption,
          backupBeforeMigrate: true,
          backupPath,
        });
        expect(migrated.backupPath).toBe(backupPath);
        expect(existsSync(backupPath)).toBe(true);

        const backup = new Database(backupPath, { readonly: true });
        expect(
          (
            backup
              .prepare(`SELECT value FROM working_memory WHERE key = ?`)
              .get('legacy') as { value: string }
          ).value,
        ).toBe('"plaintext memory"');
        backup.close();

        const reopened = new SqliteBrain(dbPath, undefined, { encryption });
        expect(reopened.working.get('legacy')).toBe('plaintext memory');
        expect(
          reopened
            .getMemoryEncryptionMetadata()
            .stores.every((store) => store.encrypted),
        ).toBe(true);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('encrypts migrated deletion hash key material', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-deletion-key-migration-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const plaintext = new SqliteBrain(dbPath);
        plaintext.working.set('pii:email', 'alice@example.test');
        plaintext.rightToForget({ query: 'alice@example.test' });
        plaintext.close();

        const before = new Database(dbPath, { readonly: true });
        const plaintextKey = (
          before
            .prepare(`SELECT key_material FROM memory_deletion_hash_keys LIMIT 1`)
            .get() as { key_material: string }
        ).key_material;
        expect(plaintextKey).not.toMatch(/^enc:v1:/);
        before.close();

        const dryRun = SqliteBrain.migrateMemoryEncryption(dbPath, {
          ...encryption,
          dryRun: true,
        });
        expect(dryRun.operations.map((op) => op.table)).toContain('memory_deletion_hash_keys');

        SqliteBrain.migrateMemoryEncryption(dbPath, encryption);

        const raw = new Database(dbPath, { readonly: true });
        const migratedKey = (
          raw
            .prepare(`SELECT key_material FROM memory_deletion_hash_keys LIMIT 1`)
            .get() as { key_material: string }
        ).key_material;
        expect(migratedKey).toMatch(/^enc:v1:/);
        expect(migratedKey).not.toBe(plaintextKey);
        raw.close();

        const reopened = new SqliteBrain(dbPath, undefined, { encryption });
        expect(() => reopened.working.set('contact', 'alice@example.test')).toThrow(/right-to-forget/);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('encrypts snapshots hydrated with checkpoint payloads', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-hydrate-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const hydrated = SqliteBrain.hydrate(
          {
            version: 1,
            timestamp: '2026-07-13T00:00:00.000Z',
            working: { snapshotSecret: 'working secret' },
            episodic: [],
            checkpoint: {
              runId: 'run-hydrate',
              phase: 'restore',
              step: 1,
              context: { restoredSecret: 'checkpoint secret' },
              timestamp: '2026-07-13T00:00:00.000Z',
            },
            metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
          },
          dbPath,
          undefined,
          { encryption },
        );
        hydrated.close();

        const raw = new Database(dbPath, { readonly: true });
        const checkpointRow = raw
          .prepare(`SELECT state FROM checkpoints LIMIT 1`)
          .get() as { state: string };
        expect(checkpointRow.state).toMatch(/^enc:v1:/);
        expect(checkpointRow.state).not.toContain('checkpoint secret');
        raw.close();

        const reopened = new SqliteBrain(dbPath, undefined, { encryption });
        expect(reopened.recovery.lastCheckpoint()?.context).toEqual({
          restoredSecret: 'checkpoint secret',
        });
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('encrypts plaintext values that begin with the ciphertext marker', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-prefix-'),
      );
      const dbPath = join(dir, 'brain.db');
      const markerText = 'enc:v1:this is user text, not ciphertext';

      try {
        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.working.set('marker', markerText);
        encrypted.episodic.record({
          type: 'observation',
          summary: markerText,
          createdAt: '2026-07-13T00:00:00.000Z',
        });
        encrypted.flush();
        encrypted.close();

        const raw = new Database(dbPath, { readonly: true });
        const workingRow = raw
          .prepare(`SELECT value FROM working_memory WHERE key = ?`)
          .get('marker') as { value: string };
        const eventRow = raw
          .prepare(`SELECT summary FROM episodic_events LIMIT 1`)
          .get() as { summary: string };
        expect(workingRow.value).toMatch(/^enc:v1:/);
        expect(workingRow.value).not.toBe(markerText);
        expect(eventRow.summary).toMatch(/^enc:v1:/);
        expect(eventRow.summary).not.toBe(markerText);
        raw.close();

        const reopened = new SqliteBrain(dbPath, undefined, { encryption });
        expect(reopened.working.get('marker')).toBe(markerText);
        expect(reopened.episodic.recent(1)[0]?.summary).toBe(markerText);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps dry-run encryption migration read-only for legacy databases', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-legacy-dry-run-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const db = new Database(dbPath);
        db.exec(`
          CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
          CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
          INSERT INTO working_memory (key, value, updated_at) VALUES ('legacy', 'plaintext', '2026-07-13T00:00:00.000Z');
        `);
        db.close();

        const dryRun = SqliteBrain.migrateMemoryEncryption(dbPath, {
          ...encryption,
          dryRun: true,
        });
        expect(dryRun.migrated).toBe(true);

        const after = new Database(dbPath, { readonly: true });
        const statusTable = after
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_encryption_status'`,
          )
          .get();
        expect(statusTable).toBeUndefined();
        after.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('preserves unencrypted recall scoring when encryption is enabled', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-recall-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.episodic.record({
          type: 'observation',
          summary: 'alpha summary',
          details: { note: 'alpha details' },
          createdAt: '2026-07-13T00:00:00.000Z',
        });
        encrypted.episodic.record({
          type: 'observation',
          summary: 'alpha summary',
          createdAt: '2026-07-13T00:01:00.000Z',
        });
        expect(
          encrypted.episodic.recall('alpha', 2).map((event) => event.createdAt),
        ).toEqual(['2026-07-13T00:00:00.000Z', '2026-07-13T00:01:00.000Z']);
        encrypted.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects future schemas before encryption migration mutates them', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-future-schema-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const db = new Database(dbPath);
        db.exec(`
          CREATE TABLE memory_schema_versions (store TEXT PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
          CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, schema_version INTEGER NOT NULL);
          INSERT INTO memory_schema_versions (store, version, migrated_at) VALUES ('working_memory', ${CURRENT_MEMORY_SCHEMA_VERSION + 1}, '2026-07-13T00:00:00.000Z');
          INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES ('future', 'plaintext', '2026-07-13T00:00:00.000Z', ${CURRENT_MEMORY_SCHEMA_VERSION + 1});
        `);
        db.close();

        expect(() =>
          SqliteBrain.migrateMemoryEncryption(dbPath, encryption),
        ).toThrow(UnsupportedMemorySchemaVersionError);
        const after = new Database(dbPath, { readonly: true });
        expect(
          (
            after
              .prepare(`SELECT value FROM working_memory WHERE key = 'future'`)
              .get() as { value: string }
          ).value,
        ).toBe('plaintext');
        after.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects plaintext rows in stores already marked encrypted', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-plaintext-row-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.working.set('secret', 'ciphertext');
        encrypted.flush();
        encrypted.close();

        const tamper = new Database(dbPath);
        tamper
          .prepare(
            `INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES (?, ?, ?, ?)`,
          )
          .run(
            'plaintext',
            'not encrypted',
            '2026-07-13T00:00:00.000Z',
            CURRENT_MEMORY_SCHEMA_VERSION,
          );
        tamper.close();

        expect(
          () => new SqliteBrain(dbPath, undefined, { encryption }),
        ).toThrow(MemoryEncryptionMigrationRequiredError);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails closed when key material is missing, omitted, or wrong', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-encryption-key-'));
      const dbPath = join(dir, 'brain.db');

      try {
        expect(
          () =>
            new SqliteBrain(':memory:', undefined, {
              encryption: { enabled: true },
            }),
        ).toThrow(MemoryEncryptionKeyUnavailableError);

        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.working.set('secret', 'value');
        encrypted.flush();
        encrypted.close();

        expect(() => new SqliteBrain(dbPath)).toThrow(
          MemoryEncryptionRequiredError,
        );
        expect(
          () =>
            new SqliteBrain(dbPath, undefined, {
              encryption: { enabled: true, key: 'wrong key' },
            }),
        ).toThrow(MemoryEncryptionWrongKeyError);
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
      const db = (
        brain as unknown as {
          db: {
            exec: (sql: string) => void;
            prepare: (sql: string) => {
              all: () => Array<{ action: string; key: string }>;
            };
          };
        }
      ).db;

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

      const auditRows = db
        .prepare('SELECT action, key FROM working_memory_audit')
        .all();
      expect(new Set(auditRows.map((row) => row.key))).toEqual(
        new Set(['beta']),
      );
    });

    it('deletes only removed persisted working-memory rows on flush', () => {
      const db = (
        brain as unknown as {
          db: {
            exec: (sql: string) => void;
            prepare: (sql: string) => {
              all: () => Array<{ action: string; key: string }>;
            };
          };
        }
      ).db;

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

      const auditRows = db
        .prepare('SELECT action, key FROM working_memory_delete_audit')
        .all();
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
    const makeEvent = (
      overrides: Partial<EpisodicEvent> = {},
    ): EpisodicEvent => ({
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
      brain.episodic.record(
        makeEvent({ summary: 'first', createdAt: '2026-03-18T10:00:00Z' }),
      );
      brain.episodic.record(
        makeEvent({ summary: 'second', createdAt: '2026-03-18T10:05:00Z' }),
      );
      brain.episodic.record(
        makeEvent({ summary: 'third', createdAt: '2026-03-18T10:10:00Z' }),
      );

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
      expect(failures.every((e) => e.type === 'failure')).toBe(true);
    });

    it('count() returns total events', () => {
      brain.episodic.record(makeEvent());
      brain.episodic.record(makeEvent());
      brain.episodic.record(makeEvent());
      expect(brain.episodic.count()).toBe(3);
    });

    it('records events with optional fields', () => {
      brain.episodic.record(
        makeEvent({
          step: 'build',
          details: { file: 'auth.ts', line: 42 },
        }),
      );
      const events = brain.episodic.recent(1);
      expect(events[0]!.step).toBe('build');
      expect(events[0]!.details).toEqual({ file: 'auth.ts', line: 42 });
    });

    it('records a learning once during its cooldown window to prevent churn', () => {
      const first = brain.episodic.recordLearning(makeEvent({
        step: 'retro',
        summary: 'Prefer targeted verification for touched packages',
        createdAt: '2026-07-11T12:00:00.000Z',
      }), { cooldownMs: 60_000 });
      const second = brain.episodic.recordLearning(makeEvent({
        step: 'handoff',
        summary: 'Prefer targeted verification for touched packages',
        createdAt: '2026-07-11T12:00:30.000Z',
      }), {
        key: 'targeted-verification',
        cooldownMs: 60_000,
      });

      expect(first).toEqual({
        recorded: true,
        key: 'retro:prefer targeted verification for touched packages',
        cooldownMs: 60_000,
      });
      expect(second.recorded).toBe(true);
      expect(brain.episodic.count()).toBe(2);

      const duplicate = brain.episodic.recordLearning(makeEvent({
        step: 'handoff',
        summary: 'Same lesson in a different wording',
        createdAt: '2026-07-11T12:00:45.000Z',
      }), {
        key: ' TARGETED-VERIFICATION ',
        cooldownMs: 60_000,
      });

      expect(duplicate).toMatchObject({
        recorded: false,
        reason: 'cooldown',
        key: 'targeted-verification',
        cooldownMs: 60_000,
        cooldownUntil: '2026-07-11T12:01:30.000Z',
      });
      expect(duplicate.recorded === false ? duplicate.existingEvent.summary : '').toBe(
        'Prefer targeted verification for touched packages',
      );
      expect(brain.episodic.count()).toBe(2);
    });

    it('records a learning again after cooldown and rejects invalid cooldown input', () => {
      const base = makeEvent({
        summary: 'Use structured handoff receipts',
        createdAt: '2026-07-11T12:00:00.000Z',
      });

      brain.episodic.recordLearning(base, { key: 'handoff-receipts', cooldownMs: 60_000 });
      const afterCooldown = brain.episodic.recordLearning({
        ...base,
        createdAt: '2026-07-11T12:01:00.000Z',
      }, { key: 'handoff-receipts', cooldownMs: 60_000 });

      expect(afterCooldown.recorded).toBe(true);
      expect(brain.episodic.count()).toBe(2);
      expect(() => brain.episodic.recordLearning(
        base,
        { key: 'handoff-receipts', cooldownMs: -1 },
      )).toThrow(RangeError);
    });

    it('does not let non-learning events satisfy the learning cooldown', () => {
      brain.episodic.record(makeEvent({
        type: 'success',
        step: 'retro',
        summary: 'Prefer targeted verification for touched packages',
        createdAt: '2026-07-11T12:00:00.000Z',
      }));

      const result = brain.episodic.recordLearning(makeEvent({
        step: 'retro',
        summary: 'Prefer targeted verification for touched packages',
        createdAt: '2026-07-11T12:00:30.000Z',
      }), { cooldownMs: 60_000 });

      expect(result.recorded).toBe(true);
      expect(brain.episodic.count()).toBe(2);
    });

    it('compares learning cooldown timestamps as instants', () => {
      brain.episodic.recordLearning(makeEvent({
        summary: 'Normalize timestamps before comparing cooldowns',
        createdAt: '2026-07-11T08:00:00-04:00',
      }), { key: 'timestamp-normalization', cooldownMs: 60_000 });

      const duplicate = brain.episodic.recordLearning(makeEvent({
        summary: 'Normalize timestamps before comparing cooldowns',
        createdAt: '2026-07-11T12:00:30.000Z',
      }), { key: 'timestamp-normalization', cooldownMs: 60_000 });

      expect(duplicate).toMatchObject({
        recorded: false,
        reason: 'cooldown',
        cooldownUntil: '2026-07-11T12:01:00.000Z',
      });
      expect(duplicate.recorded === false ? duplicate.existingEvent.createdAt : '').toBe(
        '2026-07-11T12:00:00.000Z',
      );
      expect(brain.episodic.count()).toBe(1);
    });

    it('keeps active learning cooldown rows in handoff snapshots beyond the recent limit', () => {
      const now = Date.now();
      brain.episodic.recordLearning(makeEvent({
        summary: 'Keep cooldown metadata across handoffs',
        createdAt: new Date(now - 25 * 60 * 60 * 1_000).toISOString(),
      }), { key: 'handoff-cooldown', cooldownMs: 7 * 24 * 60 * 60 * 1_000 });

      for (let i = 0; i < 101; i++) {
        brain.episodic.record(makeEvent({
          summary: `newer event ${i}`,
          createdAt: new Date(now + i).toISOString(),
        }));
      }

      const snapshot = brain.serialize();
      expect(snapshot.episodic.some(event => event.details?.learningKey === 'handoff-cooldown')).toBe(true);
    });

    it('uses the stored learning cooldown duration for duplicate detection', () => {
      brain.episodic.recordLearning(makeEvent({
        summary: 'Respect stored cooldowns',
        createdAt: '2026-07-11T12:00:00.000Z',
      }), { key: 'stored-cooldown', cooldownMs: 7 * 24 * 60 * 60 * 1_000 });

      const duplicate = brain.episodic.recordLearning(makeEvent({
        summary: 'Respect stored cooldowns',
        createdAt: '2026-07-12T12:00:00.000Z',
      }), { key: 'stored-cooldown' });

      expect(duplicate).toMatchObject({
        recorded: false,
        reason: 'cooldown',
        cooldownUntil: '2026-07-18T12:00:00.000Z',
      });
    });

    it('recall() finds matching events by keyword', () => {
      brain.episodic.record(makeEvent({ summary: 'first test event' }));
      brain.episodic.record(makeEvent({ summary: 'second test event' }));
      const results = brain.episodic.recall('test event', 1);
      expect(results).toHaveLength(1);
    });

    it('recall() handles very large keyword sets without exceeding SQLite query limits', () => {
      brain.episodic.record(
        makeEvent({
          summary: 'early match kw0000',
          createdAt: '2026-07-10T00:00:00.000Z',
        }),
      );
      brain.episodic.record(
        makeEvent({
          summary: 'late match kw1199',
          createdAt: '2026-07-10T00:01:00.000Z',
        }),
      );

      const query = Array.from(
        { length: 1200 },
        (_, i) => `kw${String(i).padStart(4, '0')}`,
      ).join(' ');

      expect(() => brain.episodic.recall(query, 10)).not.toThrow();
      expect(
        brain.episodic.recall(query, 10).map((event) => event.summary),
      ).toEqual(['late match kw1199', 'early match kw0000']);
    });

    it('skips corrupt persisted details while keeping healthy recent and failure rows available', () => {
      brain.episodic.record(
        makeEvent({
          type: 'failure',
          summary: 'older healthy failure',
          createdAt: '2026-07-10T00:00:00.000Z',
          details: { marker: 'healthy' },
        }),
      );
      brain.episodic.record(
        makeEvent({
          type: 'failure',
          summary: 'newer corrupt failure',
          createdAt: '2026-07-10T00:01:00.000Z',
          details: { marker: 'corrupt-me' },
        }),
      );
      brain.episodic.record(
        makeEvent({
          type: 'success',
          summary: 'newest healthy success',
          createdAt: '2026-07-10T00:02:00.000Z',
          details: { marker: 'healthy' },
        }),
      );

      const db = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => { run: (...args: unknown[]) => void };
          };
        }
      ).db;
      db.prepare(
        `UPDATE episodic_events SET details = ? WHERE summary = ?`,
      ).run('{', 'newer corrupt failure');

      expect(() => brain.episodic.recent(2)).not.toThrow();
      expect(brain.episodic.recent(2).map((event) => event.summary)).toEqual([
        'newest healthy success',
        'older healthy failure',
      ]);

      expect(() => brain.episodic.recentFailures(1)).not.toThrow();
      expect(
        brain.episodic.recentFailures(1).map((event) => event.summary),
      ).toEqual(['older healthy failure']);
    });

    it('skips corrupt persisted details during recall', () => {
      brain.episodic.record(
        makeEvent({
          summary: 'healthy searchable event',
          createdAt: '2026-07-10T00:00:00.000Z',
          details: { marker: 'searchable' },
        }),
      );
      brain.episodic.record(
        makeEvent({
          summary: 'corrupt searchable event',
          createdAt: '2026-07-10T00:01:00.000Z',
          details: { marker: 'searchable' },
        }),
      );

      const db = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => { run: (...args: unknown[]) => void };
          };
        }
      ).db;
      db.prepare(
        `UPDATE episodic_events SET details = ? WHERE summary = ?`,
      ).run('{', 'corrupt searchable event');

      expect(() => brain.episodic.recall('searchable', 10)).not.toThrow();
      expect(
        brain.episodic.recall('searchable', 10).map((event) => event.summary),
      ).toEqual(['healthy searchable event']);
      expect(brain.episodic.recall('searchable', 0)).toEqual([]);
      expect(brain.episodic.recent(0)).toEqual([]);
      expect(brain.episodic.recentFailures(0)).toEqual([]);
    });
  });

  describe('recovery memory', () => {
    const makeState = (
      overrides: Partial<ExecutionState> = {},
    ): ExecutionState => ({
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
      const row = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => {
              get: (key: string) => { value: string } | undefined;
            };
          };
        }
      ).db
        .prepare('SELECT value FROM working_memory WHERE key = ?')
        .get('key1');
      expect(row?.value).toBe('"value1"');
    });

    it('checkpoint() rolls back working memory flush when checkpoint insert fails', () => {
      const db = (
        brain as unknown as {
          db: {
            exec: (sql: string) => void;
            prepare: (sql: string) => {
              get: (key: string) => { value: string } | undefined;
            };
          };
        }
      ).db;

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

      const row = db
        .prepare('SELECT value FROM working_memory WHERE key = ?')
        .get('key1');
      expect(row).toBeUndefined();

      db.exec(`DROP TRIGGER fail_checkpoint_insert`);
      brain.recovery.checkpoint(makeState({ step: 4 }));

      const recovered = db
        .prepare('SELECT value FROM working_memory WHERE key = ?')
        .get('key1');
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
      brain.recovery.checkpoint(
        makeState({ step: 1, timestamp: '2026-07-10T00:00:00.000Z' }),
      );
      brain.recovery.checkpoint(
        makeState({ step: 2, timestamp: '2026-07-10T00:01:00.000Z' }),
      );

      const db = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => { run: (...args: unknown[]) => void };
          };
        }
      ).db;
      db.prepare(
        `UPDATE checkpoints SET state = ? WHERE id = (SELECT MAX(id) FROM checkpoints)`,
      ).run('{');

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
      brain.recovery.checkpoint(
        makeState({ timestamp: '2026-03-18T10:00:00Z' }),
      );
      brain.recovery.checkpoint(
        makeState({ timestamp: '2026-03-18T10:05:00Z' }),
      );

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
      expect(brain2.episodic.recentFailures(1)[0]!.summary).toBe(
        'TypeScript error',
      );
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

    it('rejects hydrating deletion guards with mismatched hash key material', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-guard-key-mismatch-'));
      const dbPath = join(dir, 'brain.db');

      try {
        brain.working.set('pii:email', 'alice@example.test');
        brain.rightToForget({ key: 'pii:email' });
        const snapshot = brain.serialize();
        expect(snapshot.deletionGuardHashKey).toEqual(expect.any(String));

        const existing = new SqliteBrain(dbPath);
        existing.rightToForget({ query: 'bob@example.test' });
        const existingSnapshot = existing.serialize();
        expect(existingSnapshot.deletionGuardHashKey).toEqual(expect.any(String));
        expect(existingSnapshot.deletionGuardHashKey).not.toBe(snapshot.deletionGuardHashKey);
        existing.close();

        expect(() => SqliteBrain.hydrate(snapshot, dbPath)).toThrow(/different right-to-forget hash key material/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrate() rejects keyed deletion guard snapshots without hash key material', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('pii:email', 'alice@example.test');
      source.rightToForget({ query: 'alice@example.test' });
      const snapshot = source.serialize();
      delete snapshot.deletionGuardHashKey;

      expect(() => SqliteBrain.hydrate(snapshot)).toThrow(/hash key material/);
      source.close();
    });

    it('hydrate() rolls back snapshot hash-key writes when restore fails', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-hydrate-key-rollback-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const source = new SqliteBrain(':memory:');
        source.working.set('pii:email', 'alice@example.test');
        source.rightToForget({ query: 'alice@example.test' });
        const snapshot = source.serialize();
        snapshot.working = { 'pii:email': 'alice@example.test' };

        expect(() => SqliteBrain.hydrate(snapshot, dbPath)).toThrow(/right-to-forget/);

        const raw = new Database(dbPath, { readonly: true });
        const keyCount = raw
          .prepare(`SELECT COUNT(*) AS count FROM memory_deletion_hash_keys`)
          .get() as { count: number };
        expect(keyCount.count).toBe(0);
        raw.close();
        source.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrate() rejects snapshot payloads that reintroduce forgotten content', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('pii:email', { value: 'alice@example.test', category: 'pii' });
      source.rightToForget({ query: 'alice@example.test', category: 'pii' });
      const snapshot = source.serialize();
      snapshot.working = { 'pii:email': { value: 'alice@example.test', category: 'pii' } };

      expect(() => SqliteBrain.hydrate(snapshot)).toThrow(/right-to-forget/);
      source.close();
    });

    it('hydrate() rejects serialized deletion guards with unsupported future schema versions', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('pii:email', 'alice@example.test');
      source.rightToForget({ query: 'alice@example.test' });
      const snapshot = source.serialize();
      snapshot.deletionGuards = snapshot.deletionGuards?.map((guard) => ({
        ...guard,
        schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION + 1,
      }));

      expect(() => SqliteBrain.hydrate(snapshot)).toThrow(UnsupportedMemorySchemaVersionError);
      source.close();
    });

    it('hydrate() preserves existing database deletion guards before restoring a snapshot', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');
      const guarded = new SqliteBrain(dbPath);
      guarded.working.set('pii:email', 'alice@example.test');
      guarded.rightToForget({ query: 'alice@example.test' });
      guarded.close();

      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-07-14T00:00:00.000Z',
        working: { 'pii:email': 'alice@example.test' },
        episodic: [],
        checkpoint: null,
        metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
      };

      try {
        expect(() => SqliteBrain.hydrate(snapshot, dbPath)).toThrow(/right-to-forget/);
        const reopened = new SqliteBrain(dbPath);
        expect(() => reopened.working.set('other', 'alice@example.test')).toThrow(/right-to-forget/);
        reopened.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('hydrate() preserves serialized right-to-forget audit events that mention guarded words', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('task', 'delete project note');
      source.rightToForget({ query: 'delete project' });
      const snapshot = source.serialize();

      const hydrated = SqliteBrain.hydrate(snapshot);

      expect(hydrated.episodic.recent(1)[0]?.step).toBe('right-to-forget');
      hydrated.close();
      source.close();
    });

    it('hydrate() rejects forged right-to-forget audit events containing guarded content', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('task', 'alice@example.test');
      source.rightToForget({ query: 'alice@example.test' });
      const snapshot = source.serialize();
      snapshot.episodic.push({
        type: 'observation',
        step: 'right-to-forget',
        summary: 'alice@example.test',
        details: { selectorHash: snapshot.deletionGuards?.[0]?.selectorHash, deleted: { working: 0, episodic: 0, derived: 0 } },
        createdAt: '2026-07-14T00:00:00.000Z',
      });

      expect(() => SqliteBrain.hydrate(snapshot)).toThrow(/right-to-forget/);
      source.close();
    });


    it('hydrate() rejects right-to-forget audit events with forged extra details', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('task', 'alice@example.test');
      source.rightToForget({ query: 'alice@example.test' });
      const snapshot = source.serialize();
      snapshot.episodic.push({
        type: 'observation',
        step: 'right-to-forget',
        summary: 'Right-to-forget deletion completed',
        details: {
          selectorHash: snapshot.deletionGuards?.[0]?.selectorHash,
          deleted: { working: 0, episodic: 0, derived: 0 },
          note: 'alice@example.test',
        },
        createdAt: '2026-07-14T00:00:00.000Z',
      });

      expect(() => SqliteBrain.hydrate(snapshot)).toThrow(/right-to-forget/);
      source.close();
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
        (
          first as unknown as {
            db: {
              prepare: (sql: string) => {
                run: (...args: unknown[]) => unknown;
              };
            };
          }
        ).db
          .prepare(
            'INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)',
          )
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
        expect(Object.entries(reopened.working.snapshot())).toEqual([
          ['__proto__', 'safe value'],
        ]);
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

        const hydrated = SqliteBrain.hydrate(snapshot, dbPath, {
          maxEntries: 1,
        });
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
