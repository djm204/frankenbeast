import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';
export interface AmbiguityTriggerContext {
    readonly hasUnresolvedDependency: boolean;
    readonly hasAdrConflict: boolean;
}
export declare class AmbiguityTrigger implements TriggerEvaluator<AmbiguityTriggerContext> {
    readonly triggerId = "ambiguity";
    evaluate(context: AmbiguityTriggerContext): TriggerResult;
}
//# sourceMappingURL=ambiguity-trigger.d.ts.map