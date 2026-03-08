import type { SemanticChunk } from '../types/index.js';

export type MetadataFilter = Record<string, string | number | boolean>;

export interface ISemanticStore {
  upsert(chunks: SemanticChunk[]): Promise<void>;
  search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]>;
  delete(id: string): Promise<void>;
  deleteCollection(projectId: string): Promise<void>;
}
