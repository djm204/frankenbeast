import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryOrchestrator } from '../../../src/orchestrator/memory-orchestrator.js';
import { EpisodicMemoryStore } from '../../../src/episodic/episodic-memory-store.js';
import { EpisodicLessonExtractor } from '../../../src/compression/episodic-lesson-extractor.js';
import { TruncationStrategy } from '../../../src/compression/truncation-strategy.js';
import type { ISemanticStore } from '../../../src/semantic/semantic-store-interface.js';
import type { SemanticChunk, EpisodicTrace } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

function makeFailTrace(projectId: string, taskId: string): EpisodicTrace {
  return {
    id: generateId(), type: 'episodic', projectId, status: 'failure',
    createdAt: Date.now(), taskId, input: { cmd: 'npm build' },
    output: { exitCode: 1, stderr: 'Cannot find module X' },
  };
}

// Fake semantic store that records what was upserted so we can assert on it
function makeCapturingSemanticStore(): ISemanticStore & { captured: SemanticChunk[] } {
  const captured: SemanticChunk[] = [];
  return {
    captured,
    upsert: vi.fn(async (chunks) => { captured.push(...chunks); }),
    search: vi.fn(async () => captured),
    delete: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  };
}

describe('MemoryOrchestrator — integration', () => {
  it('full round-trip: 21 failure traces → lesson extracted → searchable via frontload', async () => {
    const db = new Database(':memory:');
    const episodic = new EpisodicMemoryStore(db);
    const semantic = makeCapturingSemanticStore();
    const llm = { complete: vi.fn(async () => 'Always check module paths before building.') };
    const extractor = new EpisodicLessonExtractor(llm);
    const strategy = new TruncationStrategy();

    const orchestrator = new MemoryOrchestrator({
      episodic, semantic, strategy, extractor, projectId: 'proj-int',
    });

    // Record 21 failure traces — the 21st push crosses the threshold
    for (let i = 0; i < 21; i++) {
      await orchestrator.recordToolResult(makeFailTrace('proj-int', 'build-task'));
    }

    // Lesson should have been extracted and upserted to semantic store
    expect(semantic.captured).toHaveLength(1);
    expect(semantic.captured[0]?.source).toBe('lesson-learned');
    expect(semantic.captured[0]?.content).toBe('Always check module paths before building.');

    // The failure traces should be marked compressed in SQLite
    const stillFailed = episodic.queryFailed('proj-int');
    expect(stillFailed).toHaveLength(0);

    // frontload should surface the lesson in context
    await orchestrator.frontload('proj-int');
    const ctx = orchestrator.getContext();
    expect(ctx.semanticHints.some((h) => h.source === 'lesson-learned')).toBe(true);
  });

  it('working memory survives multiple record/prune cycles', async () => {
    const db = new Database(':memory:');
    const episodic = new EpisodicMemoryStore(db);
    const semantic = makeCapturingSemanticStore();
    const strategy = new TruncationStrategy();
    const extractor = new EpisodicLessonExtractor({ complete: vi.fn(async () => 'lesson') });

    const orchestrator = new MemoryOrchestrator({
      episodic, semantic, strategy, extractor, projectId: 'proj-int',
    });

    const { TokenBudget } = await import('../../../src/types/index.js');

    orchestrator.recordTurn({
      id: generateId(), type: 'working', projectId: 'proj-int',
      status: 'pending', createdAt: Date.now(), role: 'user',
      content: 'first turn', tokenCount: 60,
    });
    orchestrator.recordTurn({
      id: generateId(), type: 'working', projectId: 'proj-int',
      status: 'pending', createdAt: Date.now(), role: 'assistant',
      content: 'second turn', tokenCount: 60,
    });

    // Prune with a budget of 100 — should compress 2 turns (total 120 > 85%)
    await orchestrator.pruneContext(new TokenBudget(100, 0));

    const ctx = orchestrator.getContext();
    // After pruning, working memory should have a summary turn
    expect(ctx.turns.length).toBeLessThan(2);
  });
});
