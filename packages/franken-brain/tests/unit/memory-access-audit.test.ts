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

  it('rolls back working deletes when success audit persistence fails', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('delete.audit.rollback', 'keep me');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_working_delete_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'working.delete'
      BEGIN
        SELECT RAISE(ABORT, 'simulated working delete audit failure');
      END;
    `);

    expect(() => brain.working.delete('delete.audit.rollback')).toThrow('simulated working delete audit failure');
    expect(brain.working.get('delete.audit.rollback')).toBe('keep me');

    brain.close();
  });

  it('rolls back episodic records when success audit persistence fails', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_episodic_record_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'episodic.record'
      BEGIN
        SELECT RAISE(ABORT, 'simulated episodic record audit failure');
      END;
    `);

    expect(() => brain.episodic.record({
      type: 'observation',
      summary: 'must not commit without audit',
      createdAt: new Date().toISOString(),
    })).toThrow('simulated episodic record audit failure');
    expect(brain.episodic.count()).toBe(0);

    brain.close();
  });

  it('rolls back retention deletions when success audit persistence fails', () => {
    const brain = new SqliteBrain(':memory:');
    brain.episodic.record({
      type: 'observation',
      summary: 'must remain after audit failure',
      details: { memoryClass: 'transient_observation' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_retention_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'retention.enforce' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated retention audit failure');
      END;
    `);

    expect(() => brain.enforceMemoryRetention({
      now: '2026-01-10T00:00:00.000Z',
    })).toThrow('simulated retention audit failure');
    expect(brain.episodic.recall('must remain', 10)).toHaveLength(1);
    expect(brain.accessAudit.list({ operation: 'retention.enforce' })[0]).toMatchObject({
      outcome: 'error',
      details: { errorName: 'SqliteError' },
    });
    brain.close();
  });

  it('rolls back review proposals when success audit persistence fails', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_review_propose_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'review.propose'
      BEGIN
        SELECT RAISE(ABORT, 'simulated review propose audit failure');
      END;
    `);

    expect(() => brain.memoryReview.propose({
      targetStore: 'working',
      key: 'proposal.audit.rollback',
      value: 'must not commit without audit',
      source: 'operator',
      confidence: 0.9,
      reason: 'Proposal should roll back when audit fails.',
    })).toThrow('simulated review propose audit failure');
    expect(brain.memoryReview.list()).toHaveLength(0);

    brain.close();
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

  it('audits denied working restores and checkpoint writes', () => {
    const brain = new SqliteBrain(':memory:');

    brain.rightToForget({ query: 'forgotten-restore-secret' });

    expect(() => brain.working.restore({ restored: 'forgotten-restore-secret' })).toThrow(/right-to-forget/);
    expect(() => brain.recovery.checkpoint({
      runId: 'run-forgotten-secret',
      phase: 'execution',
      step: 1,
      context: { note: 'forgotten-restore-secret' },
      timestamp: '2026-07-15T20:00:00.000Z',
    })).toThrow(/right-to-forget/);

    const restoreAudit = brain.accessAudit.list({ operation: 'working.restore' });
    const checkpointAudit = brain.accessAudit.list({ operation: 'recovery.checkpoint' });
    expect(restoreAudit[0]).toMatchObject({ operation: 'working.restore', outcome: 'denied' });
    expect(checkpointAudit[0]).toMatchObject({ operation: 'recovery.checkpoint', outcome: 'denied' });
    expect(JSON.stringify([...restoreAudit, ...checkpointAudit])).not.toContain('forgotten-restore-secret');

    brain.close();
  });

  it('marks empty checkpoint reads as audit misses', () => {
    const brain = new SqliteBrain(':memory:');

    expect(brain.recovery.lastCheckpoint()).toBeNull();

    expect(brain.accessAudit.list({ operation: 'recovery.lastCheckpoint' })).toMatchObject([
      { operation: 'recovery.lastCheckpoint', store: 'recovery', outcome: 'miss' },
    ]);

    brain.close();
  });

  it('audits denied review edits and approvals without raw selectors', () => {
    const brain = new SqliteBrain(':memory:');
    const editCandidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.edit.target',
      value: 'safe value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for review edit denial.',
    });
    const approveCandidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.approve.target',
      value: 'forgotten-review-secret',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for review approval denial.',
    });

    brain.rightToForget({ query: 'forgotten-review-secret' });

    expect(() => brain.memoryReview.edit(editCandidate.id, {
      value: 'forgotten-review-secret',
      reason: 'Attempted guarded edit.',
    })).toThrow(/right-to-forget/);
    expect(brain.memoryReview.approve(approveCandidate.id, { reviewer: 'operator' })).toMatchObject({
      status: 'suppressed',
    });

    const editAudit = brain.accessAudit.list({ operation: 'review.edit' });
    const approveAudit = brain.accessAudit.list({ operation: 'review.approve' });
    expect(editAudit[0]).toMatchObject({ operation: 'review.edit', outcome: 'denied' });
    expect(approveAudit[0]).toMatchObject({ operation: 'review.approve', outcome: 'denied' });
    expect(JSON.stringify([...editAudit, ...approveAudit])).not.toContain('forgotten-review-secret');

    brain.close();
  });

  it('audits approved review candidates as working-memory writes', () => {
    const brain = new SqliteBrain(':memory:');
    const candidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.approved.write',
      value: 'approved value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Approval should emit working write audit.',
    });

    brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

    const workingSetAudit = brain.accessAudit.list({ operation: 'working.set' });
    expect(workingSetAudit[0]).toMatchObject({ operation: 'working.set', store: 'working', outcome: 'success' });
    expect(workingSetAudit[0]?.details).toMatchObject({ source: 'review.approve', candidateId: candidate.id });

    brain.close();
  });

  it('audits failed review list reads as errors after the read fails', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: { exec: (sql: string) => void } }).db;
    db.exec('DROP TABLE memory_review_candidates');

    expect(() => brain.memoryReview.list()).toThrow(/memory_review_candidates/);

    const listAudit = brain.accessAudit.list({ operation: 'review.list' });
    expect(listAudit[0]).toMatchObject({ operation: 'review.list', outcome: 'error' });

    brain.close();
  });

  it('hashes never-store audits with the original candidate key', () => {
    const brain = new SqliteBrain(':memory:');
    const candidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'env.secret.original-key',
      value: 'secret value',
      source: 'operator',
      confidence: 0.99,
      reason: 'Sensitive candidate should never persist.',
    });
    const proposeHash = brain.accessAudit.list({ operation: 'review.propose' })[0]?.keyHash;

    brain.memoryReview.neverStore(candidate.id, { reviewer: 'operator' });

    const neverStoreAudit = brain.accessAudit.list({ operation: 'review.neverStore' });
    expect(neverStoreAudit[0]).toMatchObject({ operation: 'review.neverStore', outcome: 'success' });
    expect(neverStoreAudit[0]?.keyHash).toBe(proposeHash);
    expect(JSON.stringify(neverStoreAudit)).not.toContain('env.secret.original-key');

    brain.close();
  });

  it('hashes the restore entry that fails validation', () => {
    const brain = new SqliteBrain(':memory:', { maxValueBytes: 64 });
    brain.working.set('restore.invalid.target', 'probe');
    const expectedHash = brain.accessAudit.list({ operation: 'working.set' })[0]?.keyHash;

    expect(() => brain.working.restore({
      safe: 'ok',
      'restore.invalid.target': 'x'.repeat(128),
    })).toThrow(/maxValueBytes/);

    const restoreAudit = brain.accessAudit.list({ operation: 'working.restore' });
    expect(restoreAudit[0]).toMatchObject({ operation: 'working.restore', outcome: 'error' });
    expect(restoreAudit[0]?.keyHash).toBe(expectedHash);

    brain.close();
  });

  it('audits denied review rejects and never-store decisions without raw guarded metadata', () => {
    const brain = new SqliteBrain(':memory:');
    const rejectCandidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.reject.target',
      value: 'safe value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for reject denial.',
    });
    const neverStoreCandidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.never-store.target',
      value: 'safe value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for never-store denial.',
    });

    brain.rightToForget({ query: 'guarded-review-decision-note' });

    expect(() => brain.memoryReview.reject(rejectCandidate.id, {
      reviewer: 'operator',
      note: 'guarded-review-decision-note',
    })).toThrow(/right-to-forget/);
    expect(() => brain.memoryReview.neverStore(neverStoreCandidate.id, {
      reviewer: 'operator',
      note: 'guarded-review-decision-note',
    })).toThrow(/right-to-forget/);

    const rejectAudit = brain.accessAudit.list({ operation: 'review.reject' });
    const neverStoreAudit = brain.accessAudit.list({ operation: 'review.neverStore' });
    expect(rejectAudit[0]).toMatchObject({ operation: 'review.reject', outcome: 'denied' });
    expect(neverStoreAudit[0]).toMatchObject({ operation: 'review.neverStore', outcome: 'denied' });
    expect(JSON.stringify([...rejectAudit, ...neverStoreAudit])).not.toContain('guarded-review-decision-note');

    brain.close();
  });

  it('audits missing review edit, reject, and never-store candidates before rethrowing', () => {
    const brain = new SqliteBrain(':memory:');

    expect(() => brain.memoryReview.edit('missing-edit-candidate', { reason: 'attempted edit' })).toThrow(/not found/);
    expect(() => brain.memoryReview.reject('missing-reject-candidate')).toThrow(/not found/);
    expect(() => brain.memoryReview.neverStore('missing-never-store-candidate')).toThrow(/not found/);

    const editAudit = brain.accessAudit.list({ operation: 'review.edit' });
    const rejectAudit = brain.accessAudit.list({ operation: 'review.reject' });
    const neverStoreAudit = brain.accessAudit.list({ operation: 'review.neverStore' });
    expect(editAudit[0]).toMatchObject({ operation: 'review.edit', outcome: 'error' });
    expect(editAudit[0]?.details?.id).toBe('missing-edit-candidate');
    expect(editAudit[0]?.keyHash).toBeUndefined();
    expect(rejectAudit[0]).toMatchObject({ operation: 'review.reject', outcome: 'error' });
    expect(rejectAudit[0]?.details?.id).toBe('missing-reject-candidate');
    expect(rejectAudit[0]?.keyHash).toBeUndefined();
    expect(neverStoreAudit[0]).toMatchObject({ operation: 'review.neverStore', outcome: 'error' });
    expect(neverStoreAudit[0]?.details?.id).toBe('missing-never-store-candidate');
    expect(neverStoreAudit[0]?.keyHash).toBeUndefined();

    brain.close();
  });

  it('does not emit an internal working.clear audit event during restore', () => {
    const brain = new SqliteBrain(':memory:');

    brain.working.restore({ restored: true });

    const workingAudit = brain.accessAudit.list({ store: 'working' });
    expect(workingAudit.map((event) => event.operation)).toContain('working.restore');
    expect(workingAudit.map((event) => event.operation)).not.toContain('working.clear');

    brain.close();
  });

  it('audits aggregate restore limit failures', () => {
    const maxEntriesBrain = new SqliteBrain(':memory:', { maxEntries: 1 });
    expect(() => maxEntriesBrain.working.restore({ one: 1, two: 2 })).toThrow(/maxEntries/);
    expect(maxEntriesBrain.accessAudit.list({ operation: 'working.restore' })[0]).toMatchObject({
      operation: 'working.restore',
      outcome: 'error',
    });
    maxEntriesBrain.close();

    const maxTotalBrain = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
    expect(() => maxTotalBrain.working.restore({ one: 'x'.repeat(20), two: 'y'.repeat(20) })).toThrow(/maxTotalBytes/);
    expect(maxTotalBrain.accessAudit.list({ operation: 'working.restore' })[0]).toMatchObject({
      operation: 'working.restore',
      outcome: 'error',
    });
    maxTotalBrain.close();
  });

  it('audits review conflict inspections with hashed candidate keys', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('conflict.audit.target', 'existing');
    const expectedHash = brain.accessAudit.list({ operation: 'working.set' })[0]?.keyHash;
    const candidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'conflict.audit.target',
      value: 'new value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for conflict audit.',
    });

    expect(brain.memoryReview.conflictsFor(candidate.id)).toHaveLength(1);

    const audit = brain.accessAudit.list({ operation: 'review.conflictsFor' });
    expect(audit[0]).toMatchObject({ operation: 'review.conflictsFor', outcome: 'success' });
    expect(audit[0]?.keyHash).toBe(expectedHash);

    brain.close();
  });

  it('records recall failures as errors instead of successes', () => {
    const brain = new SqliteBrain(':memory:');
    brain.episodic.record({ type: 'observation', summary: 'needle event', createdAt: new Date().toISOString() });

    expect(() => brain.episodic.recall('needle', Infinity)).toThrow();

    const audit = brain.accessAudit.list({ operation: 'episodic.recall', limit: 1 })[0];
    expect(audit.outcome).toBe('error');
    expect(audit.details?.errorName).toBeTruthy();
  });

  it('audits episodic counts and checkpoint write failures', () => {
    const brain = new SqliteBrain(':memory:');
    brain.episodic.record({ type: 'observation', summary: 'count me', createdAt: new Date().toISOString() });

    expect(brain.episodic.count()).toBe(1);
    expect(brain.accessAudit.list({ operation: 'episodic.count', limit: 1 })[0].outcome).toBe('success');

    const db = (brain as unknown as { db: { exec: (sql: string) => void } }).db;
    db.exec(`
      CREATE TRIGGER fail_checkpoint_insert
      BEFORE INSERT ON checkpoints
      BEGIN
        SELECT RAISE(ABORT, 'simulated checkpoint insert failure');
      END;
    `);

    expect(() =>
      brain.recovery.checkpoint({
        runId: 'audit-run',
        phase: 'audit',
        step: 1,
        context: {},
        timestamp: new Date().toISOString(),
      }),
    ).toThrow('simulated checkpoint insert failure');

    const audit = brain.accessAudit.list({ operation: 'recovery.checkpoint', limit: 1 })[0];
    expect(audit.outcome).toBe('error');
  });

  it('audits working-memory flush failures before rethrowing', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: { exec: (sql: string) => void } }).db;
    db.exec(`
      CREATE TRIGGER fail_working_memory_insert
      BEFORE INSERT ON working_memory
      BEGIN
        SELECT RAISE(ABORT, 'simulated working flush failure');
      END;
    `);

    brain.working.set('flush.failure.target', 'value that should fail on checkpoint flush');
    expect(() =>
      brain.recovery.checkpoint({
        runId: 'flush-audit-run',
        phase: 'audit',
        step: 1,
        context: {},
        timestamp: new Date().toISOString(),
      }),
    ).toThrow('simulated working flush failure');

    const audit = brain.accessAudit.list({ operation: 'working.flush', limit: 1 })[0];
    expect(audit).toMatchObject({ operation: 'working.flush', outcome: 'error' });
    expect(audit.details?.errorName).toBeTruthy();

    brain.close();
  });

  it('includes derived right-to-forget deletions in access audit details', () => {
    const brain = new SqliteBrain(':memory:');
    brain.episodic.record({
      type: 'observation',
      summary: 'derived-forget-secret episodic payload',
      createdAt: new Date().toISOString(),
    });
    brain.recovery.checkpoint({
      runId: 'derived-forget-run',
      phase: 'audit',
      step: 1,
      context: { note: 'derived-forget-secret' },
      timestamp: new Date().toISOString(),
    });
    brain.memoryReview.propose({
      targetStore: 'working',
      key: 'derived.review.target',
      value: 'derived-forget-secret review payload',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for derived right-to-forget audit.',
    });

    const report = brain.rightToForget({ query: 'derived-forget-secret' });
    const audit = brain.accessAudit.list({ operation: 'privacy.rightToForget', limit: 1 })[0];
    expect(report.deleted.derived).toBeGreaterThan(0);
    expect(audit.details?.deletedCheckpoints).toBeGreaterThan(0);
    expect(audit.details?.deletedReviewPayloads).toBeGreaterThan(0);
    expect(audit.details?.deletedDerived).toBe(report.deleted.derived);

    brain.close();
  });

  it('audits failed right-to-forget deletion attempts before rethrowing', () => {
    const brain = new SqliteBrain(':memory:');
    brain.episodic.record({
      type: 'observation',
      summary: 'failed-forget-secret payload',
      createdAt: new Date().toISOString(),
    });
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_forget_delete BEFORE DELETE ON episodic_events
      WHEN OLD.summary LIKE '%failed-forget-secret%'
      BEGIN
        SELECT RAISE(ABORT, 'simulated forget delete failure');
      END;
    `);

    expect(() => brain.rightToForget({ query: 'failed-forget-secret' })).toThrow('simulated forget delete failure');

    const audit = brain.accessAudit.list({ operation: 'privacy.rightToForget', limit: 1 })[0];
    expect(audit).toMatchObject({ operation: 'privacy.rightToForget', outcome: 'error' });
    expect(audit.queryHash).toBeTruthy();
    expect(audit.details?.errorName).toBeTruthy();

    brain.close();
  });

  it('audits attempts to approve missing review candidates', () => {
    const brain = new SqliteBrain(':memory:');

    expect(() => brain.memoryReview.approve('missing-candidate')).toThrow(/not found/);

    const audit = brain.accessAudit.list({ operation: 'review.approve', limit: 1 })[0];
    expect(audit.outcome).toBe('error');
    expect(audit.details?.id).toBe('missing-candidate');
    expect(audit.keyHash).toBeUndefined();
  });

  it('audits checkpoint list reads after successful reads and failed reads as errors', () => {
    const brain = new SqliteBrain(':memory:');
    brain.recovery.checkpoint({
      runId: 'run-1',
      phase: 'audit',
      step: 1,
      context: {},
      timestamp: '2026-07-16T16:00:00.000Z',
    });

    expect(brain.recovery.listCheckpoints()).toHaveLength(1);
    expect(brain.accessAudit.list({ operation: 'recovery.listCheckpoints', limit: 1 })[0]).toMatchObject({
      operation: 'recovery.listCheckpoints',
      store: 'recovery',
      outcome: 'success',
      details: { count: 1 },
    });

    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec('DROP TABLE checkpoints');
    expect(() => brain.recovery.listCheckpoints()).toThrow(/checkpoints/);
    expect(brain.accessAudit.list({ operation: 'recovery.listCheckpoints', limit: 1 })[0]).toMatchObject({
      operation: 'recovery.listCheckpoints',
      store: 'recovery',
      outcome: 'error',
    });

    brain.close();
  });

  it('audits resolution prompt reads and conflict-resolution approvals', () => {
    const brain = new SqliteBrain(':memory:');
    const initial = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.conflict.audit',
      value: 'old value',
      source: 'operator',
      confidence: 0.6,
      reason: 'Initial value.',
    });
    brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
    const scoped = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.conflict.audit',
      value: 'new value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Conflicting value.',
    });

    expect(brain.memoryReview.resolutionPromptFor(scoped.id)).toMatchObject({
      candidateId: scoped.id,
      oldEntry: { value: 'old value' },
      newCandidate: { value: 'new value' },
    });
    expect(brain.accessAudit.list({ operation: 'review.resolutionPromptFor', limit: 1 })[0]).toMatchObject({
      operation: 'review.resolutionPromptFor',
      store: 'review',
      outcome: 'success',
    });

    const resolved = brain.memoryReview.resolveConflict(scoped.id, {
      resolution: 'keep_both_scoped',
      scopedKey: 'review.conflict.audit.scoped',
      reviewer: 'operator',
    });
    expect(resolved.status).toBe('approved');
    expect(brain.accessAudit.list({ operation: 'review.approve', limit: 1 })[0]).toMatchObject({
      operation: 'review.approve',
      outcome: 'success',
      details: { id: scoped.id, resolution: 'keep_both_scoped' },
    });
    expect(brain.accessAudit.list({ operation: 'working.set', limit: 1 })[0]).toMatchObject({
      operation: 'working.set',
      outcome: 'success',
      details: { source: 'review.approve', candidateId: scoped.id, resolution: 'keep_both_scoped' },
    });
    expect(JSON.stringify(brain.accessAudit.list({ operation: 'review.resolutionPromptFor' }))).not.toContain('old value');
    expect(JSON.stringify(brain.accessAudit.list({ operation: 'review.resolutionPromptFor' }))).not.toContain('new value');

    brain.close();
  });

  it('keeps failed working set audit writes from mutating runtime memory', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_working_set_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'working.set'
      BEGIN
        SELECT RAISE(ABORT, 'simulated working set audit failure');
      END;
    `);

    expect(() => brain.working.set('audit-failed-key', 'value')).toThrow('simulated working set audit failure');
    expect(brain.working.get('audit-failed-key')).toBeUndefined();

    brain.close();
  });

  it('keeps failed working restore audit writes from mutating runtime memory', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('restore-existing-key', 'old value');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_working_restore_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'working.restore'
      BEGIN
        SELECT RAISE(ABORT, 'simulated working restore audit failure');
      END;
    `);

    expect(() => brain.working.restore({ 'restore-new-key': 'new value' })).toThrow('simulated working restore audit failure');
    expect(brain.working.get('restore-existing-key')).toBe('old value');
    expect(brain.working.get('restore-new-key')).toBeUndefined();

    brain.close();
  });

  it('keeps failed working clear audit writes from mutating runtime memory', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('clear.audit.rollback', 'keep me');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_working_clear_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'working.clear' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated working clear audit failure');
      END;
    `);

    expect(() => brain.working.clear()).toThrow('simulated working clear audit failure');
    expect(brain.working.get('clear.audit.rollback')).toBe('keep me');

    brain.close();
  });

  it('rolls back working flushes when success audit persistence fails', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('flush.audit.rollback', 'keep me');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_working_flush_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'working.flush' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated working flush audit failure');
      END;
    `);

    expect(() => brain.flush()).toThrow('simulated working flush audit failure');
    const row = db
      .prepare('SELECT value FROM working_memory WHERE key = ?')
      .get('flush.audit.rollback');
    expect(row).toBeUndefined();
    expect(brain.working.get('flush.audit.rollback')).toBe('keep me');

    brain.close();
  });

  it('rolls back checkpoint writes and clears when success audit persistence fails', () => {
    const checkpointState = {
      runId: 'atomic-checkpoint-run',
      phase: 'audit',
      step: 1,
      context: {},
      timestamp: '2026-07-16T18:00:00.000Z',
    };
    const checkpointBrain = new SqliteBrain(':memory:');
    const checkpointDb = (checkpointBrain as unknown as { db: Database.Database }).db;
    checkpointDb.exec(`
      CREATE TRIGGER fail_checkpoint_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'recovery.checkpoint' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated checkpoint audit failure');
      END;
    `);

    expect(() => checkpointBrain.recovery.checkpoint(checkpointState)).toThrow('simulated checkpoint audit failure');
    expect(checkpointBrain.recovery.listCheckpoints()).toHaveLength(0);
    checkpointBrain.close();

    const clearBrain = new SqliteBrain(':memory:');
    clearBrain.recovery.checkpoint(checkpointState);
    const clearDb = (clearBrain as unknown as { db: Database.Database }).db;
    clearDb.exec(`
      CREATE TRIGGER fail_checkpoint_clear_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'recovery.clearCheckpoints' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated checkpoint clear audit failure');
      END;
    `);

    expect(() => clearBrain.recovery.clearCheckpoints()).toThrow('simulated checkpoint clear audit failure');
    expect(clearBrain.recovery.listCheckpoints()).toHaveLength(1);
    clearBrain.close();
  });

  it('rolls back review edits and decisions when success audit persistence fails', () => {
    const editBrain = new SqliteBrain(':memory:');
    const editCandidate = editBrain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.edit.rollback',
      value: 'old value',
      source: 'operator',
      confidence: 0.8,
      reason: 'Original proposal.',
    });
    const editDb = (editBrain as unknown as { db: Database.Database }).db;
    editDb.exec(`
      CREATE TRIGGER fail_review_edit_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'review.edit' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated review edit audit failure');
      END;
    `);
    expect(() => editBrain.memoryReview.edit(editCandidate.id, { key: 'review.edit.changed' })).toThrow('simulated review edit audit failure');
    expect(editDb.prepare('SELECT memory_key FROM memory_review_candidates WHERE id = ?').get(editCandidate.id)).toMatchObject({
      memory_key: 'review.edit.rollback',
    });
    editBrain.close();

    const approveBrain = new SqliteBrain(':memory:');
    const approveCandidate = approveBrain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.approve.rollback',
      value: 'approved value',
      source: 'operator',
      confidence: 0.8,
      reason: 'Approval should roll back.',
    });
    const approveDb = (approveBrain as unknown as { db: Database.Database }).db;
    approveDb.exec(`
      CREATE TRIGGER fail_review_approve_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'review.approve' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated review approve audit failure');
      END;
    `);
    expect(() => approveBrain.memoryReview.approve(approveCandidate.id, { reviewer: 'operator' })).toThrow('simulated review approve audit failure');
    expect(approveBrain.working.get('review.approve.rollback')).toBeUndefined();
    expect(approveDb.prepare('SELECT status FROM memory_review_candidates WHERE id = ?').get(approveCandidate.id)).toMatchObject({
      status: 'pending',
    });
    approveBrain.close();

    const rejectBrain = new SqliteBrain(':memory:');
    const rejectCandidate = rejectBrain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.reject.rollback',
      value: 'rejected value',
      source: 'operator',
      confidence: 0.8,
      reason: 'Rejection should roll back.',
    });
    const rejectDb = (rejectBrain as unknown as { db: Database.Database }).db;
    rejectDb.exec(`
      CREATE TRIGGER fail_review_reject_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'review.reject' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated review reject audit failure');
      END;
    `);
    expect(() => rejectBrain.memoryReview.reject(rejectCandidate.id, { reviewer: 'operator' })).toThrow('simulated review reject audit failure');
    expect(rejectDb.prepare('SELECT status FROM memory_review_candidates WHERE id = ?').get(rejectCandidate.id)).toMatchObject({
      status: 'pending',
    });
    rejectBrain.close();

    const neverStoreBrain = new SqliteBrain(':memory:');
    neverStoreBrain.working.set('review.never-store.rollback', 'keep working value');
    const neverStoreCandidate = neverStoreBrain.memoryReview.propose({
      targetStore: 'working',
      key: 'review.never-store.rollback',
      value: 'candidate value',
      source: 'operator',
      confidence: 0.8,
      reason: 'Never-store should roll back.',
    });
    const neverStoreDb = (neverStoreBrain as unknown as { db: Database.Database }).db;
    neverStoreDb.exec(`
      CREATE TRIGGER fail_review_never_store_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'review.neverStore' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated review never-store audit failure');
      END;
    `);
    expect(() => neverStoreBrain.memoryReview.neverStore(neverStoreCandidate.id, { reviewer: 'operator' })).toThrow('simulated review never-store audit failure');
    expect(neverStoreBrain.working.get('review.never-store.rollback')).toBe('keep working value');
    expect(neverStoreDb.prepare('SELECT status FROM memory_review_candidates WHERE id = ?').get(neverStoreCandidate.id)).toMatchObject({
      status: 'pending',
    });
    neverStoreBrain.close();
  });

  it('rolls back right-to-forget deletions when success audit persistence fails', () => {
    const brain = new SqliteBrain(':memory:');
    brain.episodic.record({
      type: 'observation',
      summary: 'atomic-forget-secret payload',
      createdAt: new Date().toISOString(),
    });
    const beforeCount = brain.episodic.count();
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_right_to_forget_success_audit
      BEFORE INSERT ON memory_access_audit_events
      WHEN NEW.operation = 'privacy.rightToForget' AND NEW.outcome = 'success'
      BEGIN
        SELECT RAISE(ABORT, 'simulated right-to-forget audit failure');
      END;
    `);

    expect(() => brain.rightToForget({ query: 'atomic-forget-secret' })).toThrow('simulated right-to-forget audit failure');
    expect(brain.episodic.count()).toBe(beforeCount);
    expect(brain.episodic.recall('atomic-forget-secret', 5)).toHaveLength(1);

    brain.close();
  });

  it('audits clear-checkpoint failures before rethrowing', () => {
    const brain = new SqliteBrain(':memory:');
    brain.recovery.checkpoint({
      runId: 'clear-failure-run',
      phase: 'audit',
      step: 1,
      context: {},
      timestamp: '2026-07-16T17:00:00.000Z',
    });
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec(`
      CREATE TRIGGER fail_checkpoint_clear
      BEFORE DELETE ON checkpoints
      BEGIN
        SELECT RAISE(ABORT, 'simulated checkpoint clear failure');
      END;
    `);

    expect(() => brain.recovery.clearCheckpoints()).toThrow('simulated checkpoint clear failure');
    expect(brain.accessAudit.list({ operation: 'recovery.clearCheckpoints', limit: 1 })[0]).toMatchObject({
      operation: 'recovery.clearCheckpoints',
      outcome: 'error',
    });

    brain.close();
  });

  it('audits provenance lookup failures before rethrowing', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec('DROP TABLE memory_review_provenance');

    expect(() => brain.memoryReview.provenanceFor('working', 'missing-provenance')).toThrow(/memory_review_provenance/);
    expect(brain.accessAudit.list({ operation: 'review.provenanceFor', limit: 1 })[0]).toMatchObject({
      operation: 'review.provenanceFor',
      outcome: 'error',
    });

    brain.close();
  });

  it('audits provenance list reads and failures without raw filters', () => {
    const brain = new SqliteBrain(':memory:');
    const candidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'audit.provenance.list',
      value: 'audited provenance',
      source: 'operator',
      confidence: 0.9,
      reason: 'Provenance list audit coverage.',
    });
    brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

    expect(brain.memoryReview.listProvenance({ key: 'audit.provenance.list' })).toHaveLength(1);
    const successAudit = brain.accessAudit.list({ operation: 'review.listProvenance', limit: 1 })[0];
    expect(successAudit).toMatchObject({
      operation: 'review.listProvenance',
      outcome: 'success',
      queryHash: expect.any(String),
    });
    expect(JSON.stringify(successAudit)).not.toContain('audit.provenance.list');

    expect(brain.memoryReview.listProvenance({ keys: [] })).toEqual([]);
    expect(brain.accessAudit.list({ operation: 'review.listProvenance', limit: 1 })[0]).toMatchObject({
      outcome: 'miss',
      details: { count: 0 },
    });

    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec('DROP TABLE memory_review_provenance');
    expect(() => brain.memoryReview.listProvenance({ key: 'audit.provenance.list' })).toThrow(/memory_review_provenance/);
    expect(brain.accessAudit.list({ operation: 'review.listProvenance', limit: 1 })[0]).toMatchObject({
      operation: 'review.listProvenance',
      outcome: 'error',
    });

    brain.close();
  });

  it('audits failed last-checkpoint reads before rethrowing', () => {
    const brain = new SqliteBrain(':memory:');
    const db = (brain as unknown as { db: Database.Database }).db;
    db.exec('DROP TABLE checkpoints');

    expect(() => brain.recovery.lastCheckpoint()).toThrow(/checkpoints/);
    expect(brain.accessAudit.list({ operation: 'recovery.lastCheckpoint', limit: 1 })[0]).toMatchObject({
      operation: 'recovery.lastCheckpoint',
      outcome: 'error',
    });

    brain.close();
  });

  it('audits dry-run right-to-forget scans once', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('dry-run-forget-key', 'dry-run-forget-secret');

    const report = brain.rightToForget({ query: 'dry-run-forget-secret', dryRun: true });
    const audit = brain.accessAudit.list({ operation: 'privacy.rightToForget' });

    expect(report.dryRun).toBe(true);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ operation: 'privacy.rightToForget', outcome: 'success' });
    expect(audit[0]?.details).toMatchObject({ dryRun: true, deletedWorking: 1 });

    brain.close();
  });

  it('audits working deletes caused by never-store purges', () => {
    const brain = new SqliteBrain(':memory:');
    brain.working.set('never-store-existing-key', 'sensitive working value');
    const candidate = brain.memoryReview.propose({
      targetStore: 'working',
      key: 'never-store-existing-key',
      value: 'sensitive working value',
      source: 'operator',
      confidence: 0.9,
      reason: 'Candidate for never-store purge audit.',
    });

    brain.memoryReview.neverStore(candidate.id, { reviewer: 'operator' });
    const audit = brain.accessAudit.list({ operation: 'working.delete', limit: 1 })[0];

    expect(audit).toMatchObject({
      operation: 'working.delete',
      store: 'working',
      outcome: 'success',
      details: { source: 'review.neverStore', candidateId: candidate.id },
    });

    brain.close();
  });
});
