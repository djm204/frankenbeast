// Primary API — SqliteBrain (Phase 2 rewrite)
export { SqliteBrain } from './sqlite-brain.js';

// Legacy exports — consumed by franken-orchestrator dep-factory.ts
// TODO: Remove after Phase 8 (dep-factory-rewiring) switches to SqliteBrain
export type {
  MemoryStatus,
  MemoryMetadata,
  WorkingTurn,
  EpisodicTrace,
  SemanticChunk,
  MemoryEntry,
} from './types/index.js';

export { TokenBudget, generateId, parseMemoryEntry, parseMemoryStatus } from './types/index.js';

export { EpisodicMemoryStore } from './episodic/index.js';
export type { IEpisodicStore } from './episodic/index.js';
