import { WorkingMemoryStore } from '../working/working-memory-store.js';
import type { ICompressionStrategy } from '../working/compression-strategy.js';
import type { IEpisodicStore } from '../episodic/episodic-store-interface.js';
import type { ISemanticStore, MetadataFilter } from '../semantic/semantic-store-interface.js';
import type { EpisodicLessonExtractor } from '../compression/episodic-lesson-extractor.js';
import type { WorkingTurn, EpisodicTrace, SemanticChunk } from '../types/index.js';
import { TokenBudget } from '../types/index.js';

const LESSON_EXTRACTION_THRESHOLD = 20;
// Top-K semantic chunks loaded during frontload
const FRONTLOAD_TOP_K = 10;

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

export class MemoryOrchestrator {
  private readonly working: WorkingMemoryStore;
  private semanticHints: SemanticChunk[] = [];

  constructor(private readonly deps: OrchestratorDeps) {
    this.working = new WorkingMemoryStore(deps.strategy);
  }

  // ---------------------------------------------------------------------------
  // Working memory
  // ---------------------------------------------------------------------------

  recordTurn(turn: WorkingTurn): void {
    this.working.push(turn);
  }

  async pruneContext(budget: TokenBudget): Promise<void> {
    await this.working.prune(budget);
  }

  // ---------------------------------------------------------------------------
  // Episodic memory
  // ---------------------------------------------------------------------------

  async recordToolResult(trace: EpisodicTrace): Promise<void> {
    this.deps.episodic.record(trace);

    const count = this.deps.episodic.count(trace.projectId, trace.taskId);
    if (count > LESSON_EXTRACTION_THRESHOLD) {
      await this.maybeExtractLesson(trace.projectId, trace.taskId);
    }
  }

  // ---------------------------------------------------------------------------
  // Semantic memory
  // ---------------------------------------------------------------------------

  async search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]> {
    return this.deps.semantic.search(query, topK, filter);
  }

  async frontload(projectId: string): Promise<void> {
    this.semanticHints = await this.deps.semantic.search(
      projectId,
      FRONTLOAD_TOP_K,
      { projectId },
    );
  }

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  getContext(): AgentContext {
    return {
      turns: this.working.snapshot(),
      semanticHints: [...this.semanticHints],
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async maybeExtractLesson(projectId: string, _taskId: string): Promise<void> {
    const failures = this.deps.episodic.queryFailed(projectId);
    if (failures.length === 0) return;

    const lesson = await this.deps.extractor.extract(failures);
    await this.deps.semantic.upsert([lesson]);
    this.deps.episodic.markCompressed(failures.map((f) => f.id));
  }
}
