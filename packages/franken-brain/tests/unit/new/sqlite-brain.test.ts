import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrainSnapshotSchema } from '@franken/types';
import type { EpisodicEvent, ExecutionState, BrainSnapshot } from '@franken/types';
import { SqliteBrain } from '../../../src/new/sqlite-brain.js';

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

    it('recall() returns results (placeholder delegates to recent)', () => {
      brain.episodic.record(makeEvent({ summary: 'first' }));
      brain.episodic.record(makeEvent({ summary: 'second' }));
      const results = brain.episodic.recall('anything', 1);
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

    it('defaults to in-memory database', () => {
      const memBrain = new SqliteBrain();
      memBrain.working.set('test', true);
      expect(memBrain.working.get('test')).toBe(true);
      memBrain.close();
    });
  });
});
