import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
import type { GuardrailsPort } from '../types/contracts.js';
export declare class SafetyEvaluator implements Evaluator {
    readonly name = "safety";
    readonly category: "deterministic";
    private readonly guardrails;
    constructor(guardrails: GuardrailsPort);
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
//# sourceMappingURL=safety.d.ts.map