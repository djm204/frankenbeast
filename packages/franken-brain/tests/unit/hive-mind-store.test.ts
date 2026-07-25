import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  BrainRegistry,
  HIVE_MIND_GLOBAL_NAMESPACE,
  HiveMindStore,
  SqliteBrain,
  hiveMindAgentTypeNamespace,
} from '../../src/index.js';

describe('HiveMindStore', () => {
  it('durably isolates agent-type namespaces and requires explicit global access', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-isolation-'));
    const dbPath = join(root, '.fbeast', 'hive', 'hive.db');
    const coderNamespace = hiveMindAgentTypeNamespace('coder');
    const reviewerNamespace = hiveMindAgentTypeNamespace('reviewer');

    try {
      const writer = new HiveMindStore(dbPath);
      const coderEntry = writer.publish(coderNamespace, 'coder-run-a', {
        kind: 'episode',
        event: {
          type: 'failure',
          summary: 'Coder observed a critical build failure',
          createdAt: '2026-07-25T11:00:00.000Z',
        },
      });
      writer.publish(HIVE_MIND_GLOBAL_NAMESPACE, 'coder-run-a', {
        kind: 'episode',
        event: {
          type: 'observation',
          summary: 'Explicitly shared global operational note',
          createdAt: '2026-07-25T11:01:00.000Z',
        },
      });
      writer.close();

      const reader = new HiveMindStore(dbPath);
      try {
        expect(reader.poll(coderNamespace)).toEqual([
          expect.objectContaining({ id: coderEntry.id, publisherId: 'coder-run-a' }),
        ]);
        expect(reader.poll(reviewerNamespace)).toEqual([]);
        expect(reader.poll(HIVE_MIND_GLOBAL_NAMESPACE)).toEqual([
          expect.objectContaining({ namespace: HIVE_MIND_GLOBAL_NAMESPACE }),
        ]);
      } finally {
        reader.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves writes from two concurrent handles and supports bounded cursored polling', async () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-concurrent-'));
    const dbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const first = new HiveMindStore(dbPath);
    const second = new HiveMindStore(dbPath);

    try {
      await Promise.all(Array.from({ length: 40 }, async (_, index) => {
        const handle = index % 2 === 0 ? first : second;
        handle.publish(namespace, `run-${index % 2}`, {
          kind: 'episode',
          event: {
            type: 'failure',
            summary: `Concurrent failure ${index}`,
            createdAt: new Date(Date.UTC(2026, 6, 25, 11, 0, index)).toISOString(),
          },
        });
      }));

      const firstPage = first.poll(namespace, { limit: 15 });
      const secondPage = second.poll(namespace, {
        sinceId: firstPage.at(-1)?.id,
        limit: 25,
      });
      expect(firstPage).toHaveLength(15);
      expect(secondPage).toHaveLength(25);
      expect(new Set([...firstPage, ...secondPage].map(entry => entry.id))).toHaveLength(40);
      expect(second.recent(namespace, { limit: 5 }).map(entry => entry.id)).toEqual([
        40, 39, 38, 37, 36,
      ]);
    } finally {
      first.close();
      second.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps database metadata authoritative and bounds retained rows per namespace', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-metadata-'));
    const dbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const store = new HiveMindStore(dbPath, { maxEntriesPerNamespace: 3 });
    try {
      for (let index = 0; index < 5; index += 1) {
        store.publish(namespace, 'publisher-a', {
          kind: 'episode',
          event: { type: 'failure', summary: `failure ${index}`, createdAt: '2026-07-25T10:00:00.000Z' },
          id: 99_999,
          namespace: HIVE_MIND_GLOBAL_NAMESPACE,
          publisherId: 'spoofed',
        } as never);
      }
      const retained = store.poll(namespace, { limit: 10 });
      expect(retained).toHaveLength(3);
      expect(retained.filter(entry => entry.kind === 'episode').map(entry => entry.event.summary))
        .toEqual(['failure 2', 'failure 3', 'failure 4']);
      expect(retained.every(entry => entry.namespace === namespace)).toBe(true);
      expect(retained.every(entry => entry.publisherId === 'publisher-a')).toBe(true);
      expect(retained.every(entry => entry.id !== 99_999)).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('purges deleted payload bytes from the database and WAL', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-secure-delete-'));
    const dbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const secret = `hive-secret-${'sensitive-payload-'.repeat(128)}`;
    const store = new HiveMindStore(dbPath);
    try {
      store.publish(namespace, 'publisher-a', {
        kind: 'episode',
        event: {
          type: 'failure',
          summary: secret,
          createdAt: '2026-07-25T10:00:00.000Z',
        },
      });
      expect(store.deletePublishedWhere(namespace, 'publisher-a', () => true)).toBe(1);
    } finally {
      store.close();
    }

    try {
      const sqliteBytes = [dbPath, `${dbPath}-wal`]
        .filter(existsSync)
        .map(path => readFileSync(path))
        .map(buffer => buffer.toString('utf8'))
        .join('');
      expect(sqliteBytes).not.toContain(secret);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails secure deletion when an active reader prevents WAL truncation', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-secure-delete-busy-'));
    const dbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const secret = `reader-held-secret-${'private-payload-'.repeat(128)}`;
    const store = new HiveMindStore(dbPath);
    const reader = new Database(dbPath);
    try {
      store.publish(namespace, 'publisher-a', {
        kind: 'episode',
        event: {
          type: 'failure',
          summary: secret,
          createdAt: '2026-07-25T10:00:00.000Z',
        },
      });
      reader.exec('BEGIN');
      reader.prepare('SELECT payload FROM hive_mind_entries').all();

      expect(() => store.deletePublishedWhere(namespace, 'publisher-a', () => true))
        .toThrow('Secure deletion could not truncate the Hive WAL');
      reader.exec('ROLLBACK');
      expect(store.poll(namespace)).toEqual([]);
      const sqliteBytes = [dbPath, `${dbPath}-wal`]
        .filter(existsSync)
        .map(path => readFileSync(path).toString('utf8'))
        .join('');
      expect(sqliteBytes).not.toContain(secret);
    } finally {
      if (reader.inTransaction) reader.exec('ROLLBACK');
      reader.close();
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it('leaves securely erased pages available for reuse instead of vacuuming per deletion', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-secure-delete-reuse-'));
    const dbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const store = new HiveMindStore(dbPath);
    const observer = new Database(dbPath);
    try {
      for (let index = 0; index < 64; index += 1) {
        store.publish(namespace, 'publisher-a', {
          kind: 'episode',
          event: {
            type: 'failure',
            summary: `reusable-page-${index}-${'payload-'.repeat(1_024)}`,
            createdAt: '2026-07-25T10:00:00.000Z',
          },
        });
      }
      observer.pragma('wal_checkpoint(TRUNCATE)');
      const pageCount = observer.pragma('page_count', { simple: true }) as number;

      expect(store.deletePublishedWhere(namespace, 'publisher-a', () => true)).toBe(64);

      expect(observer.pragma('page_count', { simple: true })).toBe(pageCount);
      expect(observer.pragma('freelist_count', { simple: true }) as number).toBeGreaterThan(0);
    } finally {
      observer.close();
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('filters by kind before applying the newest-entry bound', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-kind-bound-'));
    const store = new HiveMindStore(join(root, 'hive.db'));
    const namespace = hiveMindAgentTypeNamespace('coder');
    try {
      store.publish(namespace, 'publisher-a', {
        kind: 'lesson',
        key: 'lesson:durable',
        status: 'pending',
        lesson: lessonValue('durable peer insight'),
      });
      for (let index = 0; index < 1_001; index += 1) {
        store.publish(namespace, 'publisher-a', {
          kind: 'episode',
          event: { type: 'failure', summary: `failure ${index}`, createdAt: '2026-07-25T10:00:00.000Z' },
        });
      }
      expect(store.recent(namespace, { kind: 'lesson', limit: 1 })).toEqual([
        expect.objectContaining({ kind: 'lesson', key: 'lesson:durable' }),
      ]);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('shares a high-confidence lesson with a peer brain before the publisher closes', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-live-learning-'));
    const brainsDir = join(root, '.fbeast', 'brains');
    const hiveDbPath = join(root, '.fbeast', 'hive', 'hive.db');
    const publisherRegistry = new BrainRegistry(brainsDir, hiveDbPath, 'run-a');
    const consumerRegistry = new BrainRegistry(brainsDir, hiveDbPath, 'run-b');
    const publisher = publisherRegistry.forAgentType('coder', join(root, 'publisher.db'));
    const consumer = consumerRegistry.forAgentType('coder', join(root, 'consumer.db'));

    try {
      for (const [summary, createdAt] of [
        ['TypeScript workspace build failed after stale declarations were loaded', '2026-07-25T11:00:00.000Z'],
        ['Stale declaration files broke the workspace TypeScript build', '2026-07-25T11:01:00.000Z'],
        ['Workspace TypeScript build stopped because declarations were stale', '2026-07-25T11:02:00.000Z'],
      ] as const) {
        publisher.episodic.record({ type: 'failure', summary, createdAt });
      }
      publisher.learning.consolidate({ threshold: 3, lookback: 10 });

      expect(consumer.learning.relevantLessons('workspace TypeScript build')).toEqual([
        expect.objectContaining({
          source: 'peer',
          publisherId: 'run-a',
          occurrenceCount: 3,
          confidence: 0.65,
        }),
      ]);
      expect(publisher.learning.relevantLessons('workspace TypeScript build')[0]).toMatchObject({
        source: 'local',
      });
    } finally {
      publisherRegistry.close();
      consumerRegistry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not publish an approved lesson below the hive confidence floor', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-confidence-floor-'));
    const hiveDbPath = join(root, 'hive.db');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      brain.episodic.record({
        type: 'failure',
        summary: 'Low confidence build timeout one',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      brain.episodic.record({
        type: 'failure',
        summary: 'Low confidence build timeout two',
        createdAt: '2026-07-25T10:01:00.000Z',
      });
      const [candidate] = brain.learning.consolidate({ threshold: 2 });
      expect(candidate?.value.confidence).toBeLessThan(0.65);
      brain.memoryReview.approve(candidate!.id);

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(hiveMindAgentTypeNamespace('coder'), { kind: 'lesson' })).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves an approved hive lesson when its pending revision is rejected', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-reject-revision-'));
    const hiveDbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      recordCluster(brain, 'RevisionMarker build timeout');
      const [baseline] = brain.learning.consolidate({ threshold: 3 });
      brain.memoryReview.approve(baseline!.id);
      brain.episodic.record({
        type: 'failure',
        summary: 'RevisionMarker build timeout failure 3',
        createdAt: '2026-07-25T10:00:03.000Z',
      });
      const [revision] = brain.learning.consolidate({ threshold: 3 });
      expect(revision?.key).toBe(baseline?.key);

      brain.memoryReview.reject(revision!.id);

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace, { kind: 'lesson' })).toEqual([
          expect.objectContaining({ key: baseline!.key, status: 'approved' }),
        ]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('revokes only the dependent hive revision when an approved baseline shares its key', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-forget-revision-'));
    const hiveDbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      recordCluster(brain, 'RevisionIdentityMarker build timeout');
      const [baseline] = brain.learning.consolidate({ threshold: 3 });
      brain.memoryReview.approve(baseline!.id);
      brain.episodic.record({
        type: 'failure',
        summary: 'RevisionIdentityMarker build timeout PrivateRevisionEvidence',
        createdAt: '2026-07-25T10:00:03.000Z',
      });
      const [revision] = brain.learning.consolidate({ threshold: 3 });
      expect(revision?.key).toBe(baseline?.key);

      brain.rightToForget({ type: 'episodic', query: 'PrivateRevisionEvidence' });

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace, { kind: 'lesson' })).toEqual([
          expect.objectContaining({ candidateId: baseline!.id, status: 'approved' }),
        ]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('conservatively revokes a dependent legacy hive lesson without a candidate identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-forget-legacy-lesson-'));
    const hiveDbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      recordCluster(brain, 'LegacyCandidateMarker build timeout');
      const [candidate] = brain.learning.consolidate({ threshold: 3 });
      const publisher = new HiveMindStore(hiveDbPath);
      try {
        publisher.deleteLessonPublication(namespace, 'publisher-a', candidate!.id, candidate!.key);
        publisher.publish(namespace, 'publisher-a', {
          kind: 'lesson',
          key: candidate!.key,
          status: 'pending',
          lesson: candidate!.value as ReturnType<typeof lessonValue>,
        });
      } finally {
        publisher.close();
      }

      brain.rightToForget({ type: 'episodic', query: 'LegacyCandidateMarker' });

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace, { kind: 'lesson' })).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('revokes every approved hive lesson absorbed by a bridging revision', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-bridge-revision-'));
    const hiveDbPath = join(root, 'hive.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      for (const [summary, createdAt] of [
        ['AlphaOnlyMarker parser timeout crash', '2026-07-25T10:00:00.000Z'],
        ['AlphaOnlyMarker parser timeout crash', '2026-07-25T10:01:00.000Z'],
        ['AlphaOnlyMarker parser timeout crash', '2026-07-25T10:02:00.000Z'],
        ['OmegaOnlyMarker cache mismatch overflow', '2026-07-25T10:03:00.000Z'],
        ['OmegaOnlyMarker cache mismatch overflow', '2026-07-25T10:04:00.000Z'],
        ['OmegaOnlyMarker cache mismatch overflow', '2026-07-25T10:05:00.000Z'],
      ] as const) {
        brain.episodic.record({ type: 'failure', summary, createdAt });
      }
      const initial = brain.learning.consolidate({
        threshold: 3,
        similarityThreshold: 0.5,
      });
      expect(initial).toHaveLength(2);
      for (const candidate of initial) brain.memoryReview.approve(candidate.id);

      brain.episodic.record({
        type: 'failure',
        summary: 'AlphaOnlyMarker parser timeout crash OmegaOnlyMarker cache mismatch overflow',
        createdAt: '2026-07-25T10:06:00.000Z',
      });
      const [revision] = brain.learning.consolidate({
        threshold: 3,
        similarityThreshold: 0.5,
      });
      expect(revision?.replaces).toHaveLength(1);
      brain.memoryReview.resolveConflict(revision!.id, { resolution: 'replace_existing' });

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace, { kind: 'lesson' })).toEqual([
          expect.objectContaining({ candidateId: revision!.id, status: 'approved' }),
        ]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes significant failure episodes from a durable agent brain', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-significant-episode-'));
    const brainsDir = join(root, '.fbeast', 'brains');
    const hiveDbPath = join(root, '.fbeast', 'hive', 'hive.db');
    const registry = new BrainRegistry(brainsDir, hiveDbPath, 'run-a');
    const brain = registry.forAgentType('coder');

    try {
      brain.episodic.record({
        type: 'failure',
        summary: 'Critical tool execution failed',
        createdAt: '2026-07-25T11:00:00.000Z',
      });
      brain.episodic.record({
        type: 'success',
        summary: 'Routine successful operation',
        createdAt: '2026-07-25T11:01:00.000Z',
      });
      brain.episodic.record({
        type: 'decision',
        step: 'action:governor',
        summary: 'Action decision (rejected): unsafe command',
        details: { category: 'action-lifecycle', outcome: 'negative' },
        createdAt: '2026-07-25T11:02:00.000Z',
      });

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(hiveMindAgentTypeNamespace('coder'))).toEqual([
          expect.objectContaining({
            kind: 'episode',
            publisherId: 'run-a',
            event: expect.objectContaining({ summary: 'Critical tool execution failed' }),
          }),
          expect.objectContaining({
            kind: 'episode',
            publisherId: 'run-a',
            event: expect.objectContaining({ summary: 'Action decision (rejected): unsafe command' }),
          }),
        ]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes shared events during right-to-forget and revokes rejected lessons', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-forget-'));
    const hiveDbPath = join(root, 'hive', 'hive.db');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      brain.episodic.record({
        type: 'failure',
        summary: 'private-hive-token request failed',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      recordCluster(brain, 'shared rejected lesson');
      const [candidate] = brain.learning.consolidate({ threshold: 3 });
      expect(candidate).toBeDefined();

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(hiveMindAgentTypeNamespace('coder'))).not.toHaveLength(0);
        brain.memoryReview.reject(candidate!.id);
        brain.rightToForget({ query: 'private-hive-token' });
        const retained = observer.poll(hiveMindAgentTypeNamespace('coder'));
        expect(retained.some(entry => entry.kind === 'lesson')).toBe(false);
        expect(retained.some(entry => (
          entry.kind === 'episode' && entry.event.summary.includes('private-hive-token')
        ))).toBe(false);
      } finally {
        observer.close();
      }
    } finally {
      brain.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('revokes hive lessons derived from forgotten episodic evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-forget-derived-'));
    const hiveDbPath = join(root, 'hive.db');
    const registry = new BrainRegistry(join(root, 'brains'), hiveDbPath, 'publisher-a');
    const brain = registry.forAgentType('coder');
    try {
      recordCluster(brain, 'DerivedPrivateMarker build timeout');
      const [candidate] = brain.learning.consolidate({ threshold: 3 });
      brain.memoryReview.approve(candidate!.id);

      brain.rightToForget({ type: 'episodic', query: 'DerivedPrivateMarker' });

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(hiveMindAgentTypeNamespace('coder'), { kind: 'lesson' })).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves durable publisher ownership across registry restarts', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-publisher-restart-'));
    const brainsDir = join(root, 'brains');
    const hiveDbPath = join(root, 'hive', 'hive.db');
    try {
      const firstRegistry = new BrainRegistry(brainsDir, hiveDbPath);
      const firstBrain = firstRegistry.forAgentType('coder');
      firstBrain.episodic.record({
        type: 'failure',
        summary: 'restart-private-token request failed',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      firstRegistry.close();

      const secondRegistry = new BrainRegistry(brainsDir, hiveDbPath);
      const secondBrain = secondRegistry.forAgentType('coder');
      secondBrain.rightToForget({ query: 'restart-private-token' });
      secondRegistry.close();

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(hiveMindAgentTypeNamespace('coder'))).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('migrates publications owned by the preceding path-derived publisher identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-publisher-migration-'));
    const brainsDir = join(root, 'brains');
    const hiveDbPath = join(root, 'hive', 'hive.db');
    const durableDbPath = join(brainsDir, 'coder.db');
    const namespace = hiveMindAgentTypeNamespace('coder');
    const legacyPublisherId = createHash('sha256').update(durableDbPath).digest('hex');
    try {
      mkdirSync(brainsDir, { recursive: true });
      const legacyBrain = new SqliteBrain(durableDbPath);
      legacyBrain.episodic.record({
        type: 'failure',
        summary: 'legacy-path-private-token request failed',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      legacyBrain.close();
      const publisher = new HiveMindStore(hiveDbPath);
      publisher.publish(namespace, legacyPublisherId, {
        kind: 'episode',
        event: {
          type: 'failure',
          summary: 'legacy-path-private-token request failed',
          createdAt: '2026-07-25T10:00:00.000Z',
        },
      });
      publisher.close();

      const registry = new BrainRegistry(brainsDir, hiveDbPath);
      registry.forAgentType('coder', durableDbPath)
        .rightToForget({ query: 'legacy-path-private-token' });
      registry.close();

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace)).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns a cached durable brain without reopening its locked database', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-publisher-cache-'));
    const brainsDir = join(root, 'brains');
    const durableDbPath = join(brainsDir, 'coder.db');
    const registry = new BrainRegistry(brainsDir, join(root, 'hive.db'));
    const brain = registry.forAgentType('coder', durableDbPath);
    const blocker = new Database(durableDbPath);
    try {
      blocker.exec('BEGIN IMMEDIATE');
      expect(registry.forAgentType('coder', durableDbPath)).toBe(brain);
    } finally {
      if (blocker.inTransaction) blocker.exec('ROLLBACK');
      blocker.close();
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it('preserves durable publisher ownership when the same brain is reopened through a symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-publisher-symlink-'));
    const brainsDir = join(root, 'brains');
    const hiveDbPath = join(root, 'hive', 'hive.db');
    const durableDbPath = join(brainsDir, 'durable.db');
    const linkedDbPath = join(root, 'linked-durable.db');
    try {
      mkdirSync(brainsDir, { recursive: true });
      const firstRegistry = new BrainRegistry(brainsDir, hiveDbPath);
      const firstBrain = firstRegistry.forAgentType('coder', durableDbPath);
      firstBrain.episodic.record({
        type: 'failure',
        summary: 'symlink-private-token request failed',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      firstRegistry.close();
      symlinkSync(durableDbPath, linkedDbPath);

      const secondRegistry = new BrainRegistry(brainsDir, hiveDbPath);
      const secondBrain = secondRegistry.forAgentType('coder', linkedDbPath);
      secondBrain.rightToForget({ query: 'symlink-private-token' });
      secondRegistry.close();

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(hiveMindAgentTypeNamespace('coder'))).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps encrypted and hive-unavailable local brains operational without publishing plaintext', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-additive-'));
    const namespace = hiveMindAgentTypeNamespace('coder');
    const hiveDbPath = join(root, 'hive.db');
    const encrypted = new SqliteBrain(join(root, 'encrypted.db'), undefined, {
      encryption: { enabled: true, key: 'hive-encryption-test-key' },
      hiveMind: { dbPath: hiveDbPath, namespace, publisherId: 'encrypted-run' },
    });
    try {
      encrypted.episodic.record({
        type: 'failure',
        summary: 'must stay encrypted',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace)).toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      encrypted.close();
    }

    const unavailableHivePath = join(root, 'not-a-database');
    mkdirSync(unavailableHivePath);
    const unavailableHive = new SqliteBrain(join(root, 'local.db'), undefined, {
      hiveMind: { dbPath: unavailableHivePath, namespace, publisherId: 'local-run' },
    });
    try {
      unavailableHive.episodic.record({
        type: 'failure',
        summary: 'local still works',
        createdAt: '2026-07-25T10:00:00.000Z',
      });
      expect(unavailableHive.episodic.count()).toBe(1);
    } finally {
      unavailableHive.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows encrypted brains to read peer lessons without publishing local plaintext', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-encrypted-peer-'));
    const namespace = hiveMindAgentTypeNamespace('coder');
    const hiveDbPath = join(root, 'hive.db');
    const publisher = new HiveMindStore(hiveDbPath);
    publisher.publish(namespace, 'peer-run', {
      kind: 'lesson',
      key: 'lesson:peer-timeout',
      status: 'approved',
      lesson: lessonValue('peer build timeout recovery'),
    });
    publisher.close();

    const encrypted = new SqliteBrain(join(root, 'encrypted.db'), undefined, {
      encryption: { enabled: true, key: 'hive-encrypted-peer-test-key' },
      hiveMind: { dbPath: hiveDbPath, namespace, publisherId: 'encrypted-run' },
    });
    try {
      expect(encrypted.learning.relevantLessons('peer build timeout')).toEqual([
        expect.objectContaining({ key: 'lesson:peer-timeout', source: 'peer' }),
      ]);
      recordCluster(encrypted, 'encrypted local secret');
      encrypted.learning.consolidate({ threshold: 3 });

      const observer = new HiveMindStore(hiveDbPath);
      try {
        expect(observer.poll(namespace).filter(({ publisherId }) => publisherId === 'encrypted-run'))
          .toEqual([]);
      } finally {
        observer.close();
      }
    } finally {
      encrypted.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function lessonValue(pattern: string) {
  return {
    kind: 'consolidated-lesson' as const,
    pattern,
    keywords: pattern.split(' '),
    occurrenceCount: 3,
    confidence: 0.65,
    evidenceEventIds: [1, 2, 3],
    firstSeenAt: '2026-07-25T10:00:00.000Z',
    lastSeenAt: '2026-07-25T10:02:00.000Z',
  };
}

function recordCluster(brain: SqliteBrain, pattern: string): void {
  for (let index = 0; index < 3; index += 1) {
    brain.episodic.record({
      type: 'failure',
      summary: `${pattern} failure ${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 25, 10, 0, index)).toISOString(),
    });
  }
}
