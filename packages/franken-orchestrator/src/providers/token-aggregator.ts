import type { TokenUsage } from '@franken/types';

export interface AggregatedTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byProvider: Map<string, TokenUsage>;
}

export class TokenAggregator {
  private readonly usage = new Map<string, TokenUsage>();

  record(providerName: string, usage: TokenUsage): void {
    const existing = this.usage.get(providerName) ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    this.usage.set(providerName, {
      inputTokens: existing.inputTokens + usage.inputTokens,
      outputTokens: existing.outputTokens + usage.outputTokens,
      totalTokens: existing.totalTokens + usage.totalTokens,
    });
  }

  getTotalUsage(): AggregatedTokenUsage {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;

    for (const u of this.usage.values()) {
      totalInputTokens += u.inputTokens;
      totalOutputTokens += u.outputTokens;
      totalTokens += u.totalTokens;
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      byProvider: new Map(this.usage),
    };
  }

  reset(): void {
    this.usage.clear();
  }
}
