import { beforeEach, describe, expect, it, vi } from 'vitest';

const { databaseInstances, brainInstances } = vi.hoisted(() => {
  const databaseInstances: Array<{
    pragma: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    options: unknown;
  }> = [];
  const brainInstances: Array<{
    working: {
      restore: ReturnType<typeof vi.fn>;
      snapshot: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      has: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    episodic: {
      recall: ReturnType<typeof vi.fn>;
      recent: ReturnType<typeof vi.fn>;
      record: ReturnType<typeof vi.fn>;
    };
    flush: ReturnType<typeof vi.fn>;
  }> = [];
  return { databaseInstances, brainInstances };
});

vi.mock('better-sqlite3', () => ({
  default: vi.fn(function MockDatabase(this: unknown, _dbPath: string, options?: unknown) {
    const db = {
      pragma: vi.fn(),
      prepare: vi.fn(() => ({ all: vi.fn(() => []) })),
      close: vi.fn(),
      options,
    };
    databaseInstances.push(db);
    Object.assign(this as object, db);
  }),
}));

vi.mock('@franken/brain', () => ({
  SqliteBrain: vi.fn(function MockSqliteBrain(this: unknown) {
    const brain = {
      working: {
        restore: vi.fn(),
        snapshot: vi.fn(() => ({ 'task-1': 'working entry' })),
        set: vi.fn(),
        has: vi.fn(() => false),
        delete: vi.fn(),
      },
      episodic: {
        recall: vi.fn(() => [{ id: 'evt-1', summary: 'episode summary', createdAt: '2026-07-06T00:00:00.000Z' }]),
        recent: vi.fn(() => []),
        record: vi.fn(),
      },
      flush: vi.fn(),
    };
    brainInstances.push(brain);
    Object.assign(this as object, brain);
  }),
}));

import { createBrainAdapter } from './brain-adapter.js';

describe('createBrainAdapter', () => {
  beforeEach(() => {
    databaseInstances.length = 0;
    brainInstances.length = 0;
    vi.clearAllMocks();
  });

  it('configures WAL and a busy timeout on the adapter read connection before rehydrating memory', () => {
    createBrainAdapter('/tmp/beast.db');

    expect(databaseInstances).toHaveLength(1);
    const readDb = databaseInstances[0];
    expect(readDb.options).toBeUndefined();
    expect(readDb.pragma).toHaveBeenNthCalledWith(1, 'journal_mode = WAL');
    expect(readDb.pragma).toHaveBeenNthCalledWith(2, 'busy_timeout = 5000');
    expect(readDb.prepare).toHaveBeenCalledWith('SELECT key, value FROM working_memory');
    expect(readDb.close).toHaveBeenCalledOnce();
  });

  it('stores and queries only supported memory types', async () => {
    const brain = createBrainAdapter('/tmp/beast.db');
    await brain.store({ key: 'task-1', value: 'working entry', type: 'working' });
    await brain.store({ key: 'evt-1', value: 'episode summary', type: 'episodic' });

    const mockBrain = brainInstances[0];
    expect(mockBrain.working.set).toHaveBeenCalledWith('task-1', 'working entry');
    expect(mockBrain.flush).toHaveBeenCalledOnce();
    expect(mockBrain.episodic.record).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'evt-1: episode summary' }),
    );

    const workingResult = await brain.query({ query: 'task', type: 'working', limit: 5 });
    expect(workingResult.some((row) => row.key === 'task-1' && row.type === 'working')).toBe(true);

    const episodicResult = await brain.query({ query: 'episode', type: 'episodic', limit: 5 });
    expect(episodicResult.some((row) => row.type === 'episodic')).toBe(true);
  });

  it('rejects unsafe query limits before reading memory', async () => {
    const brain = createBrainAdapter('/tmp/beast.db');
    const mockBrain = brainInstances[0];

    for (const invalidLimit of [NaN, Infinity, 0, -1, 1.5, 1001, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        brain.query({ query: 'task', limit: invalidLimit as number }),
      ).rejects.toThrow('limit must be a positive integer between 1 and 1000');
    }

    expect(mockBrain.episodic.recall).not.toHaveBeenCalled();
    expect(mockBrain.working.snapshot).not.toHaveBeenCalled();
  });

  it('rejects unsupported memory type', async () => {
    const brain = createBrainAdapter('/tmp/beast.db');

    await expect(brain.store({ key: 'k', value: 'v', type: 'recovery' as string })).rejects.toThrow(
      'Unsupported memory type: recovery. Supported types: working, episodic',
    );

    await expect(brain.query({ query: 'any', type: 'recovery' as string, limit: 10 })).rejects.toThrow(
      'Unsupported memory type: recovery. Supported types: working, episodic',
    );
  });
});
