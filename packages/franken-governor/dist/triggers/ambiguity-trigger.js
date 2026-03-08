export class AmbiguityTrigger {
    triggerId = 'ambiguity';
    evaluate(context) {
        if (!context.hasUnresolvedDependency && !context.hasAdrConflict) {
            return { triggered: false, triggerId: this.triggerId };
        }
        const reasons = [];
        if (context.hasUnresolvedDependency)
            reasons.push('unresolved dependency');
        if (context.hasAdrConflict)
            reasons.push('ADR conflict');
        return {
            triggered: true,
            triggerId: this.triggerId,
            reason: `Ambiguity detected: ${reasons.join(' and ')}`,
            severity: 'high',
        };
    }
}
//# sourceMappingURL=ambiguity-trigger.js.map