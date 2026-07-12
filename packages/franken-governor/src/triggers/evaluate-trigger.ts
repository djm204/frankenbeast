import type { TriggerResult } from '../core/types.js';
import { TriggerEvaluationError } from '../errors/trigger-evaluation-error.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';

function describeEvaluationFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}

/**
 * Evaluates one trigger and converts evaluator failures into a deterministic,
 * fail-closed trigger result so governor callers share one safety policy.
 */
export function evaluateTrigger(evaluator: TriggerEvaluator, context: unknown): TriggerResult {
  try {
    return evaluator.evaluate(context);
  } catch (error) {
    const evaluationError = new TriggerEvaluationError(
      evaluator.triggerId,
      describeEvaluationFailure(error),
    );

    return {
      triggered: true,
      triggerId: evaluator.triggerId,
      reason: evaluationError.message,
      severity: 'critical',
    };
  }
}
