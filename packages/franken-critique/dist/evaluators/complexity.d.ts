import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
export declare class ComplexityEvaluator implements Evaluator {
    readonly name = "complexity";
    readonly category: "heuristic";
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
    private checkParameterCount;
    private checkNestingDepth;
    private checkFunctionLength;
}
//# sourceMappingURL=complexity.d.ts.map