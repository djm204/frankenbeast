import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
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
  WorkingMemoryKeyError,
  WorkingMemoryHydrationLimitError,
  CorruptWorkingMemoryRowError,
  UnsupportedMemorySchemaVersionError,
  MemoryEncryptionKeyUnavailableError,
  MemoryEncryptionMigrationRequiredError,
  MemoryEncryptionRequiredError,
  MemoryEncryptionWrongKeyError,
  CURRENT_MEMORY_SCHEMA_VERSION,
  DEFAULT_WORKING_MEMORY_LIMITS,
  MAX_WORKING_MEMORY_KEY_BYTES,
  DEFAULT_MEMORY_CONFIDENCE_HALF_LIFE_MS,
  MemoryConfidenceDecayError,
  calculateMemoryConfidenceDecay,
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

  describe('memory confidence decay', () => {
    it('returns deterministic decayed confidence with structured evidence', () => {
      const result = calculateMemoryConfidenceDecay({
        confidence: 0.8,
        observedAt: '2026-01-01T00:00:00.000Z',
        now: '2026-01-16T00:00:00.000Z',
        halfLifeMs: DEFAULT_MEMORY_CONFIDENCE_HALF_LIFE_MS,
      });

      expect(result).toEqual({
        initialConfidence: 0.8,
        confidence: 0.8 * Math.SQRT1_2,
        decayFactor: Math.SQRT1_2,
        ageMs: 15 * 24 * 60 * 60 * 1000,
        halfLifeMs: DEFAULT_MEMORY_CONFIDENCE_HALF_LIFE_MS,
        floor: 0,
      });
    });

    it('clamps future observations to zero age and respects a confidence floor', () => {
      expect(calculateMemoryConfidenceDecay({
        confidence: 0.4,
        observedAt: '2026-01-02T00:00:00.000Z',
        now: '2026-01-01T00:00:00.000Z',
        floor: 0.1,
      })).toMatchObject({
        confidence: 0.4,
        decayFactor: 1,
        ageMs: 0,
        floor: 0.1,
      });

      expect(calculateMemoryConfidenceDecay({
        confidence: 0.4,
        observedAt: '2026-01-01T00:00:00.000Z',
        now: '2026-01-31T00:00:00.000Z',
        halfLifeMs: 24 * 60 * 60 * 1000,
        floor: 0.2,
      }).confidence).toBe(0.2);

      expect(calculateMemoryConfidenceDecay({
        confidence: 0.05,
        observedAt: '2026-01-01T00:00:00.000Z',
        now: '2026-01-31T00:00:00.000Z',
        halfLifeMs: 24 * 60 * 60 * 1000,
        floor: 0.1,
      })).toMatchObject({
        confidence: 0.05,
        floor: 0.05,
      });
    });

    it('rejects invalid confidence, floor, half-life, and timestamps explicitly', () => {
      expect(() => calculateMemoryConfidenceDecay({
        confidence: 1.1,
        observedAt: '2026-01-01T00:00:00.000Z',
      })).toThrow(MemoryConfidenceDecayError);
      expect(() => calculateMemoryConfidenceDecay({
        confidence: 0.2,
        floor: -0.1,
        observedAt: '2026-01-01T00:00:00.000Z',
      })).toThrow('floor must be a finite number between 0 and 1');
      expect(() => calculateMemoryConfidenceDecay({
        confidence: 0.2,
        halfLifeMs: 0,
        observedAt: '2026-01-01T00:00:00.000Z',
      })).toThrow('halfLifeMs must be a positive finite number');
      expect(() => calculateMemoryConfidenceDecay({
        confidence: 0.2,
        observedAt: 'not-a-date',
      })).toThrow('observedAt must be a valid date');
    });
  });

  describe('memory retention policy report', () => {
    it('indexes bounded retention scans without table scans or temporary sorting', () => {
      const dir = mkdtempSync(join(tmpdir(), 'franken-retention-indexes-'));
      const dbPath = join(dir, 'brain.db');
      new SqliteBrain(dbPath).close();
      const indexedDb = new Database(dbPath, { readonly: true });
      const episodicPlan = indexedDb
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT * FROM episodic_events ORDER BY created_at ASC, id ASC LIMIT 100`,
        )
        .all() as Array<{ detail: string }>;
      const checkpointPlan = indexedDb
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT * FROM checkpoints ORDER BY created_at ASC, id ASC LIMIT 100`,
        )
        .all() as Array<{ detail: string }>;

      expect(episodicPlan.map((row) => row.detail).join('\n')).toContain(
        'USING INDEX idx_episodic_events_retention',
      );
      expect(checkpointPlan.map((row) => row.detail).join('\n')).toContain(
        'USING INDEX idx_checkpoints_retention',
      );
      expect([...episodicPlan, ...checkpointPlan].map((row) => row.detail).join('\n'))
        .not.toContain('USE TEMP B-TREE');
      indexedDb.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('enforces reported episodic and checkpoint compaction while preserving useful recent state', () => {
      brain.episodic.record({
        type: 'failure',
        summary: 'obsolete transient failure',
        details: { memoryClass: 'transient_observation' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'failure',
        summary: 'recent transient failure',
        details: { memoryClass: 'transient_observation' },
        createdAt: '2026-01-09T00:00:00.000Z',
      });
      brain.recovery.checkpoint({
        runId: 'old-run',
        phase: 'execution',
        step: 1,
        context: { note: 'obsolete checkpoint' },
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      brain.recovery.checkpoint({
        runId: 'current-run',
        phase: 'execution',
        step: 2,
        context: { note: 'current checkpoint' },
        timestamp: '2026-01-09T00:00:00.000Z',
      });

      const result = brain.enforceMemoryRetention({
        now: '2026-01-09T00:00:00.000Z',
        maxDeletes: 10,
      });

      expect(result.deleted).toEqual({ episodic: 1, checkpoints: 1 });
      expect(result.report.compactionCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({ store: 'episodic', key: '1' }),
        expect.objectContaining({ store: 'checkpoint', key: '1' }),
      ]));
      expect(brain.episodic.recall('obsolete', 10)).toEqual([]);
      expect(brain.episodic.recall('recent', 10)).toHaveLength(1);
      expect(brain.episodic.recentFailures(10).map((event) => event.summary)).toEqual([
        'recent transient failure',
      ]);
      expect(brain.recovery.listCheckpoints()).toEqual([
        { id: '2', timestamp: '2026-01-09T00:00:00.000Z' },
      ]);
      expect(brain.recovery.lastCheckpoint()?.runId).toBe('current-run');
      expect(brain.accessAudit.list({ operation: 'retention.enforce' })).toMatchObject([
        {
          store: 'retention',
          outcome: 'success',
          details: { episodicDeleted: 1, checkpointsDeleted: 1, maxDeletes: 10 },
        },
      ]);
    });

    it('rejects unbounded retention enforcement batches', () => {
      expect(() => brain.enforceMemoryRetention({ maxDeletes: 1_001 })).toThrow(
        'maxDeletes must be a positive safe integer no greater than 1000',
      );
    });

    it('bounds deletions and selects the oldest candidate when priorities match', () => {
      for (const createdAt of [
        '2026-01-03T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
      ]) {
        brain.episodic.record({
          type: 'observation',
          summary: `transient ${createdAt}`,
          details: { memoryClass: 'transient_observation' },
          createdAt,
        });
      }

      const result = brain.enforceMemoryRetention({
        now: '2026-01-10T00:00:00.000Z',
        maxDeletes: 1,
      });

      expect(result.deleted).toEqual({ episodic: 1, checkpoints: 0 });
      expect(result.report.compactionCandidates.map((entry) => entry.key)).toEqual(['2', '3', '1']);
      expect(brain.episodic.recent(-1).map((event) => event.id)).toEqual([1, 3]);
    });

    it('bounds retention scans before selecting a deletion batch', () => {
      for (let day = 1; day <= 5; day += 1) {
        brain.episodic.record({
          type: 'observation',
          summary: `bounded transient ${day}`,
          details: { memoryClass: 'transient_observation' },
          createdAt: `2026-01-0${day}T00:00:00.000Z`,
        });
      }

      const result = brain.enforceMemoryRetention({
        now: '2026-01-20T00:00:00.000Z',
        maxDeletes: 1,
        maxScanRows: 2,
      });

      expect(result.report.entries.filter((entry) => entry.store === 'episodic')).toHaveLength(2);
      expect(result.report.compactionCandidates.map((entry) => entry.key)).toEqual(['1', '2']);
      expect(result.deleted).toEqual({ episodic: 1, checkpoints: 0 });
    });

    it('advances bounded episodic scans past protected rows on later batches', () => {
      for (const id of [1, 2]) {
        brain.episodic.record({
          type: 'observation',
          summary: `protected audit ${id}`,
          details: { memoryClass: 'audit_record' },
          createdAt: `2026-01-0${id}T00:00:00.000Z`,
        });
      }
      brain.episodic.record({
        type: 'observation',
        summary: 'expired candidate beyond the first scan window',
        details: { memoryClass: 'transient_observation' },
        createdAt: '2026-01-03T00:00:00.000Z',
      });

      const first = brain.enforceMemoryRetention({
        now: '2026-01-20T00:00:00.000Z',
        maxDeletes: 1,
        maxScanRows: 2,
      });
      const second = brain.enforceMemoryRetention({
        now: '2026-01-20T00:00:00.000Z',
        maxDeletes: 1,
        maxScanRows: 2,
      });

      expect(first.deleted).toEqual({ episodic: 0, checkpoints: 0 });
      expect(second.deleted).toEqual({ episodic: 1, checkpoints: 0 });
      expect(brain.episodic.recent(-1).map((event) => event.summary)).toEqual([
        'protected audit 2',
        'protected audit 1',
      ]);
    });

    it('resumes bounded episodic scans after reopening a scheduled brain', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-retention-cursor-'));
      const dbPath = join(dir, 'brain.db');
      let scheduledBrain: SqliteBrain | undefined;

      try {
        scheduledBrain = new SqliteBrain(dbPath);
        for (const id of [1, 2]) {
          scheduledBrain.episodic.record({
            type: 'observation',
            summary: `protected audit ${id}`,
            details: { memoryClass: 'audit_record' },
            createdAt: `2026-01-0${id}T00:00:00.000Z`,
          });
        }
        scheduledBrain.episodic.record({
          type: 'observation',
          summary: 'expired candidate beyond the first scan window',
          details: { memoryClass: 'transient_observation' },
          createdAt: '2026-01-03T00:00:00.000Z',
        });

        expect(scheduledBrain.enforceMemoryRetention({
          now: '2026-01-20T00:00:00.000Z',
          maxDeletes: 1,
          maxScanRows: 2,
        }).deleted.episodic).toBe(0);
        scheduledBrain.close();

        scheduledBrain = new SqliteBrain(dbPath);
        expect(scheduledBrain.enforceMemoryRetention({
          now: '2026-01-20T00:00:00.000Z',
          maxDeletes: 1,
          maxScanRows: 2,
        }).deleted.episodic).toBe(1);
        expect(scheduledBrain.episodic.recent(-1).map((event) => event.summary)).not.toContain(
          'expired candidate beyond the first scan window',
        );
      } finally {
        scheduledBrain?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not scan report-only working memory while holding the enforcement writer lock', () => {
      brain.working.set('corrupt.working.row', 'initially valid');
      brain.flush();
      brain.episodic.record({
        type: 'observation',
        summary: 'expired episodic candidate',
        details: { memoryClass: 'transient_observation' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE working_memory SET value = ? WHERE key = ?`).run(
        '{',
        'corrupt.working.row',
      );

      const result = brain.enforceMemoryRetention({
        now: '2026-01-20T00:00:00.000Z',
        maxDeletes: 1,
        maxScanRows: 2,
      });

      expect(result.deleted).toEqual({ episodic: 1, checkpoints: 0 });
      expect(result.report.entries.some((entry) => entry.store === 'working')).toBe(false);
    });

    it('fails closed when a bounded scan cannot identify a usable checkpoint floor', () => {
      for (let day = 1; day <= 4; day += 1) {
        brain.recovery.checkpoint({
          runId: `run-${day}`,
          phase: 'execution',
          step: day,
          context: {},
          timestamp: `2026-01-0${day}T00:00:00.000Z`,
        });
      }
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE checkpoints SET state = ? WHERE id > 1`).run('{');

      const result = brain.enforceMemoryRetention({
        now: '2026-01-20T00:00:00.000Z',
        maxDeletes: 10,
        maxScanRows: 2,
      });

      expect(result.deleted.checkpoints).toBe(0);
      expect(brain.recovery.lastCheckpoint()?.runId).toBe('run-1');
    });

    it('preserves the newest usable checkpoint when a newer row is corrupt', () => {
      brain.recovery.checkpoint({
        runId: 'usable-run',
        phase: 'execution',
        step: 1,
        context: {},
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      brain.recovery.checkpoint({
        runId: 'corrupt-run',
        phase: 'execution',
        step: 2,
        context: {},
        timestamp: '2026-01-02T00:00:00.000Z',
      });
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE checkpoints SET state = ? WHERE id = 2`).run('{');

      const result = brain.enforceMemoryRetention({
        now: '2026-01-10T00:00:00.000Z',
        maxDeletes: 10,
      });

      expect(result.deleted.checkpoints).toBe(1);
      expect(brain.recovery.lastCheckpoint()?.runId).toBe('usable-run');
      expect(brain.recovery.listCheckpoints()).toEqual([
        { id: '1', timestamp: '2026-01-01T00:00:00.000Z' },
      ]);
    });

    it('documents policy ordering and protects user preferences from compaction', () => {
      brain.working.set('user.preference.response-style', 'concise');
      brain.working.set('env.node.version', { value: '20.x', memoryClass: 'environment_fact' });
      brain.working.set('scratch.task-state', { value: 'temporary analysis', memoryClass: 'transient_observation' });
      brain.working.set('ops.tmp', {
        value: 'short lived process state',
        category: 'temporary-operational',
        sourceScope: 'test',
        expiresAt: '2027-01-01T00:30:00.000Z',
      });

      const report = brain.memoryRetentionReport({
        now: '2027-01-01T00:00:00.000Z',
        maxEntries: 2,
      });

      expect(report.policies.map((policy) => policy.class)).toContain('user_preference');
      expect(report.entries.find((entry) => entry.key === 'user.preference.response-style')).toMatchObject({
        class: 'user_preference',
        action: 'protect',
        protected: true,
      });
      expect(report.entries.find((entry) => entry.key === 'ops.tmp')).toMatchObject({
        class: 'temporary_operational',
        action: 'compact',
      });
      expect(report.compactionCandidates.map((entry) => entry.key)).toEqual([
        'ops.tmp',
        'scratch.task-state',
      ]);
      expect(report.compactionCandidates).not.toContainEqual(
        expect.objectContaining({ key: 'user.preference.response-style' }),
      );
    });

    it('reports episodic entries nearing expiry or compaction by class', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'temporary task progress that should not become durable memory',
        details: { memoryClass: 'transient_observation' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'decision',
        summary: 'repo convention: use conventional commits',
        details: { memoryClass: 'project_convention' },
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2026-01-09T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.class === 'transient_observation')).toMatchObject({
        store: 'episodic',
        action: 'compact',
      });
      expect(report.entries.find((entry) => entry.class === 'project_convention')).toMatchObject({
        store: 'episodic',
        action: 'compact',
      });
    });

    it('reports expired TTL rows without mutating memory or compacting active entries unnecessarily', () => {
      const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      brain.working.set('fresh.env', { value: 'node 20', memoryClass: 'environment_fact' });
      brain.working.set('fresh.procedure', { value: 'run npm test', memoryClass: 'learned_procedure' });
      brain.working.set('expired.one', {
        value: 'old scratch',
        category: 'temporary-operational',
        expiresAt: futureExpiry,
      });
      brain.working.set('expired.two', {
        value: 'old scratch 2',
        category: 'temporary-operational',
        expiresAt: futureExpiry,
      });

      const report = brain.memoryRetentionReport({
        now: new Date(Date.parse(futureExpiry) + 24 * 60 * 60 * 1000).toISOString(),
        maxEntries: 2,
      });

      expect(report.entries.filter((entry) => entry.action === 'expired').map((entry) => entry.key)).toEqual([
        'expired.one',
        'expired.two',
      ]);
      expect(report.compactionCandidates).toEqual([]);
      expect(brain.working.snapshot()).toHaveProperty('expired.one');
    });

    it('treats TTL-managed working memory as temporary even when explicit classes are present', () => {
      brain.working.set('ttl.user-pref', {
        value: 'temporary rollout note',
        memoryClass: 'user_preference',
        category: 'temporary-operational',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2027-01-02T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.key === 'ttl.user-pref')).toMatchObject({
        class: 'temporary_operational',
        action: 'expired',
      });
    });

    it('uses the same temporary TTL marker semantics as working memory cleanup', () => {
      brain.working.set('class-only-expiry', {
        value: 'reported temp but not a TTL-managed temporary operational value',
        memoryClass: 'temporary_operational',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2027-01-01T00:00:01.000Z' });

      expect(report.entries.find((entry) => entry.key === 'class-only-expiry')).toMatchObject({
        class: 'temporary_operational',
        action: 'retain',
      });
      expect(report.entries.find((entry) => entry.key === 'class-only-expiry')).not.toHaveProperty('expiresAt');
      expect(brain.working.has('class-only-expiry')).toBe(true);
    });

    it('suppresses runtime entries covered by cross-process deletion guards before retention reporting', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-retention-rtf-guard-'));
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

        expect(stale!.memoryRetentionReport().entries.map((entry) => entry.key)).not.toContain('contact');
        expect(stale!.working.has('contact')).toBe(false);
      } finally {
        db?.close();
        stale?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('protects right-to-forget audit events from retention compaction reports', () => {
      brain.episodic.record({
        type: 'observation',
        step: 'right-to-forget',
        summary: 'Right-to-forget deletion completed',
        details: {
          selectorHash: 'a'.repeat(64),
          deleted: { working: 1, episodic: 0, derived: 1 },
        },
        createdAt: '2020-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2027-01-01T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.class === 'audit_record')).toMatchObject({
        action: 'protect',
        protected: true,
      });
      expect(report.compactionCandidates.map((entry) => entry.class)).not.toContain('audit_record');
    });

    it('protects quarantined right-to-forget audit envelopes from retention compaction', () => {
      brain.episodic.record({
        type: 'observation',
        step: 'right-to-forget',
        summary: 'Right-to-forget deletion completed',
        details: {
          selectorHash: 'a'.repeat(64),
          deleted: { working: 1, episodic: 0, derived: 1 },
        },
        createdAt: '2020-01-01T00:00:00.000Z',
      });
      const eventId = brain.episodic.recent(1)[0]!.id;
      const db = (
        brain as unknown as {
          db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
        }
      ).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run('{', eventId);

      const report = brain.memoryRetentionReport({ now: '2027-01-01T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.key === String(eventId))).toMatchObject({
        class: 'audit_record',
        action: 'protect',
        protected: true,
      });
      expect(report.compactionCandidates).not.toContainEqual(
        expect.objectContaining({ key: String(eventId) }),
      );
    });

    it('marks quarantined episodic retention rows as unreadable by scoped reports', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'private scoped retention entry',
        details: {
          __fbeastMemoryScope: 'fbeast:agent-memory',
          agentId: 'private-agent',
        },
        createdAt: '2026-07-20T00:00:00.000Z',
      });
      const eventId = brain.episodic.recent(1)[0]!.id;
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run('{', eventId);

      const report = brain.memoryRetentionReport({ now: '2026-07-21T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.key === String(eventId))).toMatchObject({
        store: 'episodic',
        agentId: null,
      });
    });

    it('treats explicit audit class aliases as protected audit records', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'Manual deletion audit trail entry',
        details: { memoryClass: 'audit-record' },
        createdAt: '2020-01-01T00:00:00.000Z',
      });
      brain.working.set('manual.audit', {
        value: 'operator approved deletion hash abc123',
        category: 'governance-audit',
      });
      brain.working.set('manual.audit.later-field', {
        value: 'operator approved deletion hash def456',
        category: 'custom-retention-category',
        type: 'audit_record',
      });

      const report = brain.memoryRetentionReport({ now: '2027-01-01T00:00:00.000Z' });

      const auditEntries = report.entries.filter((entry) => entry.class === 'audit_record');
      expect(auditEntries).toEqual(expect.arrayContaining([
        expect.objectContaining({ store: 'episodic', action: 'protect', protected: true }),
        expect.objectContaining({ store: 'working', key: 'manual.audit', action: 'protect', protected: true }),
        expect.objectContaining({ store: 'working', key: 'manual.audit.later-field', action: 'protect', protected: true }),
      ]));
      expect(report.compactionCandidates).not.toContainEqual(expect.objectContaining({ class: 'audit_record' }));
    });

    it('reports expired TTL working entries without deleting them during the report', () => {
      brain.working.set('expired.operational', {
        value: 'short-lived cache',
        category: 'temporary-operational',
        sourceScope: 'test',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2027-01-02T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.key === 'expired.operational')).toMatchObject({
        class: 'temporary_operational',
        action: 'expired',
      });
      expect(brain.memoryRetentionReport({ now: '2027-01-02T00:00:00.000Z' }).entries)
        .toContainEqual(expect.objectContaining({ key: 'expired.operational', action: 'expired' }));
    });

    it('counts existing compaction candidates before applying entry budgets', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'fresh high-priority retained note',
        details: { memoryClass: 'learned_procedure' },
        createdAt: '2026-01-08T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'observation',
        summary: 'fresh low-priority retained note',
        details: { memoryClass: 'environment_fact' },
        createdAt: '2026-01-08T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'observation',
        summary: 'aged scratch observation',
        details: { memoryClass: 'transient_observation' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({
        now: '2026-01-09T00:00:00.000Z',
        maxEntries: 2,
      });

      expect(report.compactionCandidates.map((entry) => entry.key)).toEqual(['3']);
    });

    it('does not apply the working-memory cap as a default report budget', () => {
      const bounded = new SqliteBrain(':memory:', { maxEntries: 1 });
      bounded.episodic.record({
        type: 'observation',
        summary: 'fresh procedure one',
        details: { memoryClass: 'learned_procedure' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      bounded.episodic.record({
        type: 'observation',
        summary: 'fresh procedure two',
        details: { memoryClass: 'learned_procedure' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      const report = bounded.memoryRetentionReport({ now: '2026-01-02T00:00:00.000Z' });

      expect(report.compactionCandidates).toEqual([]);
      bounded.close();
    });

    it('uses persisted working-memory age for retention windows', () => {
      const dir = mkdtempSync(join(tmpdir(), 'retention-age-'));
      const dbPath = join(dir, 'memory.sqlite');
      brain.close();
      brain = new SqliteBrain(dbPath);
      brain.working.set('env.old-host', { value: 'linux host', memoryClass: 'environment_fact' });
      brain.flush();
      const db = new Database(dbPath);
      try {
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run(
          '2025-01-01T00:00:00.000Z',
          'env.old-host',
        );
      } finally {
        db.close();
      }

      const report = brain.memoryRetentionReport({ now: '2026-01-01T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.key === 'env.old-host')).toMatchObject({
        class: 'environment_fact',
        action: 'compact',
      });
      rmSync(dir, { recursive: true, force: true });
    });

    it('returns cloned policy objects in entries', () => {
      brain.working.set('env.node.version', { value: '20.x', memoryClass: 'environment_fact' });
      const report = brain.memoryRetentionReport();
      const [entry] = report.entries;
      entry!.policy.description = 'mutated by caller';

      expect(brain.memoryRetentionReport().entries[0]!.policy.description).not.toBe('mutated by caller');
    });

    it('honors explicit temporary and uncategorized classes', () => {
      brain.working.set('explicit.tmp', {
        value: 'scratch state',
        category: 'temporary-operational',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'observation',
        summary: 'uncategorized note',
        details: { memoryClass: 'uncategorized' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2027-01-02T00:00:00.000Z' });

      expect(report.entries.find((entry) => entry.key === 'explicit.tmp')).toMatchObject({
        class: 'temporary_operational',
        action: 'expired',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });
      expect(report.entries.find((entry) => entry.store === 'episodic' && entry.class === 'uncategorized')).toMatchObject({
        store: 'episodic',
        class: 'uncategorized',
      });
    });

    it('requires fbeast scoping markers before assigning episodic agent ids', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'domain event with agent metadata',
        details: { agentId: 'domain-agent' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      brain.episodic.record({
        type: 'observation',
        summary: 'scoped agent event',
        details: { __fbeastMemoryScope: 'fbeast:agent-memory', agentId: 'scoped-agent' },
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      const report = brain.memoryRetentionReport({ now: '2026-01-02T00:00:00.000Z' });

      expect(report.entries).not.toContainEqual(expect.objectContaining({ agentId: 'domain-agent' }));
      expect(report.entries).toContainEqual(expect.objectContaining({
        store: 'episodic',
        agentId: 'scoped-agent',
      }));
    });
  });

  describe('skill evolution review gate', () => {
    it('creates a review item after repeated sanitized skill failures', () => {
      for (const evidenceId of ['task-1', 'task-2', 'task-3']) {
        brain.episodic.recordSkillFailure({
          skillName: 'resolve-issues',
          workflowName: 'issue-to-pr',
          failureSignature: 'Codex feedback was not folded back into the skill',
          evidenceId,
          step: 'codex-review',
          suggestedPatchArea: 'Codex review loop pitfalls',
          createdAt: '2026-07-16T10:00:00.000Z',
        });
      }

      const [item] = brain.createSkillEvolutionReviewGate({ threshold: 3 });

      expect(item).toEqual(expect.objectContaining({
        id: expect.stringMatching(/^memcand_/),
        key: expect.stringMatching(/^skill-evolution\.review\.resolve-issues\.[a-f0-9]{16}$/),
        status: 'pending',
        value: expect.objectContaining({
          kind: 'skill-evolution-review',
          skillName: 'resolve-issues',
          workflowName: 'issue-to-pr',
          failurePattern: 'Codex feedback was not folded back into the skill',
          failureCount: 3,
          suggestedPatchArea: 'Codex review loop pitfalls',
          evidencePointers: ['task-1', 'task-2', 'task-3'],
        }),
      }));
      expect(JSON.stringify(item)).not.toContain('stack trace');
      expect(brain.createSkillEvolutionReviewGate({ threshold: 3 })).toEqual([]);
    });

    it('does not let quarantined failures consume the skill-evolution lookback', () => {
      for (const evidenceId of ['task-1', 'task-2', 'task-3']) {
        brain.episodic.recordSkillFailure({
          skillName: 'resolve-issues',
          failureSignature: 'same bounded failure',
          evidenceId,
          createdAt: '2026-07-16T10:00:00.000Z',
        });
      }
      brain.episodic.record({
        type: 'failure',
        summary: 'newer corrupt failure',
        details: { marker: 'valid-before-corruption' },
        createdAt: '2026-07-16T10:01:00.000Z',
      });
      const db = (
        brain as unknown as {
          db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
        }
      ).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE summary = ?`).run(
        '{',
        'newer corrupt failure',
      );

      const [item] = brain.createSkillEvolutionReviewGate({ threshold: 3, lookback: 3 });

      expect(item?.value).toMatchObject({
        kind: 'skill-evolution-review',
        failureCount: 3,
      });
    });

    it('does not create a review item for unrelated one-off failures', () => {
      brain.episodic.recordSkillFailure({
        skillName: 'resolve-issues',
        failureSignature: 'stale branch setup',
        evidenceId: 'task-a',
      });
      brain.episodic.recordSkillFailure({
        skillName: 'github-pr-workflow',
        failureSignature: 'stale branch setup',
        evidenceId: 'task-b',
      });
      brain.episodic.record({
        type: 'failure',
        summary: 'Unstructured build failure unrelated to a skill',
        createdAt: '2026-07-16T10:10:00.000Z',
      });

      expect(brain.createSkillEvolutionReviewGate({ threshold: 2 })).toEqual([]);
      expect(brain.memoryReview.list()).toEqual([]);
    });

    it('requires unique evidence pointers and skips unsanitized replayed failure details', () => {
      for (const evidenceId of ['repeat-run', 'repeat-run', 'repeat-run']) {
        brain.episodic.recordSkillFailure({
          skillName: 'resolve-issues',
          failureSignature: 'same failed run was retried',
          evidenceId,
        });
      }
      brain.episodic.record({
        type: 'failure',
        step: 'skill-evolution',
        summary: 'Legacy raw skill-evolution failure',
        createdAt: '2026-07-16T10:10:00.000Z',
        details: {
          category: 'skill-evolution',
          skillName: 'resolve-issues',
          failurePattern: 'x'.repeat(300),
          evidenceId: 'legacy-run',
          suggestedPatchArea: 'raw '.repeat(80),
        },
      });

      expect(brain.createSkillEvolutionReviewGate({ threshold: 2 })).toEqual([]);
      expect(brain.memoryReview.list()).toEqual([]);
    });

    it('omits suppressed duplicate review proposals from created items', () => {
      for (const evidenceId of ['suppressed-1', 'suppressed-2']) {
        brain.episodic.recordSkillFailure({
          skillName: 'resolve-issues',
          failureSignature: 'stale cli flag repeated',
          evidenceId,
        });
      }
      const [item] = brain.createSkillEvolutionReviewGate({ threshold: 2 });
      expect(item).toBeDefined();
      brain.memoryReview.reject(item!.id, { reviewer: 'operator' });

      for (const evidenceId of ['suppressed-3', 'suppressed-4']) {
        brain.episodic.recordSkillFailure({
          skillName: 'resolve-issues',
          failureSignature: 'stale cli flag repeated',
          evidenceId,
        });
      }

      expect(brain.createSkillEvolutionReviewGate({ threshold: 2 })).toEqual([]);
    });

    it('lets reviewers edit, accept, or discard generated skill review items', () => {
      for (const evidenceId of ['run-1', 'run-2']) {
        brain.episodic.recordSkillFailure({
          skillName: 'kanban-worker',
          failureSignature: 'worker exited without completing or blocking',
          evidenceId,
          suggestedPatchArea: 'Kanban lifecycle closeout section',
        });
      }
      const [item] = brain.createSkillEvolutionReviewGate({ threshold: 2 });
      expect(item).toBeDefined();

      const edited = brain.memoryReview.edit(item!.id, {
        value: {
          ...item!.value,
          suggestedPatchArea: 'Require kanban_complete or kanban_block before exit',
        },
        reason: 'Reviewer narrowed the patch area to the closeout requirement.',
      });
      expect(edited.value).toMatchObject({
        suggestedPatchArea: 'Require kanban_complete or kanban_block before exit',
      });
      const accepted = brain.memoryReview.approve(item!.id, { reviewer: 'operator' });
      expect(accepted.status).toBe('approved');
      expect(brain.working.get(item!.key)).toMatchObject({
        kind: 'skill-evolution-review',
        suggestedPatchArea: 'Require kanban_complete or kanban_block before exit',
      });

      for (const evidenceId of ['run-3', 'run-4']) {
        brain.episodic.recordSkillFailure({
          skillName: 'kanban-worker',
          failureSignature: 'missing heartbeat on long operation',
          evidenceId,
        });
      }
      const [discardable] = brain.createSkillEvolutionReviewGate({ threshold: 2 });
      expect(discardable).toBeDefined();
      expect(brain.memoryReview.reject(discardable!.id, { reviewer: 'operator' }).status).toBe('rejected');
    });
  });

  describe('working memory', () => {
    it('stores and retrieves values', () => {
      brain.working.set('key', 'value');
      expect(brain.working.get('key')).toBe('value');
    });

    it('accepts bounded printable working-memory keys', () => {
      const key = 'project:tenant/α β_1-@';

      expect(() => brain.working.set(key, 'value')).not.toThrow();
      expect(brain.working.get(key)).toBe('value');
    });

    it.each([
      { key: '', reason: 'empty', byteLength: 0 },
      { key: 'line\nbreak', reason: 'control_character', byteLength: 10 },
      {
        key: 'k'.repeat(MAX_WORKING_MEMORY_KEY_BYTES + 1),
        reason: 'too_long',
        byteLength: MAX_WORKING_MEMORY_KEY_BYTES + 1,
      },
    ])('rejects invalid working-memory keys before set mutation ($reason)', ({ key, reason, byteLength }) => {
      brain.working.set('existing', 'preserved');

      let error: unknown;
      try {
        brain.working.set(key, 'invalid');
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(WorkingMemoryKeyError);
      expect(error).toMatchObject({
        code: 'INVALID_WORKING_MEMORY_KEY',
        reason,
        byteLength,
        maxBytes: MAX_WORKING_MEMORY_KEY_BYTES,
      });
      expect(brain.working.snapshot()).toEqual({ existing: 'preserved' });
    });

    it('rejects invalid restore keys atomically before persistence', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-invalid-key-'));
      const dbPath = join(dir, 'brain.db');
      const persistent = new SqliteBrain(dbPath);

      try {
        persistent.working.set('existing', 'preserved');
        persistent.flush();

        expect(() => persistent.working.restore({ valid: 1, 'bad\u0000key': 2 })).toThrow(
          WorkingMemoryKeyError,
        );
        persistent.flush();

        expect(persistent.working.snapshot()).toEqual({ existing: 'preserved' });
        const db = new Database(dbPath, { readonly: true });
        expect(db.prepare(`SELECT key FROM working_memory ORDER BY key`).all()).toEqual([
          { key: 'existing' },
        ]);
        db.close();
      } finally {
        persistent.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails closed without mutating legacy persisted rows that have invalid keys', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-legacy-invalid-key-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const initialized = new SqliteBrain(dbPath);
        initialized.close();
        const db = new Database(dbPath);
        db.prepare(
          `INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES (?, ?, ?, ?)`,
        ).run('legacy\nkey', '"value"', new Date().toISOString(), CURRENT_MEMORY_SCHEMA_VERSION);
        db.close();

        expect(() => new SqliteBrain(dbPath)).toThrow(WorkingMemoryKeyError);

        const verify = new Database(dbPath, { readonly: true });
        expect(verify.prepare(`SELECT key FROM working_memory`).pluck().get()).toBe('legacy\nkey');
        verify.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
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

    it('preserves quarantined right-to-forget audit envelopes during later forgets', () => {
      brain.working.set('task', 'delete project note');
      const first = brain.rightToForget({ query: 'delete project' });
      const auditEventId = first.auditEventId;
      expect(auditEventId).toBeDefined();
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run('{', auditEventId);

      brain.rightToForget({ query: 'right-to-forget' });

      expect(brain.episodic.recent(-1).map((event) => event.id)).toContain(auditEventId);
    });

    it('does not match persisted quarantine diagnostics when deleting audit rows', () => {
      brain.working.set('task', 'delete project note');
      const first = brain.rightToForget({ query: 'delete project' });
      const auditEventId = first.auditEventId;
      expect(auditEventId).toBeDefined();
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run(
        JSON.stringify({
          quarantine: {
            field: 'details',
            eventId: auditEventId,
            reason: 'invalid JSON',
          },
        }),
        auditEventId,
      );

      brain.rightToForget({ query: 'invalid JSON' });

      expect(brain.episodic.recent(-1).map((event) => event.id)).toContain(auditEventId);
    });

    it('does not match persisted quarantine diagnostics on ordinary events', () => {
      brain.episodic.record({
        type: 'success',
        summary: 'ordinary quarantined row',
        createdAt: '2026-07-20T00:00:00.000Z',
      });
      const ordinaryEventId = brain.episodic.recent(1)[0]!.id;
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run(
        JSON.stringify({
          quarantine: {
            field: 'details',
            eventId: ordinaryEventId,
            reason: 'invalid JSON',
          },
        }),
        ordinaryEventId,
      );

      brain.rightToForget({ query: 'invalid JSON' });

      expect(brain.episodic.recent(-1).map((event) => event.id)).toContain(ordinaryEventId);
    });

    it('matches readable summary fields on ordinary corrupt events', () => {
      brain.episodic.record({
        type: 'success',
        summary: 'delete corrupt summary',
        details: { marker: 'will-corrupt' },
        createdAt: '2026-07-20T00:00:00.000Z',
      });
      const ordinaryEventId = brain.episodic.recent(1)[0]!.id;
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run(
        '{"marker":"broken"',
        ordinaryEventId,
      );

      brain.rightToForget({ query: 'corrupt summary' });

      expect(brain.episodic.recent(-1).map((event) => event.id)).not.toContain(ordinaryEventId);
    });

    it('deletes quarantined audit rows when their malformed details contain the selector', () => {
      brain.working.set('task', 'delete project note');
      const first = brain.rightToForget({ query: 'delete project' });
      const auditEventId = first.auditEventId;
      expect(auditEventId).toBeDefined();
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run(
        '{"residual":"alice@example.test"',
        auditEventId,
      );

      const report = brain.rightToForget({ query: 'alice@example.test' });

      expect(report.deleted.episodic).toBe(1);
      expect(brain.episodic.recent(-1).map((event) => event.id)).not.toContain(auditEventId);
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

    it('guards memory review proposals whose sourceId matches a forgotten source scope', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.timezone',
        value: 'UTC',
        source: 'chat',
        sourceId: 'msg-42',
        confidence: 0.8,
        reason: 'User stated timezone preference.',
      });
      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

      brain.rightToForget({ sourceScope: 'msg-42' });

      expect(() => brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.locale',
        value: 'en-US',
        source: 'chat',
        sourceId: 'msg-42',
        confidence: 0.8,
        reason: 'Same forgotten message id with different content.',
      })).toThrow(/right-to-forget/);
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

    it('enforces maxEntries when absorbing writes from another connection', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-concurrent-limit-'));
      const dbPath = join(dir, 'brain.db');
      let first: SqliteBrain | undefined;
      let second: SqliteBrain | undefined;

      try {
        first = new SqliteBrain(dbPath, { maxEntries: 1 });
        second = new SqliteBrain(dbPath, { maxEntries: 1 });
        first.working.set('first', 1);
        second.working.set('second', 2);
        second.flush();

        expect(() => first!.flush()).toThrow(WorkingMemoryLimitError);
        expect(first.working.snapshot()).toEqual({ first: 1 });
        expect(first.working.usage()).toMatchObject({ entries: 1 });
      } finally {
        first?.close();
        second?.close();
        rmSync(dir, { recursive: true, force: true });
      }
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

    it('fails before hydrating persisted rows beyond startup row or byte budgets', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-hydration-limit-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        seeded = new SqliteBrain(dbPath);
        seeded.working.set('first', 'x'.repeat(32));
        seeded.working.set('second', 'y'.repeat(32));
        seeded.flush();
        seeded.close();
        seeded = undefined;

        let rowError: unknown;
        try {
          new SqliteBrain(dbPath, undefined, {
            workingMemoryHydrationLimits: { maxRows: 1, maxBytes: 10_000 },
          });
        } catch (error) {
          rowError = error;
        }
        expect(rowError).toMatchObject({
          code: 'WORKING_MEMORY_HYDRATION_LIMIT_EXCEEDED',
          rowCount: 2,
          byteCount: undefined,
          maxRows: 1,
        });

        expect(() =>
          new SqliteBrain(dbPath, undefined, {
            hydrateWorkingMemoryFromDb: false,
            workingMemoryHydrationLimits: { maxRows: 1, maxBytes: 10_000 },
          }),
        ).toThrow(WorkingMemoryHydrationLimitError);

        let byteError: unknown;
        try {
          new SqliteBrain(dbPath, undefined, {
            workingMemoryHydrationLimits: { maxRows: 10, maxBytes: 1 },
          });
        } catch (error) {
          byteError = error;
        }
        expect(byteError).toBeInstanceOf(WorkingMemoryHydrationLimitError);
        expect(byteError).toMatchObject({
          code: 'WORKING_MEMORY_HYDRATION_LIMIT_EXCEEDED',
          rowCount: 2,
          maxBytes: 1,
        });

        db = new Database(dbPath);
        expect(db.prepare(`SELECT key FROM working_memory ORDER BY key ASC`).all()).toEqual([
          { key: 'first' },
          { key: 'second' },
        ]);
      } finally {
        db?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects corrupt persisted JSON during hydration without deleting the recoverable row', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-corrupt-hydration-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        seeded = new SqliteBrain(dbPath);
        seeded.working.set('healthy', { enabled: true });
        seeded.working.set('corrupt', { recoverable: true });
        seeded.flush();
        seeded.close();
        seeded = undefined;

        db = new Database(dbPath);
        db.prepare(`UPDATE working_memory SET value = ? WHERE key = ?`).run('{not-json', 'corrupt');
        db.close();
        db = undefined;

        let hydrationError: unknown;
        try {
          reopened = new SqliteBrain(dbPath);
        } catch (error) {
          hydrationError = error;
        }
        expect(hydrationError).toBeInstanceOf(CorruptWorkingMemoryRowError);
        expect(hydrationError).toMatchObject({
          code: 'CORRUPT_WORKING_MEMORY_ROW',
          key: 'corrupt',
        });

        db = new Database(dbPath);
        expect(
          db.prepare(`SELECT value FROM working_memory WHERE key = ?`).get('corrupt'),
        ).toEqual({ value: '{not-json' });
        db.prepare(`UPDATE working_memory SET value = ? WHERE key = ?`).run(
          JSON.stringify({ recovered: true }),
          'corrupt',
        );
        db.close();
        db = undefined;

        reopened = new SqliteBrain(dbPath);
        expect(reopened.working.get('healthy')).toEqual({ enabled: true });
        expect(reopened.working.get('corrupt')).toEqual({ recovered: true });
      } finally {
        db?.close();
        reopened?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps startup hydration budgets separate from working-memory write limits', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-hydration-write-limit-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;

      try {
        seeded = new SqliteBrain(dbPath);
        seeded.working.set('first', 1);
        seeded.working.set('second', 2);
        seeded.flush();
        seeded.close();
        seeded = undefined;

        reopened = new SqliteBrain(dbPath, undefined, {
          workingMemoryHydrationLimits: { maxRows: 2, maxBytes: 10_000 },
        });
        expect(() => reopened?.working.set('third', 3)).not.toThrow();
        expect(reopened.working.keys().sort()).toEqual(['first', 'second', 'third']);
      } finally {
        reopened?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('prunes oldest persisted rows on startup when maxEntries is reduced', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-reduced-limit-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        seeded = new SqliteBrain(dbPath, { maxEntries: 3 });
        seeded.working.set('oldest', { value: 1 });
        seeded.working.set('middle', { value: 2 });
        seeded.working.set('newest', { value: 3 });
        seeded.flush();
        seeded.close();
        seeded = undefined;

        db = new Database(dbPath);
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-01T00:00:00.000Z', 'oldest');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-02T00:00:00.000Z', 'middle');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-03T00:00:00.000Z', 'newest');
        db.close();
        db = undefined;

        expect(() => {
          reopened = new SqliteBrain(dbPath, { maxEntries: 2 });
        }).not.toThrow();
        expect(reopened?.working.keys().sort()).toEqual(['middle', 'newest']);
        expect(reopened?.working.get('oldest')).toBeUndefined();

        db = new Database(dbPath);
        expect(
          db.prepare(`SELECT key FROM working_memory ORDER BY key ASC`).all(),
        ).toEqual([{ key: 'middle' }, { key: 'newest' }]);
      } finally {
        db?.close();
        reopened?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not prune protected persisted rows when startup entry limits are reduced', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-protected-limit-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        seeded = new SqliteBrain(dbPath, { maxEntries: 3 });
        seeded.working.set('preference', { memoryClass: 'user_preference', value: 'keep' });
        seeded.working.set('middle', { value: 2 });
        seeded.working.set('newest', { value: 3 });
        seeded.flush();
        seeded.close();
        seeded = undefined;

        db = new Database(dbPath);
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-01T00:00:00.000Z', 'preference');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-02T00:00:00.000Z', 'middle');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-03T00:00:00.000Z', 'newest');
        db.close();
        db = undefined;

        reopened = new SqliteBrain(dbPath, { maxEntries: 2 });
        expect(reopened.working.keys().sort()).toEqual(['newest', 'preference']);
        expect(reopened.working.get('preference')).toEqual({ memoryClass: 'user_preference', value: 'keep' });
      } finally {
        db?.close();
        reopened?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('leaves persisted rows intact when retained startup rows exceed byte limits', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-byte-limit-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        seeded = new SqliteBrain(dbPath, { maxEntries: 2, maxTotalBytes: 10_000 });
        seeded.working.set('drop', 'x');
        seeded.working.set('keep', 'retained value is still too large');
        seeded.flush();
        seeded.close();
        seeded = undefined;

        expect(() => new SqliteBrain(dbPath, { maxEntries: 1, maxTotalBytes: 10 })).toThrow(
          WorkingMemoryLimitError,
        );

        db = new Database(dbPath);
        expect(
          db.prepare(`SELECT key FROM working_memory ORDER BY key ASC`).all(),
        ).toEqual([{ key: 'drop' }, { key: 'keep' }]);
      } finally {
        db?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('expires pruned keys from other live brain instances sharing the database', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-live-prune-'));
      const dbPath = join(dir, 'brain.db');
      let live: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        live = new SqliteBrain(dbPath, { maxEntries: 3 });
        live.working.set('oldest', { value: 1 });
        live.working.set('middle', { value: 2 });
        live.working.set('newest', { value: 3 });
        live.flush();

        db = new Database(dbPath);
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-01T00:00:00.000Z', 'oldest');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-02T00:00:00.000Z', 'middle');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-03T00:00:00.000Z', 'newest');
        db.close();
        db = undefined;

        reopened = new SqliteBrain(dbPath, { maxEntries: 2 });
        expect(live.working.get('oldest')).toBeUndefined();
        live.flush();

        db = new Database(dbPath);
        expect(
          db.prepare(`SELECT key FROM working_memory ORDER BY key ASC`).all(),
        ).toEqual([{ key: 'middle' }, { key: 'newest' }]);
      } finally {
        db?.close();
        reopened?.close();
        live?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('preserves dirty live updates when another startup prunes the persisted row', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-dirty-prune-'));
      const dbPath = join(dir, 'brain.db');
      let live: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        live = new SqliteBrain(dbPath, { maxEntries: 3 });
        live.working.set('oldest', { value: 1 });
        live.working.set('middle', { value: 2 });
        live.working.set('newest', { value: 3 });
        live.flush();
        live.working.set('oldest', { value: 'dirty' });

        db = new Database(dbPath);
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-01T00:00:00.000Z', 'oldest');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-02T00:00:00.000Z', 'middle');
        db.prepare(`UPDATE working_memory SET updated_at = ? WHERE key = ?`).run('2026-07-03T00:00:00.000Z', 'newest');
        db.close();
        db = undefined;

        reopened = new SqliteBrain(dbPath, { maxEntries: 2 });
        expect(live.working.get('oldest')).toEqual({ value: 'dirty' });
        live.flush();

        db = new Database(dbPath);
        expect(
          db.prepare(`SELECT key FROM working_memory ORDER BY key ASC`).all(),
        ).toEqual([{ key: 'middle' }, { key: 'newest' }, { key: 'oldest' }]);
      } finally {
        db?.close();
        reopened?.close();
        live?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('prunes legacy plain-text persisted rows when startup entry limits are reduced', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-legacy-prune-'));
      const dbPath = join(dir, 'brain.db');
      let seeded: SqliteBrain | undefined;
      let reopened: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        seeded = new SqliteBrain(dbPath, { maxEntries: 3 });
        seeded.close();
        seeded = undefined;

        db = new Database(dbPath);
        db.prepare(`INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)`).run(
          'legacy',
          'plain text value',
          '2026-07-01T00:00:00.000Z',
        );
        db.prepare(`INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)`).run(
          'middle',
          JSON.stringify({ value: 2 }),
          '2026-07-02T00:00:00.000Z',
        );
        db.prepare(`INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)`).run(
          'newest',
          JSON.stringify({ value: 3 }),
          '2026-07-03T00:00:00.000Z',
        );
        db.close();
        db = undefined;

        reopened = new SqliteBrain(dbPath, { maxEntries: 2 });
        expect(reopened.working.keys().sort()).toEqual(['middle', 'newest']);
      } finally {
        db?.close();
        reopened?.close();
        seeded?.close();
        rmSync(dir, { recursive: true, force: true });
      }
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

    it('constructor hydration prunes persisted rows to honor stricter custom entry limits', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-'));
      const dbPath = join(dir, 'brain.db');
      let reopened: SqliteBrain | undefined;

      try {
        const roomy = new SqliteBrain(dbPath, { maxEntries: 3 });
        roomy.working.set('a', 1);
        roomy.working.set('b', 2);
        roomy.flush();
        roomy.close();

        reopened = new SqliteBrain(dbPath, { maxEntries: 1 });
        expect(reopened.working.keys()).toHaveLength(1);
        expect(reopened.working.usage().limits.maxEntries).toBe(1);
      } finally {
        reopened?.close();
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
      expect(brain.memoryReview.listProvenance({ key: 'env.repo.default-branch' })).toMatchObject([
        {
          candidateId: candidate.id,
          targetStore: 'working',
          key: 'env.repo.default-branch',
          value: 'main',
          source: 'repo-config',
          confidence: 0.8,
        },
      ]);
    });

    it('exposes compact provenance and confidence metadata on the agent read path', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        source: 'chat:turn-42',
        sourceType: 'user',
        sourceId: 'msg-42',
        evidenceId: 'transcript-42',
        confidence: 0.92,
        reason: 'User explicitly requested concise responses.',
        revalidateAt: '2026-08-01T00:00:00.000Z',
      });
      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

      const [entry] = brain.memoryReview.listForAgent({
        key: 'user.preference.response-style',
        now: '2026-07-16T00:00:00.000Z',
      });

      expect(entry).toMatchObject({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        metadata: expect.objectContaining({
          sourceType: 'user',
          source: 'chat:turn-42',
          sourceId: 'msg-42',
          evidenceId: 'transcript-42',
          confidence: 0.92,
          expired: false,
          needsRevalidation: false,
        }),
      });
      expect(entry?.compact).toContain('user.preference.response-style="concise"');
      expect(entry?.compact).toContain('source=user:"msg-42"');
      expect(entry?.compact).toContain('confidence=');
      expect(entry?.compact).toContain('revalidate=2026-08-01T00:00:00.000Z');
    });

    it('hides expired inferred memories from compact agent reads by default', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.location.city',
        value: 'Paris',
        source: 'inferred:session-7',
        sourceId: 'session-7',
        confidence: 0.6,
        reason: 'User mentioned a Paris train connection; this is inferred.',
        expiresAt: '2026-07-15T00:00:00.000Z',
      });
      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

      expect(
        brain.memoryReview.listForAgent({
          key: 'user.location.city',
          now: '2026-07-16T00:00:00.000Z',
        }),
      ).toEqual([]);

      expect(
        brain.memoryReview.listForAgent({
          key: 'user.location.city',
          now: '2026-07-16T00:00:00.000Z',
          includeExpired: true,
        }),
      ).toEqual([
        expect.objectContaining({
          metadata: expect.objectContaining({
            sourceType: 'inferred',
            sourceId: 'session-7',
            expired: true,
          }),
        }),
      ]);
      expect(brain.memoryReview.listProvenance({ key: 'user.location.city' })).toEqual([
        expect.objectContaining({
          key: 'user.location.city',
          expiresAt: '2026-07-15T00:00:00.000Z',
        }),
      ]);
    });

    it('filters memory provenance by source and validates invalid viewer filters', () => {
      const repoCandidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'main',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Observed from GitHub repository metadata; not from a chat transcript.',
      });
      const chatCandidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        source: 'chat:turn-42',
        confidence: 0.92,
        reason: 'User explicitly requested concise responses.',
      });
      brain.memoryReview.approve(repoCandidate.id, { reviewer: 'operator' });
      brain.memoryReview.approve(chatCandidate.id, { reviewer: 'operator' });

      expect(brain.memoryReview.listProvenance({ source: 'CHAT', limit: 10 })).toMatchObject([
        {
          candidateId: chatCandidate.id,
          key: 'user.preference.response-style',
          source: 'chat:turn-42',
        },
      ]);
      expect(brain.memoryReview.listProvenance({ keys: [] })).toEqual([]);
      expect(brain.memoryReview.listProvenance({ key: 'missing.memory' })).toEqual([]);
      expect(() => brain.memoryReview.listProvenance({ key: '   ' })).toThrow(
        /key filter must not be empty/,
      );
      expect(() => brain.memoryReview.listProvenance({ limit: 0 })).toThrow(
        /limit must be a positive integer/,
      );
    });

    it('hides stale provenance after direct working-memory overwrite or deletion', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        source: 'chat:turn-42',
        confidence: 0.92,
        reason: 'User explicitly requested concise responses.',
      });
      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });
      expect(brain.memoryReview.listProvenance({ key: candidate.key })).toHaveLength(1);

      brain.working.set(candidate.key, 'verbose');
      brain.serialize();

      expect(brain.memoryReview.provenanceFor('working', candidate.key)).toBeNull();
      expect(brain.memoryReview.listProvenance({ key: candidate.key })).toEqual([]);

      const second = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'main',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Observed from GitHub repository metadata.',
      });
      brain.memoryReview.approve(second.id, { reviewer: 'operator' });
      expect(brain.memoryReview.listProvenance({ key: second.key })).toHaveLength(1);

      brain.working.delete(second.key);
      brain.serialize();

      expect(brain.memoryReview.provenanceFor('working', second.key)).toBeNull();
      expect(brain.memoryReview.listProvenance({ key: second.key })).toEqual([]);

      brain.working.set(second.key, 'main');
      brain.serialize();

      expect(brain.working.get(second.key)).toBe('main');
      expect(brain.memoryReview.provenanceFor('working', second.key)).toBeNull();
      expect(brain.memoryReview.listProvenance({ key: second.key })).toEqual([]);
    });

    it('preserves provenance when direct working-memory set repeats the approved value', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-style',
        value: 'concise',
        source: 'chat:turn-42',
        confidence: 0.92,
        reason: 'User explicitly requested concise responses.',
      });
      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });
      expect(brain.memoryReview.listProvenance({ key: candidate.key })).toHaveLength(1);

      brain.working.set(candidate.key, 'concise');
      brain.serialize();

      expect(brain.memoryReview.provenanceFor('working', candidate.key)).toMatchObject({
        candidateId: candidate.id,
        key: candidate.key,
        value: 'concise',
      });
      expect(brain.memoryReview.listProvenance({ key: candidate.key })).toHaveLength(1);
    });

    it('surfaces contradictory working-memory candidates before approval', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.location.city',
        value: 'Paris',
        source: 'chat:turn-1',
        confidence: 0.9,
        reason: 'User stated they live in Paris.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });

      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.location.city',
        value: 'Berlin',
        source: 'chat:turn-2',
        confidence: 0.92,
        reason: 'User stated they live in Berlin.',
      });

      expect(brain.memoryReview.conflictsFor(contradictory.id)).toEqual([
        expect.objectContaining({
          targetStore: 'working',
          key: 'user.location.city',
          conflictType: 'value_mismatch',
          proposedCandidateId: contradictory.id,
          existingValue: 'Paris',
          proposedValue: 'Berlin',
          existingProvenance: expect.objectContaining({
            candidateId: initial.id,
            source: 'chat:turn-1',
          }),
          guidance: expect.stringContaining('keep_existing, replace_existing, keep_both_scoped, reject_candidate, or expire_existing'),
        }),
      ]);
    });

    it('blocks normal approval of contradictory candidates until conflict is resolved', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.review-gate',
        value: 'concise',
        source: 'chat:turn-3a',
        confidence: 0.9,
        reason: 'User requested concise responses.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.review-gate',
        value: 'verbose',
        source: 'chat:turn-3b',
        confidence: 0.8,
        reason: 'Later contradictory response style inference.',
      });

      expect(() =>
        brain.memoryReview.approve(contradictory.id, { reviewer: 'operator' }),
      ).toThrow(/conflicts with an existing value/);
      expect(brain.memoryReview.list('pending')).toEqual([
        expect.objectContaining({ id: contradictory.id }),
      ]);
      expect(brain.working.get('user.preference.review-gate')).toBe('concise');
    });

    it('omits stale provenance when runtime memory changed outside the review queue', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.pet',
        value: 'cat',
        source: 'chat:turn-3c',
        confidence: 0.9,
        reason: 'User stated a pet preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      brain.working.set('user.preference.pet', 'fish');
      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.pet',
        value: 'dog',
        source: 'chat:turn-3d',
        confidence: 0.8,
        reason: 'Later contradictory pet preference.',
      });

      expect(brain.memoryReview.conflictsFor(contradictory.id)).toEqual([
        expect.objectContaining({
          existingValue: 'fish',
          proposedValue: 'dog',
        }),
      ]);
      expect(
        brain.memoryReview.conflictsFor(contradictory.id)[0]?.existingProvenance,
      ).toBeUndefined();
    });

    it('does not resurrect pending-deleted working memory during conflict checks', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.removed-fact',
        value: 'old',
        source: 'chat:turn-3e',
        confidence: 0.9,
        reason: 'User stated an old preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      expect(brain.working.delete('user.preference.removed-fact')).toBe(true);
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.removed-fact',
        value: 'new',
        source: 'chat:turn-3f',
        confidence: 0.8,
        reason: 'Fresh preference after deletion.',
      });

      expect(brain.memoryReview.conflictsFor(candidate.id)).toEqual([]);
      expect(brain.memoryReview.approve(candidate.id).status).toBe('approved');
      expect(brain.working.get('user.preference.removed-fact')).toBe('new');
    });

    it('resolves memory conflicts by keeping the existing fact', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor',
        value: 'vim',
        source: 'chat:turn-3',
        confidence: 0.9,
        reason: 'User stated their editor preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor',
        value: 'emacs',
        source: 'chat:turn-4',
        confidence: 0.8,
        reason: 'Later ambiguous editor mention.',
      });

      const resolved = brain.memoryReview.resolveConflict(contradictory.id, {
        resolution: 'keep_existing',
        reviewer: 'operator',
      });

      expect(resolved.status).toBe('rejected');
      expect(resolved.note).toBe('Memory conflict resolved by keeping the existing value.');
      expect(brain.working.get('user.preference.editor')).toBe('vim');
      expect(brain.memoryReview.conflictsFor(contradictory.id)).toEqual([]);
    });

    it('returns a resolution prompt with old entry, new candidate, evidence, and actions', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-depth',
        value: 'brief',
        source: 'chat:turn-20',
        evidenceId: 'msg-20',
        confidence: 0.9,
        reason: 'User asked for terse answers.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.response-depth',
        value: 'detailed',
        source: 'chat:turn-21',
        evidenceId: 'msg-21',
        confidence: 0.95,
        reason: 'User later asked for detailed explanations.',
      });

      expect(brain.memoryReview.resolutionPromptFor(contradictory.id)).toEqual(
        expect.objectContaining({
          candidateId: contradictory.id,
          targetStore: 'working',
          key: 'user.preference.response-depth',
          oldEntry: expect.objectContaining({
            value: 'brief',
            source: 'chat:turn-20',
            evidenceId: 'msg-20',
          }),
          newCandidate: expect.objectContaining({
            value: 'detailed',
            source: 'chat:turn-21',
            evidenceId: 'msg-21',
          }),
          sourceEvidence: {
            old: { source: 'chat:turn-20', evidenceId: 'msg-20' },
            new: { source: 'chat:turn-21', evidenceId: 'msg-21' },
          },
          recommendedAction: 'replace_existing',
          availableActions: [
            'keep_existing',
            'replace_existing',
            'keep_both_scoped',
            'reject_candidate',
            'expire_existing',
          ],
        }),
      );
    });

    it('resolves memory conflicts by replacing the existing fact', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'master',
        source: 'legacy-config',
        confidence: 0.7,
        reason: 'Old repository metadata.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const corrected = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'main',
        source: 'repo-config',
        confidence: 0.95,
        reason: 'Current GitHub repository metadata.',
      });

      const resolved = brain.memoryReview.resolveConflict(corrected.id, {
        resolution: 'replace_existing',
        reviewer: 'operator',
      });

      expect(resolved.status).toBe('approved');
      expect(resolved.note).toBe('Memory conflict resolved by replacing the existing value.');
      expect(brain.working.get('env.repo.default-branch')).toBe('main');
      expect(
        brain.memoryReview.provenanceFor('working', 'env.repo.default-branch'),
      ).toMatchObject({
        candidateId: corrected.id,
        value: 'main',
        source: 'repo-config',
      });
    });

    it('resolves memory conflicts by keeping both facts under an explicit scoped key', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme',
        value: 'dark',
        source: 'chat:turn-30',
        confidence: 0.9,
        reason: 'Default UI preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const scoped = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme',
        value: 'light',
        source: 'chat:turn-31',
        evidenceId: 'msg-31',
        confidence: 0.8,
        reason: 'User requested light theme in presentations.',
      });

      const resolved = brain.memoryReview.resolveConflict(scoped.id, {
        resolution: 'keep_both_scoped',
        scopedKey: 'user.preference.theme.scope.presentations',
        reviewer: 'operator',
      });

      expect(resolved).toMatchObject({
        status: 'approved',
        key: 'user.preference.theme.scope.presentations',
        note: 'Memory conflict resolved by keeping both values with explicit scope.',
      });
      expect(brain.working.get('user.preference.theme')).toBe('dark');
      expect(brain.working.get('user.preference.theme.scope.presentations')).toBe('light');
      expect(brain.memoryReview.conflictsFor(scoped.id)).toEqual([]);
    });

    it('resolves memory conflicts by expiring the old fact before approving the candidate', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.location.city',
        value: 'Paris',
        source: 'chat:turn-40',
        confidence: 0.9,
        reason: 'User previously lived in Paris.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const moved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.location.city',
        value: 'Berlin',
        source: 'chat:turn-41',
        confidence: 0.95,
        reason: 'User said they moved to Berlin.',
      });

      const resolved = brain.memoryReview.resolveConflict(moved.id, {
        resolution: 'expire_existing',
        reviewer: 'operator',
      });

      expect(resolved.status).toBe('approved');
      expect(resolved.note).toBe('Memory conflict resolved by expiring the old value before approving the candidate.');
      expect(brain.working.get('user.location.city')).toBe('Berlin');
      expect(brain.memoryReview.provenanceFor('working', 'user.location.city')).toMatchObject({
        candidateId: moved.id,
        value: 'Berlin',
      });
    });

    it('does not mutate a pending candidate when keep-both scoped resolution still conflicts', () => {
      const base = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme',
        value: 'dark',
        source: 'chat:turn-60',
        confidence: 0.9,
        reason: 'Default UI preference.',
      });
      brain.memoryReview.approve(base.id, { reviewer: 'operator' });
      const existingScoped = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme.scope.presentations',
        value: 'blue',
        source: 'chat:turn-61',
        confidence: 0.8,
        reason: 'Existing presentation preference.',
      });
      brain.memoryReview.approve(existingScoped.id, { reviewer: 'operator' });
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme',
        value: 'light',
        source: 'chat:turn-62',
        confidence: 0.85,
        reason: 'Conflicting presentation preference.',
      });

      expect(() =>
        brain.memoryReview.resolveConflict(candidate.id, {
          resolution: 'keep_both_scoped',
          scopedKey: 'user.preference.theme.scope.presentations',
          reviewer: 'operator',
        }),
      ).toThrow(/still conflicts/);

      expect(brain.memoryReview.list().find((item) => item.id === candidate.id)).toMatchObject({
        key: 'user.preference.theme',
        status: 'pending',
      });
      expect(brain.memoryReview.conflictsFor(candidate.id)).toHaveLength(1);
    });

    it('does not mutate a pending candidate when keep-both scoped approval validation fails', () => {
      const limited = new SqliteBrain(':memory:', {
        maxEntries: 10,
        maxValueBytes: 32,
        maxTotalBytes: 128,
      });
      try {
        const base = limited.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.theme',
          value: 'dark',
          source: 'chat:turn-63',
          confidence: 0.9,
          reason: 'Default UI preference.',
        });
        limited.memoryReview.approve(base.id, { reviewer: 'operator' });
        const candidate = limited.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.theme',
          value: 'light '.repeat(20),
          source: 'chat:turn-64',
          confidence: 0.85,
          reason: 'Oversized scoped presentation preference.',
        });

        expect(() =>
          limited.memoryReview.resolveConflict(candidate.id, {
            resolution: 'keep_both_scoped',
            scopedKey: 'user.preference.theme.scope.presentations',
            reviewer: 'operator',
          }),
        ).toThrow(WorkingMemoryLimitError);

        expect(limited.memoryReview.list().find((item) => item.id === candidate.id)).toMatchObject({
          key: 'user.preference.theme',
          status: 'pending',
        });
        expect(limited.working.get('user.preference.theme.scope.presentations')).toBeUndefined();
        expect(limited.memoryReview.conflictsFor(candidate.id)).toHaveLength(1);
      } finally {
        limited.close();
      }
    });

    it('does not expire the old fact when expire-existing replacement validation fails', () => {
      const limited = new SqliteBrain(':memory:', {
        maxEntries: 10,
        maxValueBytes: 32,
        maxTotalBytes: 128,
      });
      try {
        const initial = limited.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.detail',
          value: 'brief',
          source: 'chat:turn-70',
          confidence: 0.9,
          reason: 'Initial response preference.',
        });
        limited.memoryReview.approve(initial.id, { reviewer: 'operator' });
        const oversized = limited.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.detail',
          value: 'detailed '.repeat(20),
          source: 'chat:turn-71',
          confidence: 0.95,
          reason: 'Oversized replacement preference.',
        });

        expect(() =>
          limited.memoryReview.resolveConflict(oversized.id, {
            resolution: 'expire_existing',
            reviewer: 'operator',
          }),
        ).toThrow(WorkingMemoryLimitError);

        expect(limited.working.get('user.preference.detail')).toBe('brief');
        expect(limited.memoryReview.provenanceFor('working', 'user.preference.detail')).toMatchObject({
          candidateId: initial.id,
          value: 'brief',
        });
      } finally {
        limited.close();
      }
    });

    it('suppresses expire-existing replacements that match rejected candidates', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor',
        value: 'vim',
        source: 'chat:turn-80',
        confidence: 0.9,
        reason: 'Initial editor preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const rejected = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor',
        value: 'emacs',
        source: 'chat:turn-81',
        evidenceId: 'msg-81',
        confidence: 0.8,
        reason: 'Ambiguous editor mention.',
      });
      brain.memoryReview.reject(rejected.id, { reviewer: 'operator' });

      const duplicate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor',
        value: 'emacs',
        source: 'chat:turn-82',
        evidenceId: 'msg-82',
        confidence: 0.7,
        reason: 'Different ambiguous editor mention.',
      });
      brain.memoryReview.edit(duplicate.id, {
        source: 'chat:turn-81',
        evidenceId: 'msg-81',
        confidence: 0.8,
        reason: 'Ambiguous editor mention.',
      });

      const resolved = brain.memoryReview.resolveConflict(duplicate.id, {
        resolution: 'expire_existing',
        reviewer: 'operator',
      });

      expect(resolved.status).toBe('suppressed');
      expect(brain.working.get('user.preference.editor')).toBe('vim');
    });

    it('does not flag similar memory candidates scoped to a different key', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme',
        value: 'dark',
        source: 'chat:turn-50',
        confidence: 0.9,
        reason: 'Default UI preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const scoped = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.theme.scope.presentations',
        value: 'light',
        source: 'chat:turn-51',
        confidence: 0.8,
        reason: 'Presentation-specific preference.',
      });

      expect(brain.memoryReview.conflictsFor(scoped.id)).toEqual([]);
      expect(brain.memoryReview.approve(scoped.id).status).toBe('approved');
      expect(brain.working.get('user.preference.theme')).toBe('dark');
      expect(brain.working.get('user.preference.theme.scope.presentations')).toBe('light');
    });

    it('rejects conflict resolution when there is no contradictory current fact', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.shell',
        value: 'zsh',
        source: 'chat:turn-5',
        confidence: 0.8,
        reason: 'User stated shell preference.',
      });

      expect(() =>
        brain.memoryReview.resolveConflict(candidate.id, {
          resolution: 'keep_existing',
          reviewer: 'operator',
        }),
      ).toThrow(/no unresolved conflict/);
    });

    it('revalidates keep-existing conflict decisions before rejecting the candidate', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.changed-before-keep',
        value: 'vim',
        source: 'chat:turn-5a',
        confidence: 0.9,
        reason: 'Original editor preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.changed-before-keep',
        value: 'emacs',
        source: 'chat:turn-5b',
        confidence: 0.8,
        reason: 'Later editor preference.',
      });
      const conflicts = brain.memoryReview.conflictsFor(contradictory.id);
      expect(conflicts).toHaveLength(1);
      brain.working.set('user.preference.changed-before-keep', 'helix');

      const review = brain.memoryReview as unknown as {
        rejectCandidate(
          id: string,
          options: { reviewer: string },
          guard: { expectedExistingValue: unknown; expectedCandidateValue: unknown },
        ): unknown;
      };
      expect(() =>
        review.rejectCandidate(
          contradictory.id,
          { reviewer: 'operator' },
          {
            expectedExistingValue: conflicts[0]?.existingValue,
            expectedCandidateValue: contradictory.value,
          },
        ),
      ).toThrow(/conflict changed before resolution/);
      expect(brain.memoryReview.list('pending')).toEqual([
        expect.objectContaining({ id: contradictory.id }),
      ]);
    });

    it('pins the proposed value when approving a replacement conflict', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.changed-before-replace',
        value: 'master',
        source: 'legacy-config',
        confidence: 0.7,
        reason: 'Old repository metadata.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const corrected = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.changed-before-replace',
        value: 'main',
        source: 'repo-config',
        confidence: 0.95,
        reason: 'Current GitHub repository metadata.',
      });
      const conflicts = brain.memoryReview.conflictsFor(corrected.id);
      expect(conflicts).toHaveLength(1);
      brain.memoryReview.edit(corrected.id, { value: 'trunk' });

      const review = brain.memoryReview as unknown as {
        approveCandidate(
          id: string,
          options: { reviewer: string },
          guard: { expectedExistingValue: unknown; expectedCandidateValue: unknown },
        ): unknown;
      };
      expect(() =>
        review.approveCandidate(
          corrected.id,
          { reviewer: 'operator' },
          {
            expectedExistingValue: conflicts[0]?.existingValue,
            expectedCandidateValue: corrected.value,
          },
        ),
      ).toThrow(/proposed value changed before approval/);
      expect(brain.working.get('env.repo.changed-before-replace')).toBe('master');
      expect(brain.memoryReview.list('pending')).toEqual([
        expect.objectContaining({ id: corrected.id, value: 'trunk' }),
      ]);
    });

    it('detects conflicts against persisted facts when runtime hydration is disabled', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-conflict-persisted-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const writer = new SqliteBrain(dbPath);
        const approved = writer.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.theme',
          value: 'dark',
          source: 'chat:turn-6',
          confidence: 0.9,
          reason: 'User requested dark theme.',
        });
        writer.memoryReview.approve(approved.id, { reviewer: 'operator' });
        writer.close();

        const reviewer = new SqliteBrain(dbPath, undefined, {
          hydrateWorkingMemoryFromDb: false,
        });
        const contradictory = reviewer.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.theme',
          value: 'light',
          source: 'chat:turn-7',
          confidence: 0.8,
          reason: 'Ambiguous later theme mention.',
        });

        expect(reviewer.working.has('user.preference.theme')).toBe(false);
        expect(reviewer.memoryReview.conflictsFor(contradictory.id)).toEqual([
          expect.objectContaining({
            key: 'user.preference.theme',
            existingValue: 'dark',
            proposedValue: 'light',
            existingProvenance: expect.objectContaining({
              candidateId: approved.id,
            }),
          }),
        ]);
        reviewer.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('refreshes persisted working memory before conflict approval checks', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-conflict-refresh-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const staleReviewer = new SqliteBrain(dbPath, undefined, {
          hydrateWorkingMemoryFromDb: false,
        });
        const writer = new SqliteBrain(dbPath);
        const approved = writer.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.concurrent-theme',
          value: 'dark',
          source: 'chat:turn-7a',
          confidence: 0.9,
          reason: 'Concurrent reviewer approved theme.',
        });
        writer.memoryReview.approve(approved.id, { reviewer: 'operator' });
        writer.close();

        const contradictory = staleReviewer.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.concurrent-theme',
          value: 'light',
          source: 'chat:turn-7b',
          confidence: 0.8,
          reason: 'Stale reviewer inferred a conflicting theme.',
        });

        expect(staleReviewer.memoryReview.conflictsFor(contradictory.id)).toEqual([
          expect.objectContaining({
            existingValue: 'dark',
            proposedValue: 'light',
          }),
        ]);
        expect(() =>
          staleReviewer.memoryReview.approve(contradictory.id),
        ).toThrow(/conflicts with an existing value/);
        staleReviewer.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('aligns hydrated clean runtime cache with refreshed persisted conflicts before flush', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-conflict-stale-cache-'));
      const dbPath = join(dir, 'brain.db');

      try {
        const seed = new SqliteBrain(dbPath);
        seed.working.set('user.preference.concurrent-color', 'red');
        seed.flush();
        seed.close();

        const staleReviewer = new SqliteBrain(dbPath);
        expect(staleReviewer.working.get('user.preference.concurrent-color')).toBe('red');

        const writer = new SqliteBrain(dbPath);
        writer.working.set('user.preference.concurrent-color', 'green');
        writer.flush();
        writer.close();

        const contradictory = staleReviewer.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.concurrent-color',
          value: 'blue',
          source: 'chat:turn-7bb',
          confidence: 0.8,
          reason: 'Stale reviewer inferred a conflicting color.',
        });

        expect(staleReviewer.memoryReview.conflictsFor(contradictory.id)).toEqual([
          expect.objectContaining({
            existingValue: 'green',
            proposedValue: 'blue',
          }),
        ]);
        expect(staleReviewer.working.get('user.preference.concurrent-color')).toBe('green');
        staleReviewer.flush();
        staleReviewer.close();

        const verifier = new SqliteBrain(dbPath);
        expect(verifier.working.get('user.preference.concurrent-color')).toBe('green');
        verifier.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('ignores expired persisted working memory during conflict approval checks', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-conflict-expired-persisted-'));
      const dbPath = join(dir, 'brain.db');

      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'));
        const writer = new SqliteBrain(dbPath);
        writer.working.set('user.preference.session-mode', {
          value: 'focus',
          category: 'temporary-operational',
          expiresAt: '2099-01-01T00:00:01.000Z',
        });
        writer.flush();
        writer.close();

        vi.setSystemTime(new Date('2099-01-01T00:00:02.000Z'));
        const reviewer = new SqliteBrain(dbPath, undefined, {
          hydrateWorkingMemoryFromDb: false,
        });
        const fresh = reviewer.memoryReview.propose({
          targetStore: 'working',
          key: 'user.preference.session-mode',
          value: 'normal',
          source: 'chat:turn-7c',
          confidence: 0.8,
          reason: 'Fresh preference after temporary fact expired.',
        });

        expect(reviewer.working.has('user.preference.session-mode')).toBe(false);
        expect(reviewer.memoryReview.conflictsFor(fresh.id)).toEqual([]);
        expect(() => reviewer.memoryReview.approve(fresh.id, { reviewer: 'operator' })).not.toThrow();
        expect(reviewer.working.get('user.preference.session-mode')).toBe('normal');
        reviewer.close();
      } finally {
        vi.useRealTimers();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails fast for invalid conflict resolution strings', () => {
      const initial = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.tabs',
        value: 'spaces',
        source: 'chat:turn-8',
        confidence: 0.9,
        reason: 'User stated indentation preference.',
      });
      brain.memoryReview.approve(initial.id, { reviewer: 'operator' });
      const contradictory = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.tabs',
        value: 'tabs',
        source: 'chat:turn-9',
        confidence: 0.8,
        reason: 'Later conflicting indentation mention.',
      });

      expect(() =>
        brain.memoryReview.resolveConflict(contradictory.id, {
          resolution: 'replace-existing',
          reviewer: 'operator',
        } as never),
      ).toThrow(/Unsupported memory conflict resolution/);
      expect(brain.memoryReview.list('pending')).toEqual([
        expect.objectContaining({ id: contradictory.id }),
      ]);
    });

    it('returns no conflicts for suppressed duplicate proposal handles', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.duplicate-conflict',
        value: 'maybe',
        source: 'chat:turn-10',
        evidenceId: 'msg-10',
        confidence: 0.4,
        reason: 'Weak inferred preference.',
      });
      brain.memoryReview.reject(candidate.id, { reviewer: 'operator' });

      const suppressed = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.duplicate-conflict',
        value: 'maybe',
        source: 'chat:turn-10',
        evidenceId: 'msg-10',
        confidence: 0.4,
        reason: 'Weak inferred preference.',
      });

      expect(suppressed.status).toBe('suppressed');
      expect(brain.memoryReview.conflictsFor(suppressed.id)).toEqual([]);
    });


    it('prunes expired temporary facts before approved working-memory writes enforce limits', () => {
      const limitedBrain = new SqliteBrain(':memory:', { maxEntries: 1 });
      limitedBrain.working.set('op:expired', {
        value: 'stale runtime entry',
        category: 'temporary-operational',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      const candidate = limitedBrain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.repo.default-branch',
        value: 'main',
        source: 'repo-config',
        confidence: 0.8,
        reason: 'Observed from GitHub repository metadata.',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2099-01-01T00:00:01.000Z'));
      try {
        expect(() => limitedBrain.memoryReview.approve(candidate.id, { reviewer: 'operator' })).not.toThrow();
        expect(limitedBrain.working.keys()).toEqual(['env.repo.default-branch']);
      } finally {
        limitedBrain.close();
        vi.useRealTimers();
      }
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

    it('redacts quarantined secret values on reject and suppressed duplicates', () => {
      const secret = 'fake-secret-for-redaction-test';
      const proposal = {
        targetStore: 'working' as const,
        key: 'OPENAI_API_KEY',
        value: secret,
        source: 'fbeast_memory_store:quarantine',
        evidenceId: 'quarantine:OPENAI_API_KEY',
        confidence: 1,
        reason: 'Sensitive memory quarantined for operator review (value-shape-indicates-secret).',
      };
      const candidate = brain.memoryReview.propose(proposal);

      const rejected = brain.memoryReview.reject(candidate.id, {
        reviewer: 'operator',
        note: 'Discard leaked secret.',
      });

      expect(rejected).toMatchObject({
        status: 'rejected',
        value: '[never-store-redacted]',
        source: '[never-store-redacted]',
        reason: '[never-store-redacted]',
      });
      expect(rejected.evidenceId).toBeUndefined();
      expect(brain.memoryReview.list('rejected')).toEqual([
        expect.objectContaining({
          id: candidate.id,
          value: '[never-store-redacted]',
          source: '[never-store-redacted]',
        }),
      ]);
      const suppressed = brain.memoryReview.propose(proposal);
      expect(suppressed).toMatchObject({
        status: 'suppressed',
        suppressionReason: 'rejected',
        value: '[never-store-redacted]',
        source: '[never-store-redacted]',
        reason: '[never-store-redacted]',
      });
      expect(suppressed.evidenceId).toBeUndefined();

      const db = (brain as unknown as { db: Database.Database }).db;
      const persisted = [
        ...db.prepare(`SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_candidates`).all(),
        ...db.prepare(`SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_suppressions`).all(),
      ];
      expect(JSON.stringify(persisted)).not.toContain(secret);
      for (const row of persisted as Array<{ value: string; source: string; evidence_id: string | null; reason: string; reviewer: string | null; note: string | null }>) {
        expect(row.value).toBe(JSON.stringify('[never-store-redacted]'));
        expect(row.source).toBe('[never-store-redacted]');
        expect(row.evidence_id).toBeNull();
        expect(row.reason).toBe('[never-store-redacted]');
        expect(row.reviewer).toBeNull();
        expect(row.note).toBeNull();
      }
    });

    it('enables SQLite secure deletion before redacting rejected quarantined secrets', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-reject-redact-secure-delete-'));
      const dbPath = join(dir, 'brain.db');
      const secret = 'fake-secret-for-secure-delete-test';
      const fileBrain = new SqliteBrain(dbPath);

      try {
        const candidate = fileBrain.memoryReview.propose({
          targetStore: 'working',
          key: 'OPENAI_API_KEY',
          value: secret,
          source: 'fbeast_memory_store:quarantine',
          evidenceId: 'quarantine:OPENAI_API_KEY',
          confidence: 1,
          reason: 'Sensitive memory quarantined for operator review (value-shape-indicates-secret).',
        });

        fileBrain.memoryReview.reject(candidate.id, { reviewer: 'operator' });

        const db = (fileBrain as unknown as { db: Database.Database }).db;
        expect(db.pragma('secure_delete', { simple: true })).toBe(1);
        const persisted = [
          ...db.prepare(`SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_candidates`).all(),
          ...db.prepare(`SELECT value, source, evidence_id, reason, reviewer, note FROM memory_review_suppressions`).all(),
        ];
        expect(JSON.stringify(persisted)).not.toContain(secret);
      } finally {
        fileBrain.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('purges rejected quarantined secrets from file-backed SQLite pages and WAL', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-reject-purge-pages-'));
      const dbPath = join(dir, 'brain.db');
      const secret = 'fake-secret-for-rejected-page-purge-test';
      const fileBrain = new SqliteBrain(dbPath);

      try {
        const candidate = fileBrain.memoryReview.propose({
          targetStore: 'working',
          key: 'OPENAI_API_KEY',
          value: secret,
          source: 'fbeast_memory_store:quarantine',
          evidenceId: 'quarantine:OPENAI_API_KEY',
          confidence: 1,
          reason: 'Sensitive memory quarantined for operator review (value-shape-indicates-secret).',
        });

        fileBrain.memoryReview.reject(candidate.id, { reviewer: 'operator' });
        fileBrain.close();

        for (const suffix of ['', '-wal', '-shm']) {
          const path = `${dbPath}${suffix}`;
          if (!existsSync(path)) continue;
          expect(readFileSync(path).toString('utf8')).not.toContain(secret);
        }
      } finally {
        try {
          fileBrain.close();
        } catch {
          // Already closed by the assertion path.
        }
        rmSync(dir, { recursive: true, force: true });
      }
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

    it('adds high-confidence merge suggestions for exact duplicate memory values and preserves provenance', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.reply-style',
        value: 'User prefers concise, respectful replies.',
        source: 'chat:turn-20',
        evidenceId: 'msg-20',
        confidence: 0.92,
        reason: 'User explicitly requested concise respectful communication.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const duplicate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.answer-style',
        value: 'User prefers concise, respectful replies.',
        source: 'chat:turn-21',
        evidenceId: 'msg-21',
        confidence: 0.85,
        reason: 'User repeated the same communication preference.',
      });

      expect(duplicate.status).toBe('pending');
      expect(duplicate.mergeSuggestions).toEqual([
        expect.objectContaining({
          targetStore: 'working',
          key: 'user.preference.reply-style',
          matchType: 'exact',
          confidence: 'high',
          requiresReview: false,
          similarity: 1,
          provenance: [
            expect.objectContaining({
              candidateId: approved.id,
              source: 'chat:turn-20',
              evidenceId: 'msg-20',
              reason: 'User explicitly requested concise respectful communication.',
            }),
          ],
        }),
      ]);
    });

    it('recomputes merge suggestions after editing a pending candidate', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.reply-style',
        value: 'User prefers concise, respectful replies.',
        source: 'chat:turn-30',
        confidence: 0.92,
        reason: 'User explicitly requested concise respectful communication.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.answer-style',
        value: 'User likes detailed explanations.',
        source: 'chat:turn-31',
        confidence: 0.7,
        reason: 'Initial candidate before operator edit.',
      });

      const edited = brain.memoryReview.edit(candidate.id, {
        value: 'User prefers concise, respectful replies.',
        reason: 'Operator edited candidate into a duplicate preference.',
      });

      expect(edited.mergeSuggestions).toEqual([
        expect.objectContaining({
          key: 'user.preference.reply-style',
          matchType: 'exact',
        }),
      ]);
    });

    it('ignores stale provenance before suggesting merge candidates', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.default-branch',
        value: 'main',
        source: 'repo:git-config',
        confidence: 0.9,
        reason: 'Detected default branch.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });
      brain.working.set('env.project.default-branch', 'develop');

      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.release-branch',
        value: 'main',
        source: 'repo:release-config',
        confidence: 0.8,
        reason: 'Detected release branch.',
      });

      expect(candidate.mergeSuggestions).toEqual([]);
    });

    it('requires review for exact matches that lack semantic detail', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.default-branch',
        value: 'main',
        source: 'repo:git-config',
        confidence: 0.9,
        reason: 'Detected default branch.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.release-branch',
        value: 'main',
        source: 'repo:release-config',
        confidence: 0.8,
        reason: 'Detected release branch.',
      });

      expect(candidate.mergeSuggestions).toEqual([
        expect.objectContaining({
          key: 'env.project.default-branch',
          matchType: 'exact',
          confidence: 'low',
          requiresReview: true,
        }),
      ]);
    });

    it('downgrades exact primitive matches to review-required suggestions', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.default-branch',
        value: 'main',
        source: 'repo:git-config',
        confidence: 0.9,
        reason: 'Detected default branch.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const samePrimitive = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.release-branch',
        value: 'main',
        source: 'repo:release-config',
        confidence: 0.9,
        reason: 'Detected release branch.',
      });

      expect(samePrimitive.mergeSuggestions).toEqual([
        expect.objectContaining({
          key: 'env.project.default-branch',
          matchType: 'exact',
          confidence: 'low',
          requiresReview: true,
        }),
      ]);
    });

    it('ignores stale provenance when current working memory changed after approval', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.summary-style',
        value: 'User prefers concise daily summary updates.',
        source: 'chat:turn-22',
        confidence: 0.88,
        reason: 'User asked for concise daily summaries.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });
      brain.working.set('user.preference.summary-style', 'User prefers detailed weekly summary updates.');

      const duplicateOfStaleValue = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.summary-cadence',
        value: 'User prefers concise daily summary updates.',
        source: 'chat:turn-23',
        confidence: 0.8,
        reason: 'A later turn restated an older summary preference.',
      });

      expect(duplicateOfStaleValue.mergeSuggestions).toEqual([]);
    });

    it('adds review-required semantic merge suggestions for paraphrased memory candidates', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.progress-updates',
        value: 'User wants short status updates with only the most relevant details.',
        source: 'chat:turn-24',
        confidence: 0.88,
        reason: 'User asked for terse progress updates.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const paraphrase = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.status-style',
        value: 'Keep progress reports brief and include only relevant details.',
        source: 'chat:turn-25',
        confidence: 0.7,
        reason: 'User repeated a similar status-reporting preference.',
      });

      expect(paraphrase.mergeSuggestions).toEqual([
        expect.objectContaining({
          key: 'user.preference.progress-updates',
          matchType: 'semantic',
          confidence: 'low',
          requiresReview: true,
        }),
      ]);
    });

    it('does not suggest related but distinct memories as duplicates', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.short-status',
        value: 'User prefers short status updates.',
        source: 'chat:turn-24',
        confidence: 0.9,
        reason: 'User asked for concise progress reports.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const distinct = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.short-examples',
        value: 'User prefers short runnable code examples.',
        source: 'chat:turn-25',
        confidence: 0.82,
        reason: 'User asked for compact code samples.',
      });

      expect(distinct.mergeSuggestions).toEqual([]);
    });

    it('avoids semantic false positives for memories that share generic wording only', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.test-runner',
        value: 'Project uses Vitest for package unit tests.',
        source: 'repo:test-config',
        confidence: 0.9,
        reason: 'Detected Vitest config files.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const unrelated = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'env.project.package-manager',
        value: 'Project uses npm workspaces for packages.',
        source: 'repo:package-json',
        confidence: 0.9,
        reason: 'Detected workspaces in package.json.',
      });

      expect(unrelated.mergeSuggestions).toEqual([]);
    });

    it('suggests same-key repeats so approval does not hide existing provenance', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.reply-style',
        value: 'User prefers concise, respectful replies.',
        source: 'chat:turn-40',
        confidence: 0.92,
        reason: 'User explicitly requested concise respectful communication.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const repeat = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.reply-style',
        value: 'User prefers concise, respectful replies.',
        source: 'chat:turn-41',
        confidence: 0.84,
        reason: 'User repeated the same communication preference.',
      });

      expect(repeat.mergeSuggestions).toEqual([
        expect.objectContaining({
          key: 'user.preference.reply-style',
          matchType: 'exact',
          provenance: [expect.objectContaining({ candidateId: approved.id })],
        }),
      ]);
    });

    it('keeps merge suggestions inside decoded agent working-memory scopes', () => {
      const agentAKey = '__fbeast_agent_memory__/agent-a/user.preference.reply-style';
      const agentBKey = '__fbeast_agent_memory__/agent-b/user.preference.reply-style';
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: agentAKey,
        value: 'User prefers concise, respectful replies.',
        source: 'agent-a:chat',
        confidence: 0.92,
        reason: 'Agent A observed a private memory preference.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const scopedToOtherAgent = brain.memoryReview.propose({
        targetStore: 'working',
        key: agentBKey,
        value: 'User prefers concise, respectful replies.',
        source: 'agent-b:chat',
        confidence: 0.86,
        reason: 'Agent B observed the same private memory preference.',
      });
      const scopedToSameAgent = brain.memoryReview.propose({
        targetStore: 'working',
        key: '__fbeast_agent_memory__/agent-a/user.preference.answer-style',
        value: 'User prefers concise, respectful replies.',
        source: 'agent-a:chat-later',
        confidence: 0.86,
        reason: 'Agent A repeated the same private memory preference.',
      });

      expect(scopedToOtherAgent.mergeSuggestions).toEqual([]);
      expect(scopedToSameAgent.mergeSuggestions).toEqual([
        expect.objectContaining({ key: agentAKey, matchType: 'exact' }),
      ]);
    });

    it('preserves status synonym matches when normalizing plural tokens', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.status-cadence',
        value: 'User wants status cadence daily with short updates.',
        source: 'chat:turn-42',
        confidence: 0.88,
        reason: 'User requested daily status cadence.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const paraphrase = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.progress-cadence',
        value: 'User wants progress cadence daily with brief reports.',
        source: 'chat:turn-43',
        confidence: 0.78,
        reason: 'User repeated the same progress cadence.',
      });

      expect(paraphrase.mergeSuggestions).toEqual([
        expect.objectContaining({
          key: 'user.preference.status-cadence',
          matchType: 'semantic',
        }),
      ]);
    });

    it('ignores object field names when creating semantic merge tokens', () => {
      const approved = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor-vim',
        value: { type: 'preference', value: 'vim' },
        source: 'chat:turn-44',
        confidence: 0.9,
        reason: 'User mentioned vim.',
      });
      brain.memoryReview.approve(approved.id, { reviewer: 'operator' });

      const distinctStructuredValue = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.editor-emacs',
        value: { type: 'preference', value: 'emacs' },
        source: 'chat:turn-45',
        confidence: 0.9,
        reason: 'User mentioned emacs.',
      });

      expect(distinctStructuredValue.mergeSuggestions).toEqual([]);
    });

    it('ranks exact merge suggestions ahead of equally similar semantic suggestions', () => {
      for (const [index, key] of [
        'aaa.semantic-one',
        'aab.semantic-two',
        'aac.semantic-three',
        'aad.semantic-four',
        'aae.semantic-five',
      ].entries()) {
        const semantic = brain.memoryReview.propose({
          targetStore: 'working',
          key,
          value: 'User wants status cadence daily with short updates.',
          source: `chat:semantic-${index}`,
          confidence: 0.8,
          reason: 'Existing semantic candidate.',
        });
        brain.memoryReview.approve(semantic.id, { reviewer: 'operator' });
      }
      const exact = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'zzz.exact',
        value: 'User wants progress cadence daily with brief reports.',
        source: 'chat:exact-existing',
        confidence: 0.9,
        reason: 'Existing exact candidate.',
      });
      brain.memoryReview.approve(exact.id, { reviewer: 'operator' });

      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'user.preference.progress-cadence',
        value: 'User wants progress cadence daily with brief reports.',
        source: 'chat:new',
        confidence: 0.8,
        reason: 'New repeated memory candidate.',
      });

      expect(candidate.mergeSuggestions?.[0]).toEqual(
        expect.objectContaining({ key: 'zzz.exact', matchType: 'exact' }),
      );
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
        db.prepare(`SELECT COUNT(*) AS count FROM memory_deletion_hash_keys WHERE id = 'right-to-forget-hmac-v1'`).get(),
      ).toEqual({ count: 1 });
    });

    it('indexes review suppression lookup by target store and memory key', () => {
      const db = (brain as unknown as { db: Database.Database }).db;
      const indexes = db.prepare(`PRAGMA index_list(memory_review_suppressions)`).all() as Array<{ name: string }>;

      expect(indexes.some(index => index.name === 'idx_memory_review_suppressions_target_key')).toBe(true);
    });

    it('does not create deletion guard hash keys while only checking suppressions', () => {
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
        db.prepare(`SELECT id FROM memory_deletion_hash_keys ORDER BY id`).all(),
      ).toEqual([{ id: 'memory-access-audit-hmac-v1' }]);
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
        expect(() =>
          stale.memoryReview.approve(candidate.id, { reviewer: 'operator' }),
        ).toThrow(/conflicts with an existing value/);
        stale.memoryReview.resolveConflict(candidate.id, {
          resolution: 'replace_existing',
          reviewer: 'operator',
        });
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

    it('keeps working-memory provenance until pending changes are flushed durably', () => {
      const candidate = brain.memoryReview.propose({
        targetStore: 'working',
        key: 'preference.source-attribution',
        value: 'approved',
        source: 'chat:turn-22',
        confidence: 0.9,
        reason: 'Approved memory for attribution durability regression.',
      });
      brain.memoryReview.approve(candidate.id, { reviewer: 'operator' });

      brain.working.set('preference.source-attribution', 'pending change');
      expect(
        brain.memoryReview.provenanceFor('working', 'preference.source-attribution'),
      ).not.toBeNull();

      brain.working.set('preference.source-attribution', 'approved');
      brain.flush();
      expect(
        brain.memoryReview.provenanceFor('working', 'preference.source-attribution'),
      ).not.toBeNull();

      brain.working.delete('preference.source-attribution');
      expect(
        brain.memoryReview.provenanceFor('working', 'preference.source-attribution'),
      ).not.toBeNull();
      brain.flush();
      expect(
        brain.memoryReview.provenanceFor('working', 'preference.source-attribution'),
      ).toBeNull();
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
          recordCount: 1,
        },
        {
          store: 'memory_access_audit_events',
          version: CURRENT_MEMORY_SCHEMA_VERSION,
          recordCount: 5,
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
            recordCount: 1,
          },
          {
            store: 'memory_access_audit_events',
            version: CURRENT_MEMORY_SCHEMA_VERSION,
            recordCount: 1,
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
        expect(encrypted.getMemoryEncryptionMetadata().stores).toEqual(
          expect.arrayContaining([
            { store: 'memory_access_audit_events', encrypted: false },
          ]),
        );
        expect(
          encrypted
            .getMemoryEncryptionMetadata()
            .stores.filter((store) => store.store !== 'memory_access_audit_events')
            .every((store) => store.encrypted),
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
        expect(reopened.getMemoryEncryptionMetadata().stores).toEqual(
          expect.arrayContaining([
            { store: 'memory_access_audit_events', encrypted: false },
          ]),
        );
        expect(
          reopened
            .getMemoryEncryptionMetadata()
            .stores.filter((store) => store.store !== 'memory_access_audit_events')
            .every((store) => store.encrypted),
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

    it('does not score synthetic quarantine metadata during encrypted recall', () => {
      const dir = mkdtempSync(
        join(tmpdir(), 'sqlite-brain-encryption-quarantine-recall-'),
      );
      const dbPath = join(dir, 'brain.db');

      try {
        const encrypted = new SqliteBrain(dbPath, undefined, { encryption });
        encrypted.episodic.record({
          type: 'observation',
          summary: 'corrupt payload event',
          details: { note: 'valid before corruption' },
          createdAt: '2026-07-13T00:00:00.000Z',
        });
        const encodedMalformedJson = (
          encrypted.episodic as unknown as { encode: (value: string) => string }
        ).encode('{');
        const db = (
          encrypted as unknown as {
            db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
          }
        ).db;
        db.prepare(`UPDATE episodic_events SET details = ?`).run(encodedMalformedJson);

        expect(encrypted.episodic.recall('invalid', 10)).toEqual([]);
        expect(encrypted.episodic.recall('corrupt', 10)[0]).toMatchObject({
          details: {
            quarantine: {
              field: 'details',
              reason: 'invalid JSON',
            },
          },
        });
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

        const dropEpisodicIndexes = () => {
          const db = new Database(dbPath);
          db.exec(`
            DROP INDEX IF EXISTS idx_episodic_events_type_created_at;
            DROP INDEX IF EXISTS idx_episodic_events_created_at;
            DROP INDEX IF EXISTS idx_episodic_events_retention;
          `);
          db.close();
        };
        const expectEpisodicIndexesMissing = () => {
          const db = new Database(dbPath, { readonly: true });
          expect(
            db
              .prepare(
                `SELECT name FROM sqlite_master
                 WHERE type = 'index' AND name LIKE 'idx_episodic_events_%'`,
              )
              .all(),
          ).toEqual([]);
          db.close();
        };

        dropEpisodicIndexes();
        expect(() => new SqliteBrain(dbPath)).toThrow(
          MemoryEncryptionRequiredError,
        );
        expectEpisodicIndexesMissing();

        dropEpisodicIndexes();
        expect(
          () =>
            new SqliteBrain(dbPath, undefined, {
              encryption: { enabled: true, key: 'wrong key' },
            }),
        ).toThrow(MemoryEncryptionWrongKeyError);
        expectEpisodicIndexesMissing();
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

    it('rolls back every row when a working-memory batch fails mid-flush', () => {
      const db = (brain as unknown as { db: Database.Database }).db;
      db.exec(`
        CREATE TEMP TRIGGER fail_second_working_memory_insert
        BEFORE INSERT ON working_memory
        WHEN NEW.key = 'beta'
        BEGIN
          SELECT RAISE(ABORT, 'simulated mid-batch failure');
        END;
      `);

      brain.working.set('alpha', 'one');
      brain.working.set('beta', 'two');

      expect(() => brain.flush()).toThrow('simulated mid-batch failure');
      expect(db.prepare('SELECT key FROM working_memory ORDER BY key').all()).toEqual([]);

      db.exec('DROP TRIGGER fail_second_working_memory_insert');
      brain.flush();
      expect(db.prepare('SELECT key FROM working_memory ORDER BY key').all()).toEqual([
        { key: 'alpha' },
        { key: 'beta' },
      ]);
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

    it('preserves global ranking across recall keyword chunks', () => {
      brain.episodic.record(makeEvent({
        summary: 'older combined kw0000 kw1199 match',
        createdAt: '2026-07-10T00:00:00.000Z',
      }));
      brain.episodic.record(makeEvent({
        summary: 'newer first-chunk kw0000 match',
        createdAt: '2026-07-10T00:02:00.000Z',
      }));
      brain.episodic.record(makeEvent({
        summary: 'newer last-chunk kw1199 match',
        createdAt: '2026-07-10T00:01:00.000Z',
      }));
      const query = Array.from(
        { length: 1200 },
        (_, i) => `kw${String(i).padStart(4, '0')}`,
      ).join(' ');

      expect(brain.episodic.recall(query, 1).map((event) => event.summary)).toEqual([
        'older combined kw0000 kw1199 match',
      ]);
    });

    it('preserves unbounded recall across keyword chunks', () => {
      const episodic = brain.episodic as unknown as {
        recall: (query: string, limit: number) => EpisodicEvent[];
        recallKeywordChunk: (
          keywords: string[],
          limit?: number,
          offset?: number,
        ) => Array<Record<string, unknown>>;
      };
      const recallKeywordChunk = vi
        .spyOn(episodic, 'recallKeywordChunk')
        .mockImplementation((keywords, batchLimit = 100, offset = 0) => {
          if (offset >= 10_001) return [];
          return Array.from(
            { length: Math.min(batchLimit, 10_001 - offset) },
            (_, index) => ({
              id: offset + index + 1,
              type: 'observation',
              step: null,
              summary: `${keywords[0]} cross-chunk match`,
              details: null,
              created_at: '2026-07-10T00:00:00.000Z',
              relevance_score: 1,
            }),
          );
        });
      const query = Array.from(
        { length: 1200 },
        (_, i) => `kw${String(i).padStart(4, '0')}`,
      ).join(' ');

      expect(episodic.recall(query, -1)).toHaveLength(10_001);
      expect(recallKeywordChunk.mock.calls.some(([, , offset]) => offset === 10_000)).toBe(true);
    }, 20_000);

    it('quarantines corrupt persisted details while keeping recent and failure rows available', () => {
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
      const recent = brain.episodic.recent(2);
      expect(recent.map((event) => event.summary)).toEqual([
        'newest healthy success',
        'newer corrupt failure',
      ]);
      expect(recent[0]!.details).toEqual({ marker: 'healthy' });
      expect(recent[1]!.details).toEqual({
        quarantine: {
          field: 'details',
          eventId: recent[1]!.id,
          reason: 'invalid JSON',
        },
      });

      expect(() => brain.episodic.recentFailures(1)).not.toThrow();
      const failures = brain.episodic.recentFailures(1);
      expect(failures.map((event) => event.summary)).toEqual([
        'newer corrupt failure',
      ]);
      expect(failures[0]!.details).toEqual({
        quarantine: {
          field: 'details',
          eventId: failures[0]!.id,
          reason: 'invalid JSON',
        },
      });
    });

    it('quarantines corrupt persisted details during recall', () => {
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
      brain.episodic.record(
        makeEvent({
          summary: 'corrupt details-only event',
          createdAt: '2026-07-10T00:02:00.000Z',
          details: { marker: 'details-only-token' },
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
      db.prepare(
        `UPDATE episodic_events SET details = ? WHERE summary = ?`,
      ).run('{"details-only-token"', 'corrupt details-only event');

      expect(() => brain.episodic.recall('searchable', 10)).not.toThrow();
      const recalled = brain.episodic.recall('searchable', 10);
      expect(recalled.map((event) => event.summary)).toEqual([
        'healthy searchable event',
        'corrupt searchable event',
      ]);
      expect(recalled[0]!.details).toEqual({ marker: 'searchable' });
      expect(recalled[1]!.details).toEqual({
        quarantine: {
          field: 'details',
          eventId: recalled[1]!.id,
          reason: 'invalid JSON',
        },
      });
      expect(brain.episodic.recall('details-only-token', 10)).toEqual([]);
      expect(brain.episodic.recall('searchable', 0)).toEqual([]);
      expect(brain.episodic.recent(0)).toEqual([]);
      expect(brain.episodic.recentFailures(0)).toEqual([]);
    });

    it('re-scores quarantined plaintext recall rows from readable fields before limiting', () => {
      brain.episodic.record(
        makeEvent({
          summary: 'alpha quarantined candidate',
          createdAt: '2026-07-20T00:00:00.000Z',
          details: { marker: 'beta' },
        }),
      );
      brain.episodic.record(
        makeEvent({
          summary: 'alpha healthy candidate',
          createdAt: '2026-07-21T00:00:00.000Z',
          details: { marker: 'healthy' },
        }),
      );
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE summary = ?`).run(
        '{"marker":"beta"',
        'alpha quarantined candidate',
      );

      expect(brain.episodic.recall('alpha beta', 1).map((event) => event.summary)).toEqual([
        'alpha healthy candidate',
      ]);
    });

    it('does not score synthetic quarantine metadata during plaintext recall', () => {
      brain.episodic.record(
        makeEvent({
          summary: 'alpha quarantined candidate',
          createdAt: '2026-07-20T00:00:00.000Z',
          details: { marker: 'before-corruption' },
        }),
      );
      brain.episodic.record(
        makeEvent({
          summary: 'alpha invalid healthy candidate',
          createdAt: '2026-07-21T00:00:00.000Z',
          details: { marker: 'healthy' },
        }),
      );
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE summary = ?`).run(
        '{"marker":"before-corruption"',
        'alpha quarantined candidate',
      );

      expect(brain.episodic.recall('alpha invalid json', 1).map((event) => event.summary)).toEqual([
        'alpha invalid healthy candidate',
      ]);
    });

    it('keeps nonmatching quarantine metadata with null fields searchable', () => {
      brain.episodic.record(makeEvent({
        summary: 'ordinary metadata candidate',
        details: { marker: 'before-update' },
      }));
      const eventId = brain.episodic.recent(1)[0]!.id;
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE id = ?`).run(
        JSON.stringify({
          quarantine: {
            field: null,
            eventId,
            reason: 'invalid JSON',
          },
        }),
        eventId,
      );

      expect(brain.episodic.recall('invalid JSON', 1).map((event) => event.id)).toEqual([eventId]);
    });

    it('uses finite batches for bounded plaintext recall', () => {
      const episodic = brain.episodic as unknown as {
        recall: (query: string, limit: number) => EpisodicEvent[];
        recallKeywordChunk: (keywords: string[], limit?: number, offset?: number) => unknown[];
      };
      const recallKeywordChunk = vi.spyOn(episodic, 'recallKeywordChunk');
      brain.episodic.record(makeEvent({ summary: 'bounded recall candidate' }));

      expect(episodic.recall('bounded', 1)).toHaveLength(1);
      expect(recallKeywordChunk).toHaveBeenCalledWith(['bounded'], expect.any(Number), 0);
      expect(recallKeywordChunk.mock.calls.every(([, batchLimit]) => batchLimit !== undefined)).toBe(true);
    });

    it('scans past corrupt SQL-ranked pages before applying final recall ranking', () => {
      brain.episodic.record(makeEvent({
        summary: 'alpha beta healthy best match',
        createdAt: '2026-07-19T00:00:00.000Z',
      }));
      for (let index = 0; index < 101; index += 1) {
        brain.episodic.record(makeEvent({
          summary: `alpha corrupt candidate ${index}`,
          details: { marker: 'beta' },
          createdAt: '2026-07-20T00:00:00.000Z',
        }));
      }
      const db = (brain as unknown as { db: Database.Database }).db;
      db.prepare(`UPDATE episodic_events SET details = ? WHERE summary LIKE 'alpha corrupt candidate %'`)
        .run('{"marker":"beta"');

      expect(brain.episodic.recall('alpha beta', 1).map((event) => event.summary)).toEqual([
        'alpha beta healthy best match',
      ]);
    });

    it('audits quarantined details rows with their event ids', () => {
      brain.episodic.record(
        makeEvent({
          summary: 'diagnostic searchable event',
          details: { marker: 'valid-before-corruption' },
        }),
      );
      const eventId = brain.episodic.recent(1)[0]!.id;
      const db = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => { run: (...args: unknown[]) => void };
          };
        }
      ).db;
      db.prepare(
        `UPDATE episodic_events SET details = ? WHERE id = ?`,
      ).run('{', eventId);

      const recent = brain.episodic.recent(1);
      expect(recent).toHaveLength(1);
      expect(recent[0]).toMatchObject({
        id: eventId,
        summary: 'diagnostic searchable event',
        details: {
          quarantine: {
            field: 'details',
            eventId,
            reason: 'invalid JSON',
          },
        },
      });
      expect(brain.accessAudit.list({ operation: 'episodic.recent' })[0]).toMatchObject({
        outcome: 'success',
        details: { quarantinedEventIds: [eventId] },
      });

      const recalled = brain.episodic.recall('diagnostic', 1);
      expect(recalled).toHaveLength(1);
      expect(recalled[0]).toMatchObject({ id: eventId });
      expect(brain.accessAudit.list({ operation: 'episodic.recall' })[0]).toMatchObject({
        outcome: 'success',
        details: { quarantinedEventIds: [eventId] },
      });
    });

    it('audits imported quarantine envelopes with their event ids', () => {
      brain.episodic.record(
        makeEvent({
          summary: 'imported diagnostic event',
          details: { marker: 'valid-before-import' },
        }),
      );
      const eventId = brain.episodic.recent(1)[0]!.id;
      const db = (
        brain as unknown as {
          db: {
            prepare: (sql: string) => { run: (...args: unknown[]) => void };
          };
        }
      ).db;
      db.prepare(
        `UPDATE episodic_events SET details = ? WHERE id = ?`,
      ).run(JSON.stringify({
        quarantine: {
          field: 'details',
          eventId,
          reason: 'invalid JSON',
        },
      }), eventId);

      expect(brain.episodic.recent(1)).toHaveLength(1);
      expect(brain.accessAudit.list({ operation: 'episodic.recent' })[0]).toMatchObject({
        outcome: 'success',
        details: { quarantinedEventIds: [eventId] },
      });

      expect(brain.episodic.recall('imported diagnostic', 1)).toHaveLength(1);
      expect(brain.accessAudit.list({ operation: 'episodic.recall' })[0]).toMatchObject({
        outcome: 'success',
        details: { quarantinedEventIds: [eventId] },
      });
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
      const state = makeState();
      const result = brain.recovery.checkpoint(state);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(brain.recovery.lastCheckpoint()).toEqual(state);
    });

    it('checkpoint() rejects circular state with a controlled persistence error', () => {
      const context: Record<string, unknown> = {};
      context.self = context;

      expect(() => brain.recovery.checkpoint(makeState({ context }))).toThrowError(
        expect.objectContaining({
          name: 'CheckpointSerializationError',
          code: 'CHECKPOINT_NOT_PERSISTABLE',
          message: expect.stringMatching(/not JSON-serializable.*could not be persisted/),
        }),
      );
      expect(brain.recovery.lastCheckpoint()).toBeNull();
    });

    it('checkpoint() rejects state larger than the configured value byte budget without replacing the last usable state', () => {
      const bounded = new SqliteBrain(':memory:', { maxValueBytes: 512 });
      const previous = makeState();
      bounded.recovery.checkpoint(previous);

      expect(() =>
        bounded.recovery.checkpoint(
          makeState({ context: { payload: 'x'.repeat(1024) } }),
        ),
      ).toThrowError(
        expect.objectContaining({
          name: 'CheckpointSerializationError',
          code: 'CHECKPOINT_SIZE_LIMIT_EXCEEDED',
          maxBytes: 512,
          message: expect.stringMatching(/Checkpoint state is \d+ bytes, exceeding maxValueBytes \(512\)/),
        }),
      );
      expect(bounded.recovery.lastCheckpoint()).toEqual(previous);

      bounded.close();
    });

    it('hydrate() restores legacy oversized checkpoints while enforcing the budget on new writes', () => {
      const legacy = new SqliteBrain(':memory:', { maxValueBytes: 4096 });
      const oversized = makeState({ context: { payload: 'x'.repeat(1024) } });
      legacy.recovery.checkpoint(oversized);
      const snapshot = legacy.serialize();
      legacy.close();

      const hydrated = SqliteBrain.hydrate(snapshot, ':memory:', {
        maxValueBytes: 512,
      });
      expect(hydrated.recovery.lastCheckpoint()).toEqual(oversized);
      expect(() => hydrated.recovery.checkpoint(oversized)).toThrowError(
        expect.objectContaining({
          code: 'CHECKPOINT_SIZE_LIMIT_EXCEEDED',
          maxBytes: 512,
        }),
      );
      expect(hydrated.recovery.lastCheckpoint()).toEqual(oversized);

      hydrated.close();
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
      const corruptCheckpointId = Number(brain.recovery.listCheckpoints().at(-1)!.id);
      db.prepare(
        `UPDATE checkpoints SET state = ? WHERE id = (SELECT MAX(id) FROM checkpoints)`,
      ).run('{');

      expect(() => brain.recovery.lastCheckpoint()).not.toThrow();
      expect(brain.recovery.lastCheckpoint()?.step).toBe(1);
      expect(
        brain.accessAudit.list({ operation: 'recovery.lastCheckpoint' })[0],
      ).toMatchObject({
        outcome: 'success',
        details: { quarantinedCheckpointIds: [corruptCheckpointId] },
      });
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

    it('listCheckpoints() returns checkpoint metadata in ascending order', () => {
      brain.recovery.checkpoint(
        makeState({ timestamp: '2026-03-18T10:00:00Z' }),
      );
      brain.recovery.checkpoint(
        makeState({ timestamp: '2026-03-18T10:05:00Z' }),
      );

      const list = brain.recovery.listCheckpoints();
      expect(list).toHaveLength(2);
      expect(list.map((checkpoint) => checkpoint.id)).toEqual(['1', '2']);
      expect(list[0]!.timestamp).toBe('2026-03-18T10:00:00Z');
    });

    it('bounds checkpoint listings by default and pages through older checkpoints', () => {
      for (let step = 1; step <= 101; step += 1) {
        brain.recovery.checkpoint(
          makeState({
            step,
            timestamp: `2026-03-18T10:${String(step).padStart(3, '0')}:00Z`,
          }),
        );
      }

      const latestPage = brain.recovery.listCheckpoints();
      expect(latestPage).toHaveLength(100);
      expect(latestPage[0]!.id).toBe('2');
      expect(latestPage.at(-1)!.id).toBe('101');

      const latestThree = brain.recovery.listCheckpoints({ limit: 3 });
      expect(latestThree.map((checkpoint) => checkpoint.id)).toEqual(['99', '100', '101']);

      const olderPage = brain.recovery.listCheckpoints({
        limit: 3,
        cursor: latestThree[0]!.id,
      });
      expect(olderPage.map((checkpoint) => checkpoint.id)).toEqual(['96', '97', '98']);
    });

    it.each([
      { limit: 0 },
      { limit: 1_001 },
      { limit: 1.5 },
      { cursor: '0' },
      { cursor: 'not-an-id' },
      { cursor: '9223372036854775808' },
    ])('rejects invalid checkpoint list options %#', (options) => {
      expect(() => brain.recovery.listCheckpoints(options)).toThrow(RangeError);
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

    it('hydrate() preserves quarantined right-to-forget audit envelopes', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('task', 'delete project note');
      source.rightToForget({ query: 'delete project' });
      const snapshot = source.serialize();
      const auditEvent = snapshot.episodic.find(
        (event) => event.step === 'right-to-forget',
      );
      expect(auditEvent).toBeDefined();
      auditEvent!.details = {
        quarantine: {
          field: 'details',
          eventId: auditEvent!.id,
          reason: 'invalid JSON',
        },
      };

      const hydrated = SqliteBrain.hydrate(snapshot);

      expect(hydrated.episodic.recent(1)[0]).toMatchObject({
        step: 'right-to-forget',
        details: { quarantine: { field: 'details', reason: 'invalid JSON' } },
      });
      hydrated.close();
      source.close();
    });

    it('hydrate() rejects quarantined audit envelopes with extra guarded details', () => {
      const source = new SqliteBrain(':memory:');
      source.working.set('task', 'alice@example.test');
      source.rightToForget({ query: 'alice@example.test' });
      const snapshot = source.serialize();
      const auditEvent = snapshot.episodic.find(
        (event) => event.step === 'right-to-forget',
      );
      expect(auditEvent).toBeDefined();
      auditEvent!.details = {
        quarantine: {
          field: 'details',
          eventId: auditEvent!.id,
          reason: 'invalid JSON',
        },
        note: 'alice@example.test',
      };

      expect(() => SqliteBrain.hydrate(snapshot)).toThrow(/right-to-forget/);
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

  describe('memory access audit', () => {
    it('hashes selectors with the deletion hash key and preserves details objects', () => {
      brain.rightToForget({ query: 'audit seed selector' });
      brain.working.set('api-token', 'secret-value');

      const [event] = brain.accessAudit.list({ operation: 'working.set', limit: 1 });
      expect(event).toMatchObject({
        operation: 'working.set',
        store: 'working',
        outcome: 'success',
        details: { valueBytes: '"secret-value"'.length },
      });
      expect(event.keyHash).toBeDefined();
      expect(event.keyHash).not.toBe(
        createHash('sha256').update('api-token', 'utf8').digest('hex'),
      );
    });

    it('keeps audit-only hash keys out of exported deletion guard snapshots', () => {
      brain.working.set('api-token', 'secret-value');

      const [event] = brain.accessAudit.list({ operation: 'working.set', limit: 1 });
      expect(event.keyHash).toBeDefined();
      expect(brain.serialize().deletionGuardHashKey).toBeUndefined();
      expect(brain.serialize().deletionGuards).toEqual([]);

      const db = (brain as unknown as { db: Database.Database }).db;
      expect(
        db.prepare(`SELECT id FROM memory_deletion_hash_keys ORDER BY id`).all(),
      ).toEqual([{ id: 'memory-access-audit-hmac-v1' }]);
    });

    it('hashes learning keys and audits denied review proposals', () => {
      brain.episodic.recordLearning(
        {
          type: 'observation',
          summary: 'Learned sensitive operator detail',
          createdAt: '2026-07-15T00:00:00.000Z',
        },
        { key: 'operator@example.test', cooldownMs: 0 },
      );
      const [learningEvent] = brain.accessAudit.list({
        operation: 'episodic.recordLearning',
        limit: 1,
      });
      expect(learningEvent.keyHash).toBeDefined();
      expect(JSON.stringify(learningEvent)).not.toContain('operator@example.test');

      brain.rightToForget({ key: 'blocked-review-key' });
      expect(() =>
        brain.memoryReview.propose({
          targetStore: 'working',
          key: 'blocked-review-key',
          value: 'blocked value',
          source: 'test',
          confidence: 0.9,
          reason: 'would reintroduce forgotten key',
        }),
      ).toThrow(/right-to-forget/);
      const [proposalEvent] = brain.accessAudit.list({
        operation: 'review.propose',
        limit: 1,
      });
      expect(proposalEvent).toMatchObject({
        operation: 'review.propose',
        store: 'review',
        outcome: 'denied',
        details: { errorName: 'MemoryDeletionGuardError' },
      });
      expect(proposalEvent.keyHash).toBeDefined();
      expect(JSON.stringify(proposalEvent)).not.toContain('blocked-review-key');
    });

    it('records accesses across persisted memory surfaces and right-to-forget', () => {
      brain.episodic.record({
        type: 'observation',
        summary: 'Audit trail event',
        createdAt: '2026-07-15T00:00:00.000Z',
      });
      brain.episodic.recall('Audit trail event', 1);
      brain.recovery.checkpoint({
        runId: 'audit-run',
        phase: 'verify',
        step: 1,
        context: {},
        timestamp: '2026-07-15T00:00:01.000Z',
      });
      brain.recovery.listCheckpoints();
      brain.memoryReview.propose({
        targetStore: 'working',
        key: 'audit-review',
        value: 'candidate',
        source: 'test',
        confidence: 0.9,
        reason: 'exercise audit trail',
      });
      brain.memoryReview.list();
      brain.rightToForget({ query: 'Audit trail event' });

      const operations = brain.accessAudit.list({ limit: 50 }).map((event) => event.operation);
      expect(operations).toEqual(
        expect.arrayContaining([
          'episodic.record',
          'episodic.recall',
          'recovery.checkpoint',
          'recovery.listCheckpoints',
          'review.propose',
          'review.list',
          'privacy.rightToForget',
        ]),
      );
    });
  });

  describe('concurrent file-backed stores', () => {
    it('refreshes clean cached keys before flushing unrelated local changes', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-concurrent-refresh-'));
      const dbPath = join(dir, 'brain.db');
      let stale: SqliteBrain | undefined;
      let writer: SqliteBrain | undefined;
      let verifier: SqliteBrain | undefined;

      try {
        writer = new SqliteBrain(dbPath);
        writer.working.set('updated-elsewhere', 'old');
        writer.working.set('deleted-elsewhere', 'present');
        writer.flush();
        stale = new SqliteBrain(dbPath);

        writer.working.set('updated-elsewhere', 'new');
        writer.working.delete('deleted-elsewhere');
        writer.flush();

        stale.working.set('local-change', 'preserved');
        stale.flush();

        verifier = new SqliteBrain(dbPath);
        expect(verifier.working.snapshot()).toEqual({
          'updated-elsewhere': 'new',
          'local-change': 'preserved',
        });
      } finally {
        verifier?.close();
        stale?.close();
        writer?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails closed without mutating runtime state when an external row is corrupt', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-concurrent-corrupt-'));
      const dbPath = join(dir, 'brain.db');
      let instance: SqliteBrain | undefined;
      let db: Database.Database | undefined;

      try {
        instance = new SqliteBrain(dbPath);
        instance.working.set('safe', { preserved: true });
        instance.flush();

        db = new Database(dbPath);
        db.prepare(
          `INSERT INTO working_memory (key, value, updated_at, schema_version) VALUES (?, ?, ?, ?)`,
        ).run(
          'external-corrupt',
          '{not-json',
          new Date().toISOString(),
          CURRENT_MEMORY_SCHEMA_VERSION,
        );

        expect(() => instance!.flush()).toThrow(CorruptWorkingMemoryRowError);
        expect(instance.working.snapshot()).toEqual({ safe: { preserved: true } });
        expect(
          db.prepare(`SELECT value FROM working_memory WHERE key = ?`).get(
            'external-corrupt',
          ),
        ).toEqual({ value: '{not-json' });
      } finally {
        db?.close();
        instance?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('preserves simultaneous working, episodic, and recovery writes while snapshots are read', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-brain-concurrent-'));
      const dbPath = join(dir, 'brain.db');
      const workerCount = 3;
      const writesPerWorker = 6;
      const workers: Worker[] = [];
      const workerSourcePath = fileURLToPath(
        new URL('../../src/sqlite-brain.ts', import.meta.url),
      );
      const vitestConfigPath = fileURLToPath(
        new URL('../../vitest.config.ts', import.meta.url),
      );
      const workerScript = String.raw`
        const { parentPort, workerData } = require('node:worker_threads');

        void (async () => {
          const { createServer } = await import('vite');
          const vite = await createServer({
            configFile: workerData.vitestConfigPath,
            logLevel: 'silent',
            server: { middlewareMode: true, hmr: false, watch: null },
          });
          const { SqliteBrain } = await vite.ssrLoadModule(workerData.sourcePath);
          const brain = new SqliteBrain(workerData.dbPath);
          parentPort.postMessage({ type: 'ready' });
          parentPort.once('message', async (message) => {
            if (message?.type !== 'start') return;
            try {
              for (let index = 0; index < workerData.writesPerWorker; index += 1) {
                const key = 'worker-' + workerData.workerId + '-entry-' + index;
                brain.working.set(key, { workerId: workerData.workerId, index });
                brain.flush();
                brain.episodic.record({
                  type: 'observation',
                  step: 'worker-' + workerData.workerId,
                  summary: 'concurrent event ' + workerData.workerId + ':' + index,
                  details: { workerId: workerData.workerId, index },
                  createdAt: new Date(
                    Date.UTC(2026, 6, 19, 0, workerData.workerId, index),
                  ).toISOString(),
                });
                brain.recovery.checkpoint({
                  runId: 'concurrent-run-' + workerData.workerId + '-' + index,
                  phase: 'execution',
                  step: index,
                  context: { workerId: workerData.workerId, index },
                  timestamp: new Date(
                    Date.UTC(2026, 6, 19, 1, workerData.workerId, index),
                  ).toISOString(),
                });

                const roundTrip = JSON.parse(JSON.stringify(brain.serialize()));
                if (roundTrip.working[key]?.index !== index) {
                  throw new Error('snapshot lost the worker\'s latest working-memory write');
                }
                if (!Array.isArray(roundTrip.episodic)) {
                  throw new Error('snapshot episodic memory is corrupted');
                }
              }
              brain.close();
              await vite.close();
              parentPort.postMessage({ type: 'done' });
            } catch (error) {
              brain.close();
              await vite.close();
              parentPort.postMessage({
                type: 'error',
                message: error instanceof Error ? error.stack ?? error.message : String(error),
              });
            }
          });
        })().catch((error) => {
          parentPort.postMessage({
            type: 'error',
            message: error instanceof Error ? error.stack ?? error.message : String(error),
          });
        });
      `;

      try {
        const controls = Array.from({ length: workerCount }, (_, workerId) => {
          const worker = new Worker(workerScript, {
            eval: true,
            workerData: {
              dbPath,
              sourcePath: workerSourcePath,
              vitestConfigPath,
              workerId,
              writesPerWorker,
            },
          });
          workers.push(worker);

          let markReady: (() => void) | undefined;
          let finish: (() => void) | undefined;
          let fail: ((error: Error) => void) | undefined;
          let failReady: ((error: Error) => void) | undefined;
          let isReady = false;
          let isDone = false;
          const ready = new Promise<void>((resolve, reject) => {
            markReady = resolve;
            failReady = reject;
          });
          const done = new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          });
          const rejectWorker = (error: Error): void => {
            if (isReady) fail?.(error);
            else failReady?.(error);
          };
          worker.on('message', (message: { type?: string; message?: string }) => {
            if (message.type === 'ready') {
              isReady = true;
              markReady?.();
            }
            if (message.type === 'done') {
              isDone = true;
              finish?.();
            }
            if (message.type === 'error') {
              const error = new Error(message.message ?? 'worker failed');
              rejectWorker(error);
            }
          });
          worker.on('error', (error) => {
            const normalized: Error = error instanceof Error
              ? error
              : new Error(String(error));
            rejectWorker(normalized);
          });
          worker.on('exit', (code) => {
            if (!isDone) {
              rejectWorker(new Error(`worker exited before completion with code ${code}`));
            }
          });
          return { worker, ready, done };
        });

        await Promise.all(controls.map(({ ready }) => ready));
        for (const { worker } of controls) worker.postMessage({ type: 'start' });
        await Promise.all(controls.map(({ done }) => done));

        const verifier = new SqliteBrain(dbPath);
        try {
          const expectedWrites = workerCount * writesPerWorker;
          const snapshot = verifier.serialize();
          expect(() => BrainSnapshotSchema.parse(snapshot)).not.toThrow();
          expect(Object.keys(snapshot.working)).toHaveLength(expectedWrites);
          expect(verifier.episodic.count()).toBe(expectedWrites);
          expect(verifier.recovery.listCheckpoints()).toHaveLength(expectedWrites);

          for (let workerId = 0; workerId < workerCount; workerId += 1) {
            for (let index = 0; index < writesPerWorker; index += 1) {
              expect(snapshot.working[`worker-${workerId}-entry-${index}`]).toEqual({
                workerId,
                index,
              });
            }
          }
        } finally {
          verifier.close();
        }
      } finally {
        await Promise.all(workers.map((worker) => worker.terminate()));
        rmSync(dir, { recursive: true, force: true });
      }
    }, 30_000);
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
