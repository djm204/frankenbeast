import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';
export declare class TriggerRegistry {
    private readonly evaluators;
    constructor(evaluators: ReadonlyArray<TriggerEvaluator>);
    evaluateAll(context: unknown): TriggerResult;
}
//# sourceMappingURL=trigger-registry.d.ts.map