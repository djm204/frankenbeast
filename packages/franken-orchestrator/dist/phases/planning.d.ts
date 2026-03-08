import type { BeastContext } from '../context/franken-context.js';
import type { IPlannerModule, ICritiqueModule, ILogger } from '../deps.js';
import type { GraphBuilder } from '../planning/chunk-file-graph-builder.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
export declare class CritiqueSpiralError extends Error {
    readonly iterations: number;
    readonly lastScore: number;
    constructor(iterations: number, lastScore: number);
}
/**
 * Beast Loop Phase 2: Planning + Critique Review
 * Creates a plan from the sanitized intent, then runs critique loop.
 * If critique fails after maxCritiqueIterations, throws CritiqueSpiralError.
 */
export declare function runPlanning(ctx: BeastContext, planner: IPlannerModule, critique: ICritiqueModule, config: OrchestratorConfig, logger?: ILogger, graphBuilder?: GraphBuilder): Promise<void>;
//# sourceMappingURL=planning.d.ts.map