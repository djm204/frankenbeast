import { describe, it, expect, vi } from 'vitest';
import { PiiGuardedEpisodicStore } from '../../../src/pii/pii-guarded-episodic-store.js';
import { PiiGuardedSemanticStore } from '../../../src/pii/pii-guarded-semantic-store.js';
import { PiiDetectedError } from '../../../src/pii/pii-guard.js';
import type { IPiiScanner, ScanResult } from '../../../src/pii/pii-scanner-interface.js';
import type { IEpisodicStore } from '../../../src/episodic/episodic-store-interface.js';
import type { ISemanticStore } from '../../../src/semantic/semantic-store-interface.js';
import type { EpisodicTrace, SemanticChunk } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

function makeScanner(result: ScanResult): IPiiScanner {
  return { scan: vi.fn(async () => result) };
}

function makeTrace(): EpisodicTrace {
  return {
    id: generateId(), type: 'episodic', projectId: 'p', status: 'success',
    createdAt: Date.now(), taskId: 'task-1', input: {}, output: {},
  };
}

function makeChunk(): SemanticChunk {
  return {
    id: generateId(), type: 'semantic', projectId: 'p', status: 'success',
    createdAt: Date.now(), source: 'adr/ADR-001', content: 'safe content',
  };
}

function makeInnerEpisodic(): IEpisodicStore {
  return {
    record: vi.fn(() => 'id'),
    query: vi.fn(() => []),
    queryFailed: vi.fn(() => []),
    markCompressed: vi.fn(),
    count: vi.fn(() => 0),
  };
}

function makeInnerSemantic(): ISemanticStore {
  return {
    upsert: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// PiiGuardedEpisodicStore
// ---------------------------------------------------------------------------

describe('PiiGuardedEpisodicStore', () => {
  it('delegates record() to inner store when scanner returns clean', async () => {
    const inner = makeInnerEpisodic();
    const store = new PiiGuardedEpisodicStore(inner, makeScanner({ clean: true }));
    const trace = makeTrace();
    await store.record(trace);
    expect(inner.record).toHaveBeenCalledWith(trace);
  });

  it('does NOT call inner store when PII is detected in block mode', async () => {
    const inner = makeInnerEpisodic();
    const store = new PiiGuardedEpisodicStore(
      inner,
      makeScanner({ clean: false, mode: 'block', fields: ['email'] }),
    );
    await expect(store.record(makeTrace())).rejects.toThrow(PiiDetectedError);
    expect(inner.record).not.toHaveBeenCalled();
  });

  it('passes through read-only methods (query, count, etc.) without scanning', () => {
    const inner = makeInnerEpisodic();
    const scanner = makeScanner({ clean: true });
    const store = new PiiGuardedEpisodicStore(inner, scanner);
    store.query('task-1');
    store.queryFailed('proj');
    store.count('proj', 'task-1');
    store.markCompressed(['id-1']);
    // Scan is not called for read-only operations
    expect(scanner.scan).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PiiGuardedSemanticStore
// ---------------------------------------------------------------------------

describe('PiiGuardedSemanticStore', () => {
  it('delegates upsert() to inner store when scanner returns clean', async () => {
    const inner = makeInnerSemantic();
    const store = new PiiGuardedSemanticStore(inner, makeScanner({ clean: true }));
    const chunks = [makeChunk()];
    await store.upsert(chunks);
    expect(inner.upsert).toHaveBeenCalledWith(chunks);
  });

  it('does NOT call inner store when PII is detected on upsert', async () => {
    const inner = makeInnerSemantic();
    const store = new PiiGuardedSemanticStore(
      inner,
      makeScanner({ clean: false, mode: 'block', fields: ['content'] }),
    );
    await expect(store.upsert([makeChunk()])).rejects.toThrow(PiiDetectedError);
    expect(inner.upsert).not.toHaveBeenCalled();
  });

  it('passes through search, delete, deleteCollection without scanning', async () => {
    const inner = makeInnerSemantic();
    const scanner = makeScanner({ clean: true });
    const store = new PiiGuardedSemanticStore(inner, scanner);
    await store.search('q', 3);
    await store.delete('id');
    await store.deleteCollection('proj');
    expect(scanner.scan).not.toHaveBeenCalled();
  });
});
