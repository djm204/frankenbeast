import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
export declare class LogicLoopEvaluator implements Evaluator {
    readonly name = "logic-loop";
    readonly category: "deterministic";
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
    private checkInfiniteLoops;
    private checkUnguardedRecursion;
}
//# sourceMappingURL=logic-loop.d.ts.map