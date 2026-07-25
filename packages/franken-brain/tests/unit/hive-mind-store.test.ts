import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
