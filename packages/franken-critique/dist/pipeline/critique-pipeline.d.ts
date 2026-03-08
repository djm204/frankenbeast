import type { Evaluator, EvaluationInput, CritiqueResult } from '../types/evaluation.js';
export declare class CritiquePipeline {
    private readonly evaluators;
    constructor(evaluators: readonly Evaluator[]);
    run(input: EvaluationInput): Promise<CritiqueResult>;
}
//# sourceMappingURL=critique-pipeline.d.ts.map