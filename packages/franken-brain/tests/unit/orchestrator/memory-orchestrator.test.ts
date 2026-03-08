import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryOrchestrator } from '../../../src/orchestrator/memory-orchestrator.js';
import type { ICompressionStrategy } from '../../../src/working/compression-strategy.js';
import type { IEpisodicStore } from '../../../src/episodic/episodic-store-interface.js';
import type { ISemanticStore } from '../../../src/semantic/semantic-store-interface.js';
import type { EpisodicLessonExtractor } from '../../../src/compression/episodic-lesson-extractor.js';
import type { WorkingTurn, EpisodicTrace, SemanticChunk } from '../../../src/types/index.js';
import { TokenBudget, generateId } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Fake builders
// ---------------------------------------------------------------------------

function makeTurn(overrides: Partial<WorkingTurn> = {}): WorkingTurn {
  return {
    id: generateId(), type: 'working', projectId: 'proj', status: 'pending',
    createdAt: Date.now(), role: 'user', content: 'hello', tokenCount: 10,
    ...overrides,
  };
}

function makeTrace(overrides: Partial<EpisodicTrace> = {}): EpisodicTrace {
  return {
    id: generateId(), type: 'episodic', projectId: 'proj', status: 'success',
    createdAt: Date.now(), taskId: 'task-1', input: {}, output: {},
    ...overrides,
  };
}

function makeChunk(overrides: Partial<SemanticChunk> = {}): SemanticChunk {
  return {
    id: generateId(), type: 'semantic', projectId: 'proj', status: 'success',
    createdAt: Date.now(), source: 'adr/ADR-001', content: 'Use strict mode.',
    ...overrides,
  };
}

function makeEpisodicStore(traceCount = 0): IEpisodicStore {
  return {
    record: vi.fn(() => 'trace-id'),
    query: vi.fn(() => []),
    queryFailed: vi.fn(() => []),
    markCompressed: vi.fn(),
    count: vi.fn(() => traceCount),
  };
}

function makeSemanticStore(): ISemanticStore {
  return {
    upsert: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  };
}

function makeCompressionStrategy(): ICompressionStrategy {
  return {
    compress: vi.fn(async (turns) => ({
      summary: makeTurn({ id: 'SUMMARY', tokenCount: 5, content: 'summary' }),
      droppedCount: turns.length,
    })),
  };
}

function makeLessonExtractor(): EpisodicLessonExtractor {
  return {
    extract: vi.fn(async () => makeChunk({ source: 'lesson-learned' })),
  } as unknown as EpisodicLessonExtractor;
}

function makeOrchestrator(opts: {
  episodicCount?: number;
} = {}) {
  const episodic = makeEpisodicStore(opts.episodicCount ?? 0);
  const semantic = makeSemanticStore();
  const strategy = makeCompressionStrategy();
  const extractor = makeLessonExtractor();
  const orchestrator = new MemoryOrchestrator({ episodic, semantic, strategy, extractor, projectId: 'proj' });
  return { orchestrator, episodic, semantic, strategy, extractor };
}

// ---------------------------------------------------------------------------
// recordTurn()
// ---------------------------------------------------------------------------

describe('MemoryOrchestrator — recordTurn()', () => {
  it('pushes the turn into working memory', () => {
    const { orchestrator } = makeOrchestrator();
    const turn = makeTurn();
    orchestrator.recordTurn(turn);
    const snapshot = orchestrator.getContext().turns;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.id).toBe(turn.id);
  });

  it('accumulates multiple turns in insertion order', () => {
    const { orchestrator } = makeOrchestrator();
    const t1 = makeTurn({ id: 'A' });
    const t2 = makeTurn({ id: 'B' });
    orchestrator.recordTurn(t1);
    orchestrator.recordTurn(t2);
    expect(orchestrator.getContext().turns.map((t) => t.id)).toEqual(['A', 'B']);
  });
});

// ---------------------------------------------------------------------------
// recordToolResult()
// ---------------------------------------------------------------------------

describe('MemoryOrchestrator — recordToolResult()', () => {
  it('writes to EpisodicMemoryStore', () => {
    const { orchestrator, episodic } = makeOrchestrator();
    const trace = makeTrace();
    orchestrator.recordToolResult(trace);
    expect(episodic.record).toHaveBeenCalledWith(trace);
  });

  it('does NOT trigger lesson extraction when count <= 20', () => {
    const { orchestrator, extractor } = makeOrchestrator({ episodicCount: 5 });
    orchestrator.recordToolResult(makeTrace());
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('triggers lesson extraction when episodic count > 20', async () => {
    const { orchestrator, extractor, episodic } = makeOrchestrator({ episodicCount: 21 });
    // queryFailed returns some traces so extraction has data
    vi.mocked(episodic.queryFailed).mockReturnValue([makeTrace({ status: 'failure' })]);
    await orchestrator.recordToolResult(makeTrace());
    expect(extractor.extract).toHaveBeenCalled();
  });

  it('upserts the lesson into semantic store after extraction', async () => {
    const { orchestrator, episodic, semantic } = makeOrchestrator({ episodicCount: 21 });
    vi.mocked(episodic.queryFailed).mockReturnValue([makeTrace({ status: 'failure' })]);
    await orchestrator.recordToolResult(makeTrace());
    expect(semantic.upsert).toHaveBeenCalled();
    const upsertArg = vi.mocked(semantic.upsert).mock.calls[0]![0];
    expect(upsertArg[0]?.source).toBe('lesson-learned');
  });

  it('marks compressed traces after extraction', async () => {
    const { orchestrator, episodic } = makeOrchestrator({ episodicCount: 21 });
    const failTrace = makeTrace({ status: 'failure' });
    vi.mocked(episodic.queryFailed).mockReturnValue([failTrace]);
    await orchestrator.recordToolResult(makeTrace());
    expect(episodic.markCompressed).toHaveBeenCalledWith([failTrace.id]);
  });

  it('skips extraction when no failed traces exist (nothing to learn)', async () => {
    const { orchestrator, extractor, episodic } = makeOrchestrator({ episodicCount: 21 });
    vi.mocked(episodic.queryFailed).mockReturnValue([]); // no failures
    await orchestrator.recordToolResult(makeTrace());
    expect(extractor.extract).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pruneContext()
// ---------------------------------------------------------------------------

describe('MemoryOrchestrator — pruneContext()', () => {
  it('delegates to WorkingMemoryStore.prune()', async () => {
    const { orchestrator, strategy } = makeOrchestrator();
    // Push enough to trigger pressure (> 85% of budget=100)
    orchestrator.recordTurn(makeTurn({ tokenCount: 90 }));
    await orchestrator.pruneContext(new TokenBudget(100, 0));
    expect(strategy.compress).toHaveBeenCalled();
  });

  it('is a no-op on empty working memory', async () => {
    const { orchestrator, strategy } = makeOrchestrator();
    await orchestrator.pruneContext(new TokenBudget(1000, 0));
    expect(strategy.compress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('MemoryOrchestrator — search()', () => {
  it('delegates to SemanticMemoryStore.search()', async () => {
    const { orchestrator, semantic } = makeOrchestrator();
    await orchestrator.search('some query', 5);
    expect(semantic.search).toHaveBeenCalledWith('some query', 5, undefined);
  });

  it('passes filter through to semantic store', async () => {
    const { orchestrator, semantic } = makeOrchestrator();
    await orchestrator.search('q', 3, { projectId: 'proj' });
    expect(semantic.search).toHaveBeenCalledWith('q', 3, { projectId: 'proj' });
  });
});

// ---------------------------------------------------------------------------
// frontload()
// ---------------------------------------------------------------------------

describe('MemoryOrchestrator — frontload()', () => {
  it('loads semantic chunks for the project into context', async () => {
    const { orchestrator, semantic } = makeOrchestrator();
    const chunk = makeChunk();
    vi.mocked(semantic.search).mockResolvedValue([chunk]);

    await orchestrator.frontload('proj');

    const ctx = orchestrator.getContext();
    expect(ctx.semanticHints).toHaveLength(1);
    expect(ctx.semanticHints[0]?.id).toBe(chunk.id);
  });

  it('replaces any previous semantic hints on repeated calls', async () => {
    const { orchestrator, semantic } = makeOrchestrator();
    vi.mocked(semantic.search).mockResolvedValueOnce([makeChunk({ id: 'OLD' })]);
    await orchestrator.frontload('proj');
    vi.mocked(semantic.search).mockResolvedValueOnce([makeChunk({ id: 'NEW' })]);
    await orchestrator.frontload('proj');
    const ctx = orchestrator.getContext();
    expect(ctx.semanticHints.map((h) => h.id)).toEqual(['NEW']);
  });
});

// ---------------------------------------------------------------------------
// getContext()
// ---------------------------------------------------------------------------

describe('MemoryOrchestrator — getContext()', () => {
  it('returns working turns and semantic hints', () => {
    const { orchestrator } = makeOrchestrator();
    const ctx = orchestrator.getContext();
    expect(ctx).toHaveProperty('turns');
    expect(ctx).toHaveProperty('semanticHints');
  });

  it('turns reflect current working memory snapshot', () => {
    const { orchestrator } = makeOrchestrator();
    orchestrator.recordTurn(makeTurn({ id: 'T1' }));
    expect(orchestrator.getContext().turns[0]?.id).toBe('T1');
  });
});
