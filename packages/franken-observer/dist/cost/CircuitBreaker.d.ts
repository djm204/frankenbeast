export interface CircuitBreakerOptions {
    limitUsd: number;
}
export interface CircuitBreakerResult {
    tripped: boolean;
    limitUsd: number;
    spendUsd: number;
}
type LimitReachedHandler = (result: CircuitBreakerResult) => void;
/**
 * Non-blocking budget guard. Emits a 'limit-reached' event when
 * cumulative spend exceeds the configured USD limit. Never throws.
 */
export declare class CircuitBreaker {
    private readonly limitUsd;
    private readonly handlers;
    constructor(options: CircuitBreakerOptions);
    check(spendUsd: number): CircuitBreakerResult;
    on(event: 'limit-reached', handler: LimitReachedHandler): void;
    off(event: 'limit-reached', handler: LimitReachedHandler): void;
}
export {};
//# sourceMappingURL=CircuitBreaker.d.ts.map