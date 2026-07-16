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
});
