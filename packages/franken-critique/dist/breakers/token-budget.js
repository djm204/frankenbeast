export class TokenBudgetBreaker {
    name = 'token-budget';
    observability;
    constructor(observability) {
        this.observability = observability;
    }
    check(_state, _config) {
        // Synchronous check always passes — use checkAsync for actual budget check
        return { tripped: false };
    }
    async checkAsync(state, config) {
        const spend = await this.observability.getTokenSpend(config.sessionId);
        if (spend.totalTokens >= config.tokenBudget) {
            return {
                tripped: true,
                reason: `Token budget exceeded: ${spend.totalTokens} >= ${config.tokenBudget} (estimated cost: $${spend.estimatedCostUsd.toFixed(4)})`,
                action: 'halt',
            };
        }
        return { tripped: false };
    }
}
//# sourceMappingURL=token-budget.js.map