import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';
export declare class ConsensusFailureBreaker implements CircuitBreaker {
    readonly name = "consensus-failure";
    check(state: LoopState, config: LoopConfig): CircuitBreakerResult;
}
//# sourceMappingURL=consensus-failure.d.ts.map