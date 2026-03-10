import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { EpisodicMemoryStore } from '../../../src/episodic/episodic-memory-store.js';
import { generateId } from '../../../src/types/index.js';
import type { EpisodicTrace } from '../../../src/types/index.js';

function makeTrace(overrides: Partial<EpisodicTrace> = {}): EpisodicTrace {
  return {
    id: generateId(),
    type: 'episodic',
    projectId: 'proj-integration',
    status: 'success',
    createdAt: Date.now(),
    taskId: 'task-int-1',
    input: { cmd: 'build' },
    output: { exitCode: 0 },
    ...overrides,
  };
}

describe('EpisodicMemoryStore — integration', () => {
  it('persists traces across store re-instantiation (shared db handle)', () => {
    // Simulates a process restart using the same :memory: db reference.
    // In production this would be a file-based db.
    const db = new Database(':memory:');

    const store1 = new EpisodicMemoryStore(db);
    const trace = makeTrace();
    store1.record(trace);

    // Instantiate a second store with the same db handle
    const store2 = new EpisodicMemoryStore(db);
    const results = store2.query(trace.taskId);

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(trace.id);
  });

  it('migration is idempotent — running twice does not throw', () => {
    const db = new Database(':memory:');
    expect(() => {
      new EpisodicMemoryStore(db);
      new EpisodicMemoryStore(db); // second construction re-runs migration
    }).not.toThrow();
  });

  it('full round-trip: record failure → queryFailed → markCompressed → no longer in failures', () => {
    const db = new Database(':memory:');
    const store = new EpisodicMemoryStore(db);

    const failTrace = makeTrace({ status: 'failure', taskId: 'failing-task' });
    store.record(failTrace);

    const beforeCompress = store.queryFailed('proj-integration');
    expect(beforeCompress.some((t) => t.id === failTrace.id)).toBe(true);

    store.markCompressed([failTrace.id]);

    const afterCompress = store.queryFailed('proj-integration');
    expect(afterCompress.some((t) => t.id === failTrace.id)).toBe(false);
  });
});
