import type { SemanticChunk } from '../types/index.js';
import type { IChromaClient } from './chroma-client-interface.js';
import type { IEmbeddingProvider } from './embedding-provider-interface.js';
import type { ISemanticStore, MetadataFilter } from './semantic-store-interface.js';
export declare class SemanticMemoryStore implements ISemanticStore {
    private readonly client;
    private readonly embedder;
    private readonly collections;
    constructor(client: IChromaClient, embedder: IEmbeddingProvider);
    upsert(chunks: SemanticChunk[]): Promise<void>;
    search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]>;
    delete(id: string): Promise<void>;
    deleteCollection(projectId: string): Promise<void>;
    private getCollection;
}
//# sourceMappingURL=semantic-memory-store.d.ts.map