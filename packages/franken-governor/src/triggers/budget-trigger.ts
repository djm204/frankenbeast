import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';

export interface BudgetTriggerContext {
  readonly tripped: boolean;
  readonly limitUsd: number;
  readonly spendUsd: number;
}

export class BudgetTrigger implements TriggerEvaluator<BudgetTriggerContext> {
  readonly triggerId = 'budget';

  evaluate(context: BudgetTriggerContext): TriggerResult {
    if (!context.tripped) {
      return { triggered: false, triggerId: this.triggerId };
    }

    return {
      triggered: true,
      triggerId: this.triggerId,
      reason: `Budget breach: spent $${context.spendUsd} exceeds limit $${context.limitUsd}`,
      severity: 'critical',
    };
  }
}
