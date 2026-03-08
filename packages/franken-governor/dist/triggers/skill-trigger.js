export class SkillTrigger {
    triggerId = 'skill';
    evaluate(context) {
        if (!context.requiresHitl && !context.isDestructive) {
            return { triggered: false, triggerId: this.triggerId };
        }
        const reasons = [];
        if (context.requiresHitl)
            reasons.push('requires HITL');
        if (context.isDestructive)
            reasons.push('is destructive');
        return {
            triggered: true,
            triggerId: this.triggerId,
            reason: `Skill '${context.skillId}' ${reasons.join(' and ')}`,
            severity: 'high',
        };
    }
}
//# sourceMappingURL=skill-trigger.js.map