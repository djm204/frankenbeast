import { describe, it, expect, vi } from "vitest";
import { BaseAdapter } from "./base-adapter.js";
import type { BaseAdapterConfig } from "./base-adapter.js";

// Minimal concrete subclass to test the abstract base
class TestAdapter extends BaseAdapter {
  constructor(config?: Partial<BaseAdapterConfig>) {
    super(config);
  }

  async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.withRetry(fn);
  }

  async callWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return this.withTimeout(fn);
  }

  cost(input: number, output: number): number {
    return this.calculateCost(input, output);
  }
}

describe("BaseAdapter.withRetry", () => {
  it("returns immediately on first success", async () => {
    const adapter = new TestAdapter({ retry: { maxAttempts: 3, initialDelayMs: 0, backoffMultiplier: 2 } });
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await adapter.callWithRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const adapter = new TestAdapter({ retry: { maxAttempts: 3, initialDelayMs: 0, backoffMultiplier: 1 } });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("recovered");
    const result = await adapter.callWithRetry(fn);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exhausts all attempts and throws GuardrailViolation", async () => {
    const adapter = new TestAdapter({ retry: { maxAttempts: 3, initialDelayMs: 0, backoffMultiplier: 1 } });
    const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));
    await expect(adapter.callWithRetry(fn)).rejects.toMatchObject({
      code: "ADAPTER_ERROR",
      interceptor: "Pipeline",
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("BaseAdapter.withTimeout", () => {
  it("resolves when fn completes before timeout", async () => {
    const adapter = new TestAdapter({ timeout: { timeoutMs: 500 } });
    const fn = (): Promise<string> => Promise.resolve("fast");
    await expect(adapter.callWithTimeout(fn)).resolves.toBe("fast");
  });

  it("rejects with GuardrailViolation when fn exceeds timeout", async () => {
    const adapter = new TestAdapter({ timeout: { timeoutMs: 20 } });
    const fn = (): Promise<string> =>
      new Promise((resolve) => setTimeout(() => resolve("slow"), 200));
    await expect(adapter.callWithTimeout(fn)).rejects.toMatchObject({
      code: "ADAPTER_ERROR",
      interceptor: "Pipeline",
      message: expect.stringContaining("timed out"),
    });
  });
});

describe("BaseAdapter.calculateCost", () => {
  it("returns 0 when rates are 0", () => {
    const adapter = new TestAdapter({ costPerInputTokenM: 0, costPerOutputTokenM: 0 });
    expect(adapter.cost(1000, 500)).toBe(0);
  });

  it("calculates cost from known token counts and rates", () => {
    // Claude Sonnet: $3/M input, $15/M output
    const adapter = new TestAdapter({ costPerInputTokenM: 3, costPerOutputTokenM: 15 });
    // 1000 input tokens + 200 output tokens
    // input: (1000/1_000_000) * 3 = 0.003
    // output: (200/1_000_000) * 15 = 0.003
    // total: 0.006
    expect(adapter.cost(1000, 200)).toBeCloseTo(0.006, 6);
  });

  it("handles large token counts without precision loss", () => {
    const adapter = new TestAdapter({ costPerInputTokenM: 3, costPerOutputTokenM: 15 });
    // 1M input + 1M output = 3 + 15 = 18
    expect(adapter.cost(1_000_000, 1_000_000)).toBeCloseTo(18, 4);
  });
});
