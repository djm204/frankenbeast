import { WorkingMemoryStore } from '../working/working-memory-store.js';
const LESSON_EXTRACTION_THRESHOLD = 20;
// Top-K semantic chunks loaded during frontload
const FRONTLOAD_TOP_K = 10;
export class MemoryOrchestrator {
    deps;
    working;
    semanticHints = [];
    constructor(deps) {
        this.deps = deps;
        this.working = new WorkingMemoryStore(deps.strategy);
    }
    // ---------------------------------------------------------------------------
    // Working memory
    // ---------------------------------------------------------------------------
    recordTurn(turn) {
        this.working.push(turn);
    }
    async pruneContext(budget) {
        await this.working.prune(budget);
    }
    // ---------------------------------------------------------------------------
    // Episodic memory
    // ---------------------------------------------------------------------------
    async recordToolResult(trace) {
        this.deps.episodic.record(trace);
        const count = this.deps.episodic.count(trace.projectId, trace.taskId);
        if (count > LESSON_EXTRACTION_THRESHOLD) {
            await this.maybeExtractLesson(trace.projectId, trace.taskId);
        }
    }
    // ---------------------------------------------------------------------------
    // Semantic memory
    // ---------------------------------------------------------------------------
    async search(query, topK, filter) {
        return this.deps.semantic.search(query, topK, filter);
    }
    async frontload(projectId) {
        this.semanticHints = await this.deps.semantic.search(projectId, FRONTLOAD_TOP_K, { projectId });
    }
    // ---------------------------------------------------------------------------
    // Context
    // ---------------------------------------------------------------------------
    getContext() {
        return {
            turns: this.working.snapshot(),
            semanticHints: [...this.semanticHints],
        };
    }
    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------
    async maybeExtractLesson(projectId, _taskId) {
        const failures = this.deps.episodic.queryFailed(projectId);
        if (failures.length === 0)
            return;
        const lesson = await this.deps.extractor.extract(failures);
        await this.deps.semantic.upsert([lesson]);
        this.deps.episodic.markCompressed(failures.map((f) => f.id));
    }
}
//# sourceMappingURL=memory-orchestrator.js.map