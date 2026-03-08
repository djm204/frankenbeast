export interface UpsertParams {
  ids: string[];
  embeddings: number[][];
  documents: string[];
  metadatas: Record<string, unknown>[];
}

export interface QueryParams {
  queryEmbeddings: number[][];
  nResults: number;
  where?: Record<string, unknown>;
}

export interface QueryResult {
  ids: string[][];
  documents: (string | null)[][];
  metadatas: (Record<string, unknown> | null)[][];
  distances: number[][];
}

export interface IChromaCollection {
  upsert(params: UpsertParams): Promise<void>;
  query(params: QueryParams): Promise<QueryResult>;
  delete(params: { ids: string[] }): Promise<void>;
}

export interface IChromaClient {
  getOrCreateCollection(name: string): Promise<IChromaCollection>;
  deleteCollection(name: string): Promise<void>;
}
