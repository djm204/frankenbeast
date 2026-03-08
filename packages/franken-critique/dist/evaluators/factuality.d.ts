import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
import type { MemoryPort } from '../types/contracts.js';
export declare class FactualityEvaluator implements Evaluator {
    readonly name = "factuality";
    readonly category: "heuristic";
    private readonly memory;
    constructor(memory: MemoryPort);
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
    private extractQuery;
}
//# sourceMappingURL=factuality.d.ts.map