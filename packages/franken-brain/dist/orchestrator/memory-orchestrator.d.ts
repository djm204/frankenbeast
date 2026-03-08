import type { ICompressionStrategy } from '../working/compression-strategy.js';
import type { IEpisodicStore } from '../episodic/episodic-store-interface.js';
import type { ISemanticStore, MetadataFilter } from '../semantic/semantic-store-interface.js';
import type { EpisodicLessonExtractor } from '../compression/episodic-lesson-extractor.js';
import type { WorkingTurn, EpisodicTrace, SemanticChunk } from '../types/index.js';
import { TokenBudget } from '../types/index.js';
export interface OrchestratorDeps {
    episodic: IEpisodicStore;
    semantic: ISemanticStore;
    strategy: ICompressionStrategy;
    extractor: EpisodicLessonExtractor;
    projectId: string;
}
export interface AgentContext {
    turns: WorkingTurn[];
    semanticHints: SemanticChunk[];
}
export declare class MemoryOrchestrator {
    private readonly deps;
    private readonly working;
    private semanticHints;
    constructor(deps: OrchestratorDeps);
    recordTurn(turn: WorkingTurn): void;
    pruneContext(budget: TokenBudget): Promise<void>;
    recordToolResult(trace: EpisodicTrace): Promise<void>;
    search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]>;
    frontload(projectId: string): Promise<void>;
    getContext(): AgentContext;
    private maybeExtractLesson;
}
//# sourceMappingURL=memory-orchestrator.d.ts.map