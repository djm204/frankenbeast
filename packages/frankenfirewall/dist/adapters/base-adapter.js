export const DEFAULT_BASE_CONFIG = {
    retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
    timeout: { timeoutMs: 30_000 },
    costPerInputTokenM: 0,
    costPerOutputTokenM: 0,
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class BaseAdapter {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_BASE_CONFIG, ...config };
    }
    async withRetry(fn) {
        const { maxAttempts, initialDelayMs, backoffMultiplier } = this.config.retry;
        let lastError;
        let delayMs = initialDelayMs;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (err) {
                lastError = err;
                if (attempt < maxAttempts) {
                    await sleep(delayMs);
                    delayMs *= backoffMultiplier;
                }
            }
        }
        throw this.wrapAdapterError(lastError);
    }
    async withTimeout(fn) {
        const { timeoutMs } = this.config.timeout;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(this.makeViolation(`Adapter timed out after ${timeoutMs}ms`, { timeoutMs }));
            }, timeoutMs);
            fn().then((result) => { clearTimeout(timer); resolve(result); }, (err) => { clearTimeout(timer); reject(err); });
        });
    }
    calculateCost(inputTokens, outputTokens) {
        const inputCost = (inputTokens / 1_000_000) * this.config.costPerInputTokenM;
        const outputCost = (outputTokens / 1_000_000) * this.config.costPerOutputTokenM;
        return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
    }
    wrapAdapterError(err) {
        return this.makeViolation(err instanceof Error ? err.message : `Adapter error: ${String(err)}`, { originalError: String(err) });
    }
    makeViolation(message, payload) {
        const violation = {
            code: "ADAPTER_ERROR",
            message,
            interceptor: "Pipeline",
        };
        if (payload !== undefined) {
            violation.payload = payload;
        }
        return violation;
    }
}
//# sourceMappingURL=base-adapter.js.map