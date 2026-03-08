import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';
export interface BudgetTriggerContext {
    readonly tripped: boolean;
    readonly limitUsd: number;
    readonly spendUsd: number;
}
export declare class BudgetTrigger implements TriggerEvaluator<BudgetTriggerContext> {
    readonly triggerId = "budget";
    evaluate(context: BudgetTriggerContext): TriggerResult;
}
//# sourceMappingURL=budget-trigger.d.ts.map