import type { ILlmClient } from '@franken/types';
import type { IPlannerModule, PlanGraph, PlanIntent } from '../deps.js';
export declare class LlmPlanner implements IPlannerModule {
    private readonly llmClient;
    constructor(llmClient: ILlmClient);
    createPlan(intent: PlanIntent): Promise<PlanGraph>;
    private buildPrompt;
    private parsePlan;
    private buildIdMap;
    private coerceTask;
    private hasCycle;
    private singleTaskPlan;
}
//# sourceMappingURL=llm-planner.d.ts.map