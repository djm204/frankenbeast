import type { EvaluationInput } from '../types/evaluation.js';
import type { CircuitBreaker, LoopConfig, CritiqueLoopResult } from '../types/loop.js';
import type { CritiquePipeline } from '../pipeline/critique-pipeline.js';
export declare class CritiqueLoop {
    private readonly pipeline;
    private readonly breakers;
    constructor(pipeline: CritiquePipeline, breakers: readonly CircuitBreaker[]);
    run(input: EvaluationInput, config: LoopConfig): Promise<CritiqueLoopResult>;
    private checkBreakers;
    private buildCorrection;
    private buildEscalation;
}
//# sourceMappingURL=critique-loop.d.ts.map