import type { ADR, KnownError, ProjectContext } from '../core/types.js';

/**
 * MOD-03: Episodic & Semantic Memory
 * Provides ADRs, known error patterns, and project context to the planner.
 * Used for CoT context enrichment and the self-correction loop.
 */
export interface MemoryModule {
  getADRs(): Promise<ADR[]>;
  getKnownErrors(): Promise<KnownError[]>;
  getProjectContext(): Promise<ProjectContext>;
}
