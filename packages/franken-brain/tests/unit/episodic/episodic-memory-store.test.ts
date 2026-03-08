import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EpisodicMemoryStore } from '../../../src/episodic/episodic-memory-store.js';
import type { EpisodicTrace } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrace(overrides: Partial<EpisodicTrace> = {}): EpisodicTrace {
  return {
    id: generateId(),
    type: 'episodic',
    projectId: 'proj-a',
    status: 'success',
    createdAt: Date.now(),
    taskId: 'task-1',
    input: { cmd: 'ls' },
    output: { exitCode: 0 },
    ...overrides,
  };
}

function makeStore(): EpisodicMemoryStore {
  // :memory: db — isolated per test via beforeEach construction
  const db = new Database(':memory:');
  return new EpisodicMemoryStore(db);
}

// ---------------------------------------------------------------------------
// record()
// ---------------------------------------------------------------------------

describe('EpisodicMemoryStore — record()', () => {
  let store: EpisodicMemoryStore;
  beforeEach(() => { store = makeStore(); });

  it('inserts a trace and returns its id', () => {
    const trace = makeTrace();
    const id = store.record(trace);
    expect(id).toBe(trace.id);
  });

  it('records multiple traces without conflict', () => {
    store.record(makeTrace({ id: generateId(), taskId: 'task-1' }));
    store.record(makeTrace({ id: generateId(), taskId: 'task-1' }));
    expect(store.count('proj-a', 'task-1')).toBe(2);
  });

  it('throws ValidationError when status is invalid', () => {
    const bad = { ...makeTrace(), status: 'broken' } as unknown as EpisodicTrace;
    expect(() => store.record(bad)).toThrow();
  });

  it('throws ValidationError when taskId is missing', () => {
    const bad = { ...makeTrace(), taskId: '' };
    expect(() => store.record(bad)).toThrow();
  });

  it('persists payload as JSON (input and output are stored)', () => {
    const trace = makeTrace({ input: { cmd: 'npm test' }, output: { exitCode: 1, stderr: 'oops' } });
    store.record(trace);
    const results = store.query('task-1');
    expect(results[0]?.input).toEqual({ cmd: 'npm test' });
    expect(results[0]?.output).toEqual({ exitCode: 1, stderr: 'oops' });
  });
});

// ---------------------------------------------------------------------------
// query()
// ---------------------------------------------------------------------------

describe('EpisodicMemoryStore — query()', () => {
  let store: EpisodicMemoryStore;
  beforeEach(() => { store = makeStore(); });

  it('returns empty array when no traces exist for a taskId', () => {
    expect(store.query('no-such-task')).toEqual([]);
  });

  it('returns all traces for a given taskId', () => {
    store.record(makeTrace({ id: generateId(), taskId: 'task-x' }));
    store.record(makeTrace({ id: generateId(), taskId: 'task-x' }));
    store.record(makeTrace({ id: generateId(), taskId: 'task-y' }));
    expect(store.query('task-x')).toHaveLength(2);
  });

  it('returns traces in descending recency order (newest first)', async () => {
    const older = makeTrace({ id: generateId(), taskId: 'task-z', createdAt: 1000 });
    const newer = makeTrace({ id: generateId(), taskId: 'task-z', createdAt: 2000 });
    store.record(older);
    store.record(newer);
    const results = store.query('task-z');
    expect(results[0]?.id).toBe(newer.id);
    expect(results[1]?.id).toBe(older.id);
  });

  it('filters by projectId when provided', () => {
    store.record(makeTrace({ id: generateId(), projectId: 'proj-a', taskId: 'task-1' }));
    store.record(makeTrace({ id: generateId(), projectId: 'proj-b', taskId: 'task-1' }));
    const results = store.query('task-1', 'proj-a');
    expect(results).toHaveLength(1);
    expect(results[0]?.projectId).toBe('proj-a');
  });
});

// ---------------------------------------------------------------------------
// queryFailed()
// ---------------------------------------------------------------------------

describe('EpisodicMemoryStore — queryFailed()', () => {
  let store: EpisodicMemoryStore;
  beforeEach(() => { store = makeStore(); });

  it('returns only failure traces for a project', () => {
    store.record(makeTrace({ id: generateId(), projectId: 'proj-a', status: 'failure' }));
    store.record(makeTrace({ id: generateId(), projectId: 'proj-a', status: 'success' }));
    store.record(makeTrace({ id: generateId(), projectId: 'proj-b', status: 'failure' }));
    const results = store.queryFailed('proj-a');
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('failure');
  });

  it('returns empty array when no failures exist', () => {
    store.record(makeTrace({ id: generateId(), status: 'success' }));
    expect(store.queryFailed('proj-a')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// markCompressed()
// ---------------------------------------------------------------------------

describe('EpisodicMemoryStore — markCompressed()', () => {
  let store: EpisodicMemoryStore;
  beforeEach(() => { store = makeStore(); });

  it('sets status to compressed for the given ids', () => {
    const t1 = makeTrace({ id: generateId() });
    const t2 = makeTrace({ id: generateId() });
    store.record(t1);
    store.record(t2);
    store.markCompressed([t1.id, t2.id]);
    const results = store.query('task-1');
    expect(results.every((r) => r.status === 'compressed')).toBe(true);
  });

  it('is a no-op for unknown ids (no error thrown)', () => {
    expect(() => store.markCompressed(['does-not-exist'])).not.toThrow();
  });

  it('only updates the specified ids, leaving others unchanged', () => {
    const t1 = makeTrace({ id: generateId() });
    const t2 = makeTrace({ id: generateId() });
    store.record(t1);
    store.record(t2);
    store.markCompressed([t1.id]);
    const results = store.query('task-1');
    const statuses = Object.fromEntries(results.map((r) => [r.id, r.status]));
    expect(statuses[t1.id]).toBe('compressed');
    expect(statuses[t2.id]).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// count()
// ---------------------------------------------------------------------------

describe('EpisodicMemoryStore — count()', () => {
  let store: EpisodicMemoryStore;
  beforeEach(() => { store = makeStore(); });

  it('returns 0 when no traces exist', () => {
    expect(store.count('proj-a', 'task-1')).toBe(0);
  });

  it('returns correct count for a (projectId, taskId) pair', () => {
    store.record(makeTrace({ id: generateId(), projectId: 'proj-a', taskId: 'task-1' }));
    store.record(makeTrace({ id: generateId(), projectId: 'proj-a', taskId: 'task-1' }));
    store.record(makeTrace({ id: generateId(), projectId: 'proj-b', taskId: 'task-1' }));
    expect(store.count('proj-a', 'task-1')).toBe(2);
  });
});
