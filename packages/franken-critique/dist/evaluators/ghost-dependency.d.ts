import type { Evaluator, EvaluationInput, EvaluationResult } from './evaluator.js';
export declare class GhostDependencyEvaluator implements Evaluator {
    readonly name = "ghost-dependency";
    readonly category: "deterministic";
    private readonly knownPackages;
    constructor(knownPackages: readonly string[]);
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
//# sourceMappingURL=ghost-dependency.d.ts.map