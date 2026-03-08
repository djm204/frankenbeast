export class BudgetTrigger {
    triggerId = 'budget';
    evaluate(context) {
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
//# sourceMappingURL=budget-trigger.js.map