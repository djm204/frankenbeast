import type { ILlmClient } from '@franken/types';
import type { IPlannerModule, PlanGraph, PlanIntent } from '../deps.js';
export declare class PlannerPortAdapter implements IPlannerModule {
    private readonly llmClient;
    constructor(llmClient: ILlmClient);
    createPlan(intent: PlanIntent): Promise<PlanGraph>;
    private buildPrompt;
    private parsePlan;
    private coerceTask;
    private singleTaskPlan;
}
//# sourceMappingURL=planner-adapter.d.ts.map