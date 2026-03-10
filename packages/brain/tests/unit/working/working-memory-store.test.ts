import { describe, it, expect, vi } from 'vitest';
import { WorkingMemoryStore } from '../../../src/working/working-memory-store.js';
import type { WorkingTurn } from '../../../src/types/index.js';
import type { ICompressionStrategy } from '../../../src/working/compression-strategy.js';
import { TokenBudget } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTurn(overrides: Partial<WorkingTurn> = {}): WorkingTurn {
  return {
    id: '01J0000000000000000000000A',
    type: 'working',
    projectId: 'test-project',
    status: 'pending',
    createdAt: Date.now(),
    role: 'user',
    content: 'hello',
    tokenCount: 10,
    ...overrides,
  };
}

function makeStore(strategy?: ICompressionStrategy): WorkingMemoryStore {
  const noop: ICompressionStrategy = {
    compress: vi.fn().mockResolvedValue({ summary: makeTurn({ tokenCount: 5 }), droppedCount: 1 }),
  };
  return new WorkingMemoryStore(strategy ?? noop);
}

// ---------------------------------------------------------------------------
// push / snapshot / clear
// ---------------------------------------------------------------------------

describe('WorkingMemoryStore — push / snapshot / clear', () => {
  it('snapshot() returns empty array when nothing pushed', () => {
    const store = makeStore();
    expect(store.snapshot()).toEqual([]);
  });

  it('push() appends a turn', () => {
    const store = makeStore();
    const turn = makeTurn();
    store.push(turn);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toEqual(turn);
  });

  it('snapshot() returns turns in insertion order', () => {
    const store = makeStore();
    const t1 = makeTurn({ id: 'A', content: 'first', createdAt: 1 });
    const t2 = makeTurn({ id: 'B', content: 'second', createdAt: 2 });
    const t3 = makeTurn({ id: 'C', content: 'third', createdAt: 3 });
    store.push(t1);
    store.push(t2);
    store.push(t3);
    const snap = store.snapshot();
    expect(snap.map((t) => t.content)).toEqual(['first', 'second', 'third']);
  });

  it('clear() empties the store', () => {
    const store = makeStore();
    store.push(makeTurn());
    store.clear();
    expect(store.snapshot()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Token counting
// ---------------------------------------------------------------------------

describe('WorkingMemoryStore — token counting', () => {
  it('getTokenCount() returns 0 on empty store', () => {
    expect(makeStore().getTokenCount()).toBe(0);
  });

  it('getTokenCount() sums tokenCount of all turns', () => {
    const store = makeStore();
    store.push(makeTurn({ id: 'A', tokenCount: 10 }));
    store.push(makeTurn({ id: 'B', tokenCount: 25 }));
    expect(store.getTokenCount()).toBe(35);
  });

  it('getTokenCount() decreases after clear()', () => {
    const store = makeStore();
    store.push(makeTurn({ tokenCount: 50 }));
    store.clear();
    expect(store.getTokenCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// prune() — no-op when under budget
// ---------------------------------------------------------------------------

describe('WorkingMemoryStore — prune (below threshold)', () => {
  it('does not call strategy when tokenCount is below 85% of budget', async () => {
    const strategy: ICompressionStrategy = { compress: vi.fn() };
    const store = new WorkingMemoryStore(strategy);
    store.push(makeTurn({ id: 'A', tokenCount: 84 })); // 84% of 100
    await store.prune(new TokenBudget(100, 0));
    expect(strategy.compress).not.toHaveBeenCalled();
  });

  it('does not call strategy when store is empty', async () => {
    const strategy: ICompressionStrategy = { compress: vi.fn() };
    const store = new WorkingMemoryStore(strategy);
    await store.prune(new TokenBudget(1000, 0));
    expect(strategy.compress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// prune() — triggers compression at 85% threshold
// ---------------------------------------------------------------------------

describe('WorkingMemoryStore — prune (compression triggered)', () => {
  it('calls strategy when tokenCount exceeds 85% of budget', async () => {
    const summary = makeTurn({ id: 'SUMMARY', tokenCount: 5, content: 'summary' });
    const strategy: ICompressionStrategy = {
      compress: vi.fn().mockResolvedValue({ summary, droppedCount: 2 }),
    };
    const store = new WorkingMemoryStore(strategy);
    store.push(makeTurn({ id: 'A', tokenCount: 50 }));
    store.push(makeTurn({ id: 'B', tokenCount: 36 })); // total 86 > 85% of 100

    await store.prune(new TokenBudget(100, 0));

    expect(strategy.compress).toHaveBeenCalledOnce();
  });

  it('replaces compressed turns with the summary turn', async () => {
    const summary = makeTurn({ id: 'SUMMARY', tokenCount: 3, content: 'compressed summary' });
    const strategy: ICompressionStrategy = {
      compress: vi.fn().mockResolvedValue({ summary, droppedCount: 2 }),
    };
    const store = new WorkingMemoryStore(strategy);
    store.push(makeTurn({ id: 'A', tokenCount: 50 }));
    store.push(makeTurn({ id: 'B', tokenCount: 36 }));

    await store.prune(new TokenBudget(100, 0));

    const snap = store.snapshot();
    expect(snap.some((t) => t.id === 'SUMMARY')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prune() — preservation rules
// ---------------------------------------------------------------------------

describe('WorkingMemoryStore — prune (preservation rules)', () => {
  it('always preserves pinned turns', async () => {
    const summary = makeTurn({ id: 'SUMMARY', tokenCount: 1 });
    const strategy: ICompressionStrategy = {
      compress: vi.fn().mockResolvedValue({ summary, droppedCount: 1 }),
    };
    const store = new WorkingMemoryStore(strategy);
    const pinned = makeTurn({ id: 'PINNED', tokenCount: 50, pinned: true });
    store.push(pinned);
    store.push(makeTurn({ id: 'B', tokenCount: 40 }));

    await store.prune(new TokenBudget(100, 0));

    const snap = store.snapshot();
    expect(snap.some((t) => t.id === 'PINNED')).toBe(true);
  });

  it('always preserves the most recent Plan turn (role=assistant, content starts with [Plan])', async () => {
    const summary = makeTurn({ id: 'SUMMARY', tokenCount: 1 });
    const strategy: ICompressionStrategy = {
      compress: vi.fn().mockResolvedValue({ summary, droppedCount: 1 }),
    };
    const store = new WorkingMemoryStore(strategy);
    const plan = makeTurn({ id: 'PLAN', tokenCount: 30, role: 'assistant', content: '[Plan] do stuff' });
    store.push(makeTurn({ id: 'OLD', tokenCount: 30 }));
    store.push(plan);
    store.push(makeTurn({ id: 'FILLER', tokenCount: 30 }));

    await store.prune(new TokenBudget(100, 0));

    const snap = store.snapshot();
    expect(snap.some((t) => t.id === 'PLAN')).toBe(true);
  });

  it('always preserves the most recent tool turn', async () => {
    const summary = makeTurn({ id: 'SUMMARY', tokenCount: 1 });
    const strategy: ICompressionStrategy = {
      compress: vi.fn().mockResolvedValue({ summary, droppedCount: 1 }),
    };
    const store = new WorkingMemoryStore(strategy);
    const toolTurn = makeTurn({ id: 'TOOL', tokenCount: 30, role: 'tool' });
    store.push(makeTurn({ id: 'OLD', tokenCount: 30 }));
    store.push(toolTurn);
    store.push(makeTurn({ id: 'FILLER', tokenCount: 30 }));

    await store.prune(new TokenBudget(100, 0));

    const snap = store.snapshot();
    expect(snap.some((t) => t.id === 'TOOL')).toBe(true);
  });

  it('does not call strategy when all turns are preserved (no candidates)', async () => {
    const strategy: ICompressionStrategy = { compress: vi.fn() };
    const store = new WorkingMemoryStore(strategy);
    // Both turns are pinned — partitionForPruning yields zero candidates
    store.push(makeTurn({ id: 'A', tokenCount: 50, pinned: true }));
    store.push(makeTurn({ id: 'B', tokenCount: 40, pinned: true }));

    await store.prune(new TokenBudget(100, 0));

    expect(strategy.compress).not.toHaveBeenCalled();
  });

  it('passes only non-preserved (candidate) turns to the compression strategy', async () => {
    const summary = makeTurn({ id: 'SUMMARY', tokenCount: 1 });
    const strategy: ICompressionStrategy = {
      compress: vi.fn().mockResolvedValue({ summary, droppedCount: 1 }),
    };
    const store = new WorkingMemoryStore(strategy);
    const pinned = makeTurn({ id: 'PINNED', tokenCount: 10, pinned: true });
    const candidate = makeTurn({ id: 'CAND', tokenCount: 80 });
    store.push(pinned);
    store.push(candidate);

    await store.prune(new TokenBudget(100, 0));

    const compressCall = vi.mocked(strategy.compress).mock.calls[0];
    const passedTurns = compressCall?.[0] ?? [];
    expect(passedTurns.every((t: WorkingTurn) => t.id !== 'PINNED')).toBe(true);
    expect(passedTurns.some((t: WorkingTurn) => t.id === 'CAND')).toBe(true);
  });
});
