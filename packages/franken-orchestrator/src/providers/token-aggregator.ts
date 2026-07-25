import { TokenUsageSchema, type TokenUsage } from '@franken/types';

export interface AggregatedTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCacheCreation1hTokens: number;
  totalTokens: number;
  byProvider: Map<string, TokenUsage>;
}

export class TokenAggregator {
  private readonly usage = new Map<string, TokenUsage>();

  private static safeAdd(a: number, b: number): number {
    const sum = a + b;
    if (!Number.isSafeInteger(sum)) {
      throw new RangeError('TokenAggregator token total exceeds Number.MAX_SAFE_INTEGER');
    }
    return sum;
  }

  record(providerName: string, usageInput: TokenUsage): void {
    const usage = TokenUsageSchema.parse(usageInput);
    const existing = this.usage.get(providerName) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
    };
    const cacheCreation1hTokens = TokenAggregator.safeAdd(
      existing.cacheCreation1hTokens ?? 0,
      usage.cacheCreation1hTokens ?? 0,
    );
    this.usage.set(providerName, {
      inputTokens: TokenAggregator.safeAdd(existing.inputTokens, usage.inputTokens),
      outputTokens: TokenAggregator.safeAdd(existing.outputTokens, usage.outputTokens),
      cacheReadTokens: TokenAggregator.safeAdd(
        existing.cacheReadTokens ?? 0,
        usage.cacheReadTokens ?? 0,
      ),
      cacheCreationTokens: TokenAggregator.safeAdd(
        existing.cacheCreationTokens ?? 0,
        usage.cacheCreationTokens ?? 0,
      ),
      ...(cacheCreation1hTokens > 0 ? { cacheCreation1hTokens } : {}),
      totalTokens: TokenAggregator.safeAdd(existing.totalTokens, usage.totalTokens),
    });
  }

  getTotalUsage(): AggregatedTokenUsage {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCacheCreation1hTokens = 0;
    let totalTokens = 0;

    for (const u of this.usage.values()) {
      const freshAndReadInput = TokenAggregator.safeAdd(
        u.inputTokens,
        u.cacheReadTokens ?? 0,
      );
      const providerInputTokens = TokenAggregator.safeAdd(
        freshAndReadInput,
        u.cacheCreationTokens ?? 0,
      );
      totalInputTokens = TokenAggregator.safeAdd(totalInputTokens, providerInputTokens);
      totalOutputTokens = TokenAggregator.safeAdd(totalOutputTokens, u.outputTokens);
      totalCacheReadTokens = TokenAggregator.safeAdd(totalCacheReadTokens, u.cacheReadTokens ?? 0);
      totalCacheCreationTokens = TokenAggregator.safeAdd(
        totalCacheCreationTokens,
        u.cacheCreationTokens ?? 0,
      );
      totalCacheCreation1hTokens = TokenAggregator.safeAdd(
        totalCacheCreation1hTokens,
        u.cacheCreation1hTokens ?? 0,
      );
      totalTokens = TokenAggregator.safeAdd(totalTokens, u.totalTokens);
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCacheCreation1hTokens,
      totalTokens,
      byProvider: new Map(this.usage),
    };
  }

  reset(): void {
    this.usage.clear();
  }
}
