export class BudgetExceededError extends Error {
    spent;
    limit;
    constructor(spent, limit) {
        super(`Token budget exceeded: ${spent}/${limit}`);
        this.spent = spent;
        this.limit = limit;
        this.name = 'BudgetExceededError';
    }
}
/**
 * Budget breaker: checks token spend after each task execution.
 * Returns halt signal if total tokens exceed the configured limit.
 */
export function checkBudget(spend, maxTotalTokens) {
    if (spend.totalTokens > maxTotalTokens) {
        return {
            halt: true,
            reason: `Token budget exceeded: ${spend.totalTokens}/${maxTotalTokens}`,
        };
    }
    return { halt: false };
}
//# sourceMappingURL=budget-breaker.js.map