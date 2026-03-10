import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticMemoryStore } from '../../../src/semantic/semantic-memory-store.js';
import type { IChromaClient, IChromaCollection, QueryResult } from '../../../src/semantic/chroma-client-interface.js';
import type { IEmbeddingProvider } from '../../../src/semantic/embedding-provider-interface.js';
import type { SemanticChunk } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunk(overrides: Partial<SemanticChunk> = {}): SemanticChunk {
  return {
    id: generateId(),
    type: 'semantic',
    projectId: 'proj-a',
    status: 'success',
    createdAt: Date.now(),
    source: 'adr/ADR-001',
    content: 'Use TypeScript strict mode.',
    ...overrides,
  };
}

function makeEmbedding(seed = 0): number[] {
  return Array.from({ length: 4 }, (_, i) => seed + i * 0.1);
}

function makeFakeCollection(): IChromaCollection {
  const store = new Map<string, { embedding: number[]; document: string; metadata: Record<string, unknown> }>();

  return {
    upsert: vi.fn(async ({ ids, embeddings, documents, metadatas }) => {
      for (let i = 0; i < ids.length; i++) {
        store.set(ids[i]!, {
          embedding: embeddings[i]!,
          document: documents[i]!,
          metadata: metadatas[i]!,
        });
      }
    }),
    query: vi.fn(async ({ queryEmbeddings, nResults, where }) => {
      let entries = [...store.entries()];
      if (where?.['projectId']) {
        entries = entries.filter(([, v]) => v.metadata['projectId'] === where['projectId']);
      }
      const sliced = entries.slice(0, nResults);
      return {
        ids: [sliced.map(([id]) => id)],
        documents: [sliced.map(([, v]) => v.document)],
        metadatas: [sliced.map(([, v]) => v.metadata)],
        distances: [sliced.map(() => 0.1)],
      } as QueryResult;
    }),
    delete: vi.fn(async () => {}),
  };
}

function makeFakeChromaClient(collection: IChromaCollection): IChromaClient {
  return {
    getOrCreateCollection: vi.fn(async () => collection),
    deleteCollection: vi.fn(async () => {}),
  };
}

function makeFakeEmbeddingProvider(seed = 0): IEmbeddingProvider {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map((_, i) => makeEmbedding(seed + i))),
  };
}

function makeStore(
  collection = makeFakeCollection(),
  embedder = makeFakeEmbeddingProvider(),
) {
  const client = makeFakeChromaClient(collection);
  return new SemanticMemoryStore(client, embedder);
}

// ---------------------------------------------------------------------------
// upsert()
// ---------------------------------------------------------------------------

describe('SemanticMemoryStore — upsert()', () => {
  it('calls IEmbeddingProvider with the chunk content', async () => {
    const embedder = makeFakeEmbeddingProvider();
    const store = makeStore(makeFakeCollection(), embedder);
    const chunk = makeChunk({ content: 'hello world' });

    await store.upsert([chunk]);

    expect(embedder.embed).toHaveBeenCalledWith(['hello world']);
  });

  it('calls collection.upsert with id, embedding, document, and metadata', async () => {
    const collection = makeFakeCollection();
    const store = makeStore(collection);
    const chunk = makeChunk({ id: 'test-id', content: 'some content' });

    await store.upsert([chunk]);

    expect(collection.upsert).toHaveBeenCalledOnce();
    const call = vi.mocked(collection.upsert).mock.calls[0]![0];
    expect(call.ids).toContain('test-id');
    expect(call.documents).toContain('some content');
    expect(call.embeddings[0]).toHaveLength(4);
  });

  it('stores projectId in metadata for later filtering', async () => {
    const collection = makeFakeCollection();
    const store = makeStore(collection);
    const chunk = makeChunk({ projectId: 'my-project' });

    await store.upsert([chunk]);

    const call = vi.mocked(collection.upsert).mock.calls[0]![0];
    expect(call.metadatas[0]).toMatchObject({ projectId: 'my-project' });
  });

  it('upserts multiple chunks in a single batch call', async () => {
    const collection = makeFakeCollection();
    const embedder = makeFakeEmbeddingProvider();
    const store = makeStore(collection, embedder);
    const chunks = [makeChunk(), makeChunk(), makeChunk()];

    await store.upsert(chunks);

    expect(embedder.embed).toHaveBeenCalledOnce();
    expect(vi.mocked(embedder.embed).mock.calls[0]![0]).toHaveLength(3);
    expect(vi.mocked(collection.upsert).mock.calls[0]![0].ids).toHaveLength(3);
  });

  it('is a no-op for an empty array', async () => {
    const collection = makeFakeCollection();
    const store = makeStore(collection);

    await store.upsert([]);

    expect(collection.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('SemanticMemoryStore — search()', () => {
  let collection: IChromaCollection;
  let store: SemanticMemoryStore;

  beforeEach(async () => {
    collection = makeFakeCollection();
    store = makeStore(collection);
    await store.upsert([
      makeChunk({ id: 'A', projectId: 'proj-a', content: 'alpha' }),
      makeChunk({ id: 'B', projectId: 'proj-a', content: 'beta' }),
      makeChunk({ id: 'C', projectId: 'proj-b', content: 'gamma' }),
    ]);
  });

  it('returns up to topK results', async () => {
    const results = await store.search('query', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('calls IEmbeddingProvider to embed the query string', async () => {
    const embedder = makeFakeEmbeddingProvider();
    const s = makeStore(makeFakeCollection(), embedder);
    await s.search('find me', 3);
    expect(embedder.embed).toHaveBeenCalledWith(['find me']);
  });

  it('returns [] when the embedder returns an empty array (defensive guard)', async () => {
    const embedder: IEmbeddingProvider = { embed: vi.fn(async () => []) };
    const s = makeStore(makeFakeCollection(), embedder);
    const results = await s.search('anything', 3);
    expect(results).toEqual([]);
  });

  it('returns [] when the collection query result has no rows (empty ids[0])', async () => {
    const emptyCollection: IChromaCollection = {
      upsert: vi.fn(async () => {}),
      query: vi.fn(async () => ({ ids: [], documents: [], metadatas: [], distances: [] })),
      delete: vi.fn(async () => {}),
    };
    const s = makeStore(emptyCollection);
    const results = await s.search('anything', 3);
    expect(results).toEqual([]);
  });

  it('filters by projectId when a MetadataFilter is provided', async () => {
    const results = await store.search('query', 10, { projectId: 'proj-a' });
    expect(results.every((r) => r.projectId === 'proj-a')).toBe(true);
  });

  it('returns SemanticChunk objects with content populated', async () => {
    const results = await store.search('query', 3);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.type).toBe('semantic');
      expect(typeof r.content).toBe('string');
    }
  });

  it('skips rows where ChromaDB returns null document or metadata', async () => {
    const nullRowCollection: IChromaCollection = {
      upsert: vi.fn(async () => {}),
      query: vi.fn(async (): Promise<QueryResult> => ({
        ids: [['id-valid', 'id-null-doc']],
        documents: [['valid content', null]],
        metadatas: [[{ type: 'semantic', projectId: 'p', status: 'success', createdAt: 0, source: 'x' }, null]],
        distances: [[0.1, 0.2]],
      })),
      delete: vi.fn(async () => {}),
    };
    const s = makeStore(nullRowCollection);
    const results = await s.search('anything', 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('id-valid');
  });
});

// ---------------------------------------------------------------------------
// delete()
// ---------------------------------------------------------------------------

describe('SemanticMemoryStore — delete()', () => {
  it('calls collection.delete with the given id', async () => {
    const collection = makeFakeCollection();
    const store = makeStore(collection);
    await store.upsert([makeChunk({ id: 'del-me' })]);

    await store.delete('del-me');

    expect(collection.delete).toHaveBeenCalledWith({ ids: ['del-me'] });
  });
});

// ---------------------------------------------------------------------------
// deleteCollection()
// ---------------------------------------------------------------------------

describe('SemanticMemoryStore — deleteCollection()', () => {
  it('calls IChromaClient.deleteCollection with the projectId as collection name', async () => {
    const collection = makeFakeCollection();
    const client = makeFakeChromaClient(collection);
    const store = new SemanticMemoryStore(client, makeFakeEmbeddingProvider());

    await store.deleteCollection('proj-a');

    expect(client.deleteCollection).toHaveBeenCalledWith('proj-a');
  });
});
