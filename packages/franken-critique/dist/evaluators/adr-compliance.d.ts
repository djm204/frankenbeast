import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
import type { MemoryPort } from '../types/contracts.js';
export declare class ADRComplianceEvaluator implements Evaluator {
    readonly name = "adr-compliance";
    readonly category: "heuristic";
    private readonly memory;
    constructor(memory: MemoryPort);
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
    private extractQuery;
}
//# sourceMappingURL=adr-compliance.d.ts.map