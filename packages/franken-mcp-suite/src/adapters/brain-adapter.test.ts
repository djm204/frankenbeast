import { beforeEach, describe, expect, it, vi } from 'vitest';

const { databaseInstances } = vi.hoisted(() => {
  const databaseInstances: Array<{
    pragma: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    options: unknown;
  }> = [];
  return { databaseInstances };
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
    Object.assign(this as object, {
      working: {
        restore: vi.fn(),
        snapshot: vi.fn(() => ({})),
        set: vi.fn(),
        has: vi.fn(() => false),
        delete: vi.fn(),
      },
      episodic: {
        recall: vi.fn(() => []),
        recent: vi.fn(() => []),
        record: vi.fn(),
      },
      flush: vi.fn(),
    });
  }),
}));

import { createBrainAdapter } from './brain-adapter.js';

describe('createBrainAdapter', () => {
  beforeEach(() => {
    databaseInstances.length = 0;
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
});
