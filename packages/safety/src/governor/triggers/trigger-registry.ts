import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';

export class TriggerRegistry {
  constructor(private readonly evaluators: ReadonlyArray<TriggerEvaluator>) {}

  evaluateAll(context: unknown): TriggerResult {
    for (const evaluator of this.evaluators) {
      const result = evaluator.evaluate(context);
      if (result.triggered) {
        return result;
      }
    }

    return { triggered: false, triggerId: 'none' };
  }
}
