import type { PlanGraph, PlanIntent } from '../deps.js';
/**
 * Locally compatible GraphBuilder interface.
 * Mirrors franken-planner's GraphBuilder without importing it directly.
 */
export interface GraphBuilder {
    build(intent: PlanIntent): Promise<PlanGraph>;
}
/**
 * Reads numbered .md chunk files from a directory and produces a PlanGraph
 * with impl + harden task pairs wired in linear dependency order.
 *
 * This is Mode 1 (pre-written chunks) — no LLM needed.
 */
export declare class ChunkFileGraphBuilder implements GraphBuilder {
    private readonly chunkDir;
    constructor(chunkDir: string);
    build(_intent: PlanIntent): Promise<PlanGraph>;
    private discoverChunks;
    private buildImplPrompt;
    private buildHardenPrompt;
}
//# sourceMappingURL=chunk-file-graph-builder.d.ts.map