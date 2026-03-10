// Public API — populated as phases complete
export type {
  MemoryStatus,
  MemoryMetadata,
  WorkingTurn,
  EpisodicTrace,
  SemanticChunk,
  MemoryEntry,
} from './types/index.js';

export { TokenBudget, generateId, parseMemoryEntry, parseMemoryStatus } from './types/index.js';

export { WorkingMemoryStore } from './working/index.js';
export type { ICompressionStrategy, CompressionResult } from './working/index.js';

export { EpisodicMemoryStore } from './episodic/index.js';
export type { IEpisodicStore } from './episodic/index.js';

export { SemanticMemoryStore } from './semantic/index.js';
export type { ISemanticStore, MetadataFilter, IChromaClient, IEmbeddingProvider } from './semantic/index.js';

export { TruncationStrategy, LlmSummarisationStrategy, EpisodicLessonExtractor } from './compression/index.js';
export type { ILlmClient } from './compression/index.js';

export { MemoryOrchestrator } from './orchestrator/index.js';
export type { OrchestratorDeps, AgentContext } from './orchestrator/index.js';

export { PiiGuard, PiiDetectedError, PiiGuardedEpisodicStore, PiiGuardedSemanticStore } from './pii/index.js';
export type { IPiiScanner, ScanResult, ScanMode, PiiDetectedEvent } from './pii/index.js';
