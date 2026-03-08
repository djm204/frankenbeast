/**
 * MOD-03 (Memory) contract — what MOD-08 requires from the memory system.
 */

export interface EpisodicTrace {
  readonly id: string;
  readonly taskId: string;
  readonly status: 'success' | 'failure';
  readonly summary: string;
  readonly timestamp: string;
}

export interface MemoryEntry {
  readonly id: string;
  readonly content: string;
  readonly source: string;
  readonly timestamp: string;
}

export interface SemanticLesson {
  readonly content: string;
  readonly source: string;
  readonly tags: readonly string[];
}

export interface IMemoryModule {
  getRecentTraces(hours: number): Promise<EpisodicTrace[]>;
  getSuccesses(projectId: string): Promise<MemoryEntry[]>;
  getFailures(projectId: string): Promise<MemoryEntry[]>;
  recordLesson(lesson: SemanticLesson): Promise<void>;
}
