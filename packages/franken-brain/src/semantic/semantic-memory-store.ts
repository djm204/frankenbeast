import type { SemanticChunk } from '../types/index.js';
import type { IChromaClient, IChromaCollection } from './chroma-client-interface.js';
import type { IEmbeddingProvider } from './embedding-provider-interface.js';
import type { ISemanticStore, MetadataFilter } from './semantic-store-interface.js';

// Collection names are scoped per projectId
const collectionName = (projectId: string): string => `project-${projectId}`;

export class SemanticMemoryStore implements ISemanticStore {
  // Lazy collection cache: one ChromaDB collection per projectId
  private readonly collections = new Map<string, IChromaCollection>();

  constructor(
    private readonly client: IChromaClient,
    private readonly embedder: IEmbeddingProvider,
  ) {}

  async upsert(chunks: SemanticChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    // Batch embed all content in one call
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embedder.embed(texts);

    // Group by projectId to upsert into the correct collection
    const byProject = new Map<string, { chunk: SemanticChunk; embedding: number[] }[]>();
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const embedding = embeddings[i]!;
      const group = byProject.get(chunk.projectId) ?? [];
      group.push({ chunk, embedding });
      byProject.set(chunk.projectId, group);
    }

    for (const [projectId, items] of byProject) {
      const collection = await this.getCollection(projectId);
      await collection.upsert({
        ids: items.map(({ chunk }) => chunk.id),
        embeddings: items.map(({ embedding }) => embedding),
        documents: items.map(({ chunk }) => chunk.content),
        metadatas: items.map(({ chunk }) => chunkToMetadata(chunk)),
      });
    }
  }

  async search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]> {
    const [queryEmbedding] = await this.embedder.embed([query]);
    if (queryEmbedding === undefined) return [];

    // Determine which collection(s) to search
    const projectId = filter?.['projectId'];
    const targetProjectId = typeof projectId === 'string' ? projectId : undefined;

    const collection = await this.getCollection(targetProjectId ?? 'default');

    // exactOptionalPropertyTypes: omit `where` entirely when no filter,
    // rather than passing `where: undefined`.
    const queryParams = filter !== undefined
      ? { queryEmbeddings: [queryEmbedding], nResults: topK, where: { ...filter } }
      : { queryEmbeddings: [queryEmbedding], nResults: topK };

    const result = await collection.query(queryParams);

    return rowsToChunks(result.ids[0] ?? [], result.documents[0] ?? [], result.metadatas[0] ?? []);
  }

  async delete(id: string): Promise<void> {
    // Delete from all cached collections — we don't track which project owns an id
    // without a separate lookup. If no collections are cached, there is nothing
    // to delete (upsert has never been called).
    for (const collection of this.collections.values()) {
      await collection.delete({ ids: [id] });
    }
  }

  async deleteCollection(projectId: string): Promise<void> {
    this.collections.delete(projectId);
    await this.client.deleteCollection(projectId);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async getCollection(projectId: string): Promise<IChromaCollection> {
    const cached = this.collections.get(projectId);
    if (cached !== undefined) return cached;

    const collection = await this.client.getOrCreateCollection(collectionName(projectId));
    this.collections.set(projectId, collection);
    return collection;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkToMetadata(chunk: SemanticChunk): Record<string, unknown> {
  const { id, content, embedding, ...rest } = chunk;
  void id; void content; void embedding; // stored in dedicated Chroma fields
  return rest as Record<string, unknown>;
}

function rowsToChunks(
  ids: (string | null)[],
  documents: (string | null)[],
  metadatas: (Record<string, unknown> | null)[],
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  for (let i = 0; i < ids.length; i++) {
    // Safety: i is bounded by ids.length — non-null assertions are correct here.
    // We still guard against null values that ChromaDB may return for missing docs.
    const id = ids[i]!;
    const content = documents[i]!;
    const meta = metadatas[i]!;
    if (id === null || content === null || meta === null) continue;
    chunks.push({
      id,
      content,
      ...(meta as Omit<SemanticChunk, 'id' | 'content'>),
    });
  }
  return chunks;
}
