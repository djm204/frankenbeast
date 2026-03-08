import type { ILlmClient } from '@franken/types';
import type { PlanGraph, PlanIntent } from '../deps.js';
import type { GraphBuilder } from './chunk-file-graph-builder.js';
/**
 * GraphBuilder implementation that uses ILlmClient.complete() to decompose
 * a design document into a PlanGraph with ordered impl+harden task pairs.
 *
 * This is Mode 2 (design-doc input) — the LLM produces the chunk breakdown.
 */
export declare class LlmGraphBuilder implements GraphBuilder {
    private readonly llm;
    private readonly options?;
    private readonly maxChunks;
    constructor(llm: ILlmClient, options?: {
        maxChunks?: number;
    } | undefined);
    build(intent: PlanIntent): Promise<PlanGraph>;
    private buildDecompositionPrompt;
    private parseResponse;
    private validateChunkShape;
    private validate;
    private detectCycles;
    /** Sanitize chunk ID: only alphanumeric, underscores, hyphens. */
    private sanitizeId;
    private buildGraph;
    private buildImplPrompt;
    private buildHardenPrompt;
}
//# sourceMappingURL=llm-graph-builder.d.ts.map