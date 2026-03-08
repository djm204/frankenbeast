import { GuardrailViolation } from "../types/index.js";
export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
}
export interface TimeoutConfig {
    timeoutMs: number;
}
export interface BaseAdapterConfig {
    retry: RetryConfig;
    timeout: TimeoutConfig;
    /** Cost per 1M input tokens in USD */
    costPerInputTokenM: number;
    /** Cost per 1M output tokens in USD */
    costPerOutputTokenM: number;
}
export declare const DEFAULT_BASE_CONFIG: BaseAdapterConfig;
export declare abstract class BaseAdapter {
    protected readonly config: BaseAdapterConfig;
    constructor(config?: Partial<BaseAdapterConfig>);
    protected withRetry<T>(fn: () => Promise<T>): Promise<T>;
    protected withTimeout<T>(fn: () => Promise<T>): Promise<T>;
    calculateCost(inputTokens: number, outputTokens: number): number;
    private wrapAdapterError;
    protected makeViolation(message: string, payload?: Record<string, unknown>): GuardrailViolation;
}
//# sourceMappingURL=base-adapter.d.ts.map