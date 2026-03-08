import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
export declare class ConcisenessEvaluator implements Evaluator {
    readonly name = "conciseness";
    readonly category: "heuristic";
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
    private checkCommentRatio;
    private checkTodoComments;
}
//# sourceMappingURL=conciseness.d.ts.map