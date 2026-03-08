import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';
export interface ConfidenceTriggerContext {
    readonly confidenceScore: number;
}
export declare class ConfidenceTrigger implements TriggerEvaluator<ConfidenceTriggerContext> {
    readonly triggerId = "confidence";
    private readonly threshold;
    constructor(threshold?: number);
    evaluate(context: ConfidenceTriggerContext): TriggerResult;
}
//# sourceMappingURL=confidence-trigger.d.ts.map