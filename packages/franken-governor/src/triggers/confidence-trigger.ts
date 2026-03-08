import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';

export interface ConfidenceTriggerContext {
  readonly confidenceScore: number;
}

export class ConfidenceTrigger implements TriggerEvaluator<ConfidenceTriggerContext> {
  readonly triggerId = 'confidence';
  private readonly threshold: number;

  constructor(threshold: number = 0.5) {
    this.threshold = threshold;
  }

  evaluate(context: ConfidenceTriggerContext): TriggerResult {
    if (context.confidenceScore >= this.threshold) {
      return { triggered: false, triggerId: this.triggerId };
    }

    return {
      triggered: true,
      triggerId: this.triggerId,
      reason: `Low confidence: score ${context.confidenceScore} below threshold ${this.threshold}`,
      severity: 'medium',
    };
  }
}
