import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';
import type { ObservabilityPort } from '../types/contracts.js';
export declare class TokenBudgetBreaker implements CircuitBreaker {
    readonly name = "token-budget";
    private readonly observability;
    constructor(observability: ObservabilityPort);
    check(_state: LoopState, _config: LoopConfig): CircuitBreakerResult;
    checkAsync(state: LoopState, config: LoopConfig): Promise<CircuitBreakerResult>;
}
//# sourceMappingURL=token-budget.d.ts.map