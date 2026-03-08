import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';
export declare class MaxIterationBreaker implements CircuitBreaker {
    readonly name = "max-iteration";
    check(state: LoopState, config: LoopConfig): CircuitBreakerResult;
}
//# sourceMappingURL=max-iteration.d.ts.map