import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
export declare class ScalabilityEvaluator implements Evaluator {
    readonly name = "scalability";
    readonly category: "heuristic";
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
    private checkHardcodedUrls;
    private checkHardcodedIPs;
    private checkHardcodedPorts;
}
//# sourceMappingURL=scalability.d.ts.map