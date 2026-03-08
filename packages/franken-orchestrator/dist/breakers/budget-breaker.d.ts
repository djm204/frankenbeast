import type { TokenSpendData } from '../deps.js';
export declare class BudgetExceededError extends Error {
    readonly spent: number;
    readonly limit: number;
    constructor(spent: number, limit: number);
}
/**
 * Budget breaker: checks token spend after each task execution.
 * Returns halt signal if total tokens exceed the configured limit.
 */
export declare function checkBudget(spend: TokenSpendData, maxTotalTokens: number): {
    halt: boolean;
    reason?: string;
};
//# sourceMappingURL=budget-breaker.d.ts.map