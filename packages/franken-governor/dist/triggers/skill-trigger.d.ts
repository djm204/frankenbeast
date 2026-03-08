import type { TriggerResult } from '../core/types.js';
import type { TriggerEvaluator } from './trigger-evaluator.js';
export interface SkillTriggerContext {
    readonly skillId: string;
    readonly requiresHitl: boolean;
    readonly isDestructive: boolean;
}
export declare class SkillTrigger implements TriggerEvaluator<SkillTriggerContext> {
    readonly triggerId = "skill";
    evaluate(context: SkillTriggerContext): TriggerResult;
}
//# sourceMappingURL=skill-trigger.d.ts.map