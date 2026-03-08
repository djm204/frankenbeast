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

export const DEFAULT_BASE_CONFIG: BaseAdapterConfig = {
  retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
  timeout: { timeoutMs: 30_000 },
  costPerInputTokenM: 0,
  costPerOutputTokenM: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export abstract class BaseAdapter {
  protected readonly config: BaseAdapterConfig;

  constructor(config: Partial<BaseAdapterConfig> = {}) {
    this.config = { ...DEFAULT_BASE_CONFIG, ...config };
  }

  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const { maxAttempts, initialDelayMs, backoffMultiplier } = this.config.retry;
    let lastError: unknown;
    let delayMs = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await sleep(delayMs);
          delayMs *= backoffMultiplier;
        }
      }
    }

    throw this.wrapAdapterError(lastError);
  }

  protected async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const { timeoutMs } = this.config.timeout;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          this.makeViolation(
            `Adapter timed out after ${timeoutMs}ms`,
            { timeoutMs },
          ),
        );
      }, timeoutMs);

      fn().then(
        (result) => { clearTimeout(timer); resolve(result); },
        (err: unknown) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.config.costPerInputTokenM;
    const outputCost = (outputTokens / 1_000_000) * this.config.costPerOutputTokenM;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

  private wrapAdapterError(err: unknown): GuardrailViolation {
    return this.makeViolation(
      err instanceof Error ? err.message : `Adapter error: ${String(err)}`,
      { originalError: String(err) },
    );
  }

  protected makeViolation(
    message: string,
    payload?: Record<string, unknown>,
  ): GuardrailViolation {
    return {
      code: "ADAPTER_ERROR",
      message,
      interceptor: "Pipeline",
      payload,
    };
  }
}
