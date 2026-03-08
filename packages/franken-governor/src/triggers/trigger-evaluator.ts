import type { TriggerResult } from '../core/types.js';

export interface TriggerEvaluator<TContext = unknown> {
  readonly triggerId: string;
  evaluate(context: TContext): TriggerResult;
}
