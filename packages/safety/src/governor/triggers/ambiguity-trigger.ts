import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';

export interface AmbiguityTriggerContext {
  readonly hasUnresolvedDependency: boolean;
  readonly hasAdrConflict: boolean;
}

export class AmbiguityTrigger implements TriggerEvaluator<AmbiguityTriggerContext> {
  readonly triggerId = 'ambiguity';

  evaluate(context: AmbiguityTriggerContext): TriggerResult {
    if (!context.hasUnresolvedDependency && !context.hasAdrConflict) {
      return { triggered: false, triggerId: this.triggerId };
    }

    const reasons: string[] = [];
    if (context.hasUnresolvedDependency) reasons.push('unresolved dependency');
    if (context.hasAdrConflict) reasons.push('ADR conflict');

    return {
      triggered: true,
      triggerId: this.triggerId,
      reason: `Ambiguity detected: ${reasons.join(' and ')}`,
      severity: 'high',
    };
  }
}
