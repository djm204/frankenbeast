import { randomUUID } from 'node:crypto';

export type ChunkTranscriptKind =
  | 'system'
  | 'objective'
  | 'assistant'
  | 'tool_summary'
  | 'compaction_summary'
  | 'checkpoint'
  | 'error';

export interface ChunkTranscriptEntry {
  readonly kind: ChunkTranscriptKind;
  readonly content: string;
  readonly createdAt: string;
}

export interface ChunkCompactionRecord {
  readonly generation: number;
  readonly summary: string;
  readonly createdAt: string;
}

export interface ChunkSession {
  readonly version: 1;
  readonly sessionId: string;
  readonly planName: string;
  readonly taskId: string;
  readonly chunkId: string;
  readonly promiseTag: string;
  readonly workingDir: string;
  readonly status: 'active' | 'completed' | 'failed' | 'abandoned';
  readonly iterations: number;
  readonly compactionGeneration: number;
  readonly activeProvider?: string;
  readonly lastKnownGoodCommit?: string;
  readonly contextWindow: {
    readonly provider: string;
    readonly usedTokens: number;
    readonly maxTokens: number;
    readonly usageRatio: number;
    readonly compactThreshold: number;
    readonly lastCompactedAtIteration?: number;
  };
  readonly transcript: readonly ChunkTranscriptEntry[];
  readonly compactions: readonly ChunkCompactionRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateChunkSessionInput {
  readonly planName: string;
  readonly taskId: string;
  readonly chunkId: string;
  readonly promiseTag: string;
  readonly workingDir: string;
  readonly provider: string;
  readonly maxTokens: number;
}

export function chunkSessionStorageKey(chunkId: string, taskId?: string): string {
  return encodeURIComponent(taskId ?? chunkId);
}

export function createChunkTranscriptEntry(kind: ChunkTranscriptKind, content: string): ChunkTranscriptEntry {
  return {
    kind,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createChunkSession(input: CreateChunkSessionInput): ChunkSession {
  const now = new Date().toISOString();

  return {
    version: 1,
    sessionId: randomUUID(),
    planName: input.planName,
    taskId: input.taskId,
    chunkId: input.chunkId,
    promiseTag: input.promiseTag,
    workingDir: input.workingDir,
    status: 'active',
    iterations: 0,
    compactionGeneration: 0,
    activeProvider: input.provider,
    contextWindow: {
      provider: input.provider,
      usedTokens: 0,
      maxTokens: input.maxTokens,
      usageRatio: 0,
      compactThreshold: 0.85,
    },
    transcript: [],
    compactions: [],
    createdAt: now,
    updatedAt: now,
  };
}
