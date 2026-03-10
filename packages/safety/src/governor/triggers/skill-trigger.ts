import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';

export interface SkillTriggerContext {
  readonly skillId: string;
  readonly requiresHitl: boolean;
  readonly isDestructive: boolean;
}

export class SkillTrigger implements TriggerEvaluator<SkillTriggerContext> {
  readonly triggerId = 'skill';

  evaluate(context: SkillTriggerContext): TriggerResult {
    if (!context.requiresHitl && !context.isDestructive) {
      return { triggered: false, triggerId: this.triggerId };
    }

    const reasons: string[] = [];
    if (context.requiresHitl) reasons.push('requires HITL');
    if (context.isDestructive) reasons.push('is destructive');

    return {
      triggered: true,
      triggerId: this.triggerId,
      reason: `Skill '${context.skillId}' ${reasons.join(' and ')}`,
      severity: 'high',
    };
  }
}
