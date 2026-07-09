import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrainSnapshotSchema } from '@franken/types';
import type { EpisodicEvent, ExecutionState, BrainSnapshot } from '@franken/types';
import {
  SqliteBrain,
  WorkingMemoryLimitError,
  DEFAULT_WORKING_MEMORY_LIMITS,
} from '../../src/sqlite-brain.js';

describe('SqliteBrain', () => {
  let brain: SqliteBrain;

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

    it('delete() removes a key and returns true', () => {
      brain.working.set('key', 'val');
      expect(brain.working.delete('key')).toBe(true);
      expect(brain.working.has('key')).toBe(false);
    });

    it('delete() returns false for non-existent key', () => {
      expect(brain.working.delete('nope')).toBe(false);
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
      expect(() => bounded.working.set('c', 3)).toThrow(WorkingMemoryLimitError);
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
      expect(() => bounded.working.set('big', 'x'.repeat(100))).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('rejects writes that would exceed maxTotalBytes', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      bounded.working.set('a', 'x'.repeat(10));
      expect(() => bounded.working.set('b', 'y'.repeat(20))).toThrow(WorkingMemoryLimitError);
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
      expect(() => bounded.working.restore({ a: 1, b: 2 })).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('tracks usage as entries are added, counting key and value bytes', () => {
      brain.working.set('a', 'hello');
      const usage = brain.working.usage();
      expect(usage.entries).toBe(1);
      expect(usage.totalBytes).toBe('a'.length + JSON.stringify('hello').length);
    });

    it('counts key bytes against the byte budget', () => {
      const bounded = new SqliteBrain(':memory:', { maxTotalBytes: 30 });
      expect(() => bounded.working.set('k'.repeat(40), 1)).toThrow(WorkingMemoryLimitError);
      bounded.close();
    });

    it('rejects values that are not JSON-serializable', () => {
      expect(() => brain.working.set('fn', () => 'hidden closure')).toThrow(
        WorkingMemoryLimitError,
      );
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
      expect(() => SqliteBrain.hydrate(snapshot, ':memory:', { maxEntries: 10 })).toThrow(
        WorkingMemoryLimitError,
      );
      const hydrated = SqliteBrain.hydrate(snapshot, ':memory:', { maxEntries: 20_000 });
      expect(hydrated.working.keys()).toHaveLength(15);
      hydrated.close();
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
  });

  describe('flush()', () => {
    it('serialize() calls flush to persist working memory to SQLite', () => {
      brain.working.set('task', 'test-flush');
      const snapshot = brain.serialize();
      // Working memory data is in the snapshot
      expect(snapshot.working).toEqual({ task: 'test-flush' });
    });
  });

  describe('episodic memory', () => {
    const makeEvent = (overrides: Partial<EpisodicEvent> = {}): EpisodicEvent => ({
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
      brain.episodic.record(makeEvent({ summary: 'first', createdAt: '2026-03-18T10:00:00Z' }));
      brain.episodic.record(makeEvent({ summary: 'second', createdAt: '2026-03-18T10:05:00Z' }));
      brain.episodic.record(makeEvent({ summary: 'third', createdAt: '2026-03-18T10:10:00Z' }));

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
      expect(failures.every(e => e.type === 'failure')).toBe(true);
    });

    it('count() returns total events', () => {
      brain.episodic.record(makeEvent());
      brain.episodic.record(makeEvent());
      brain.episodic.record(makeEvent());
      expect(brain.episodic.count()).toBe(3);
    });

    it('records events with optional fields', () => {
      brain.episodic.record(makeEvent({
        step: 'build',
        details: { file: 'auth.ts', line: 42 },
      }));
      const events = brain.episodic.recent(1);
      expect(events[0]!.step).toBe('build');
      expect(events[0]!.details).toEqual({ file: 'auth.ts', line: 42 });
    });

    it('recall() finds matching events by keyword', () => {
      brain.episodic.record(makeEvent({ summary: 'first test event' }));
      brain.episodic.record(makeEvent({ summary: 'second test event' }));
      const results = brain.episodic.recall('test event', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('recovery memory', () => {
    const makeState = (overrides: Partial<ExecutionState> = {}): ExecutionState => ({
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
      const row = (brain as unknown as { db: { prepare: (sql: string) => { get: (key: string) => { value: string } | undefined } } })
        .db.prepare('SELECT value FROM working_memory WHERE key = ?').get('key1');
      expect(row?.value).toBe('"value1"');
    });

    it('checkpoint() rolls back working memory flush when checkpoint insert fails', () => {
      const db = (brain as unknown as {
        db: {
          exec: (sql: string) => void;
          prepare: (sql: string) => { get: (key: string) => { value: string } | undefined };
        };
      }).db;

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

      const row = db.prepare('SELECT value FROM working_memory WHERE key = ?').get('key1');
      expect(row).toBeUndefined();
    });

    it('lastCheckpoint() returns most recent', () => {
      brain.recovery.checkpoint(makeState({ step: 1 }));
      brain.recovery.checkpoint(makeState({ step: 2 }));
      brain.recovery.checkpoint(makeState({ step: 3 }));

      const last = brain.recovery.lastCheckpoint();
      expect(last).not.toBeNull();
      expect(last!.step).toBe(3);
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
      brain.recovery.checkpoint(makeState({ timestamp: '2026-03-18T10:00:00Z' }));
      brain.recovery.checkpoint(makeState({ timestamp: '2026-03-18T10:05:00Z' }));

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
      expect(brain2.episodic.recentFailures(1)[0]!.summary).toBe('TypeScript error');
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
      const tmpBrain = new SqliteBrain('/tmp/test-brain.db');
      tmpBrain.working.set('test', 'value');
      expect(tmpBrain.working.get('test')).toBe('value');
      tmpBrain.close();
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
        (first as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
          .db.prepare('INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)')
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
        expect(Object.entries(reopened.working.snapshot())).toEqual([['__proto__', 'safe value']]);
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

        const hydrated = SqliteBrain.hydrate(snapshot, dbPath, { maxEntries: 1 });
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
