# Chunk 3.10: Cross-Provider Token Aggregation + BudgetTrigger Integration

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.2 (ProviderRegistry), Chunk 3.9 (failover integration test)
**Estimated size:** Medium (~150 lines)

---

## Purpose

When the orchestrator switches providers mid-task (Claude → Codex → Gemini), token usage is tracked per-provider but never aggregated. The Governor's `BudgetTrigger` needs a single cumulative token count to enforce budget limits across the entire run — regardless of how many providers were used. Without this, a task could exceed its budget by starting fresh counters after each failover.

## Design

### Token Aggregator

A `TokenAggregator` sits inside the `ProviderRegistry` and accumulates `TokenUsage` from every `done` event across all providers. It exposes a single `getTotalUsage(): AggregatedTokenUsage` method.

```typescript
// packages/franken-orchestrator/src/providers/token-aggregator.ts

import type { TokenUsage } from '@frankenbeast/types';

export interface AggregatedTokenUsage {
  /** Cumulative across all providers */
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;

  /** Per-provider breakdown */
  byProvider: Map<string, TokenUsage>;
}

export class TokenAggregator {
  private readonly usage = new Map<string, TokenUsage>();

  /**
   * Record token usage from a provider's `done` event.
   * Called by ProviderRegistry after each LLM response completes.
   */
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

  /** Cumulative usage across all providers */
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

  /** Reset (for testing or new runs) */
  reset(): void {
    this.usage.clear();
  }
}
```

### ProviderRegistry Integration

The `ProviderRegistry` (Chunk 3.2) wraps the `execute()` method to intercept `done` events:

```typescript
// Addition to packages/franken-orchestrator/src/providers/provider-registry.ts

import { TokenAggregator } from './token-aggregator.js';

// Inside ProviderRegistry class:
private readonly tokenAggregator = new TokenAggregator();

async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
  // ... existing failover logic ...
  for await (const event of provider.execute(request)) {
    if (event.type === 'done') {
      this.tokenAggregator.record(provider.name, event.usage);
    }
    yield event;
  }
}

/** Expose aggregated usage for BudgetTrigger and BrainSnapshot */
getTokenUsage(): AggregatedTokenUsage {
  return this.tokenAggregator.getTotalUsage();
}
```

### BudgetTrigger Wiring

The Governor's `BudgetTrigger` currently calls `TokenBudgetBreaker.checkAsync()` with a token count. The dep-factory (Chunk 8.1) passes a callback that reads from the aggregator:

```typescript
// In dep-factory.ts (Chunk 8.1 addition)

// Governor's BudgetTrigger gets cumulative tokens via callback
const getTokenCount = () => registry.getTokenUsage().totalTokens;
```

This replaces the single-provider token count that `BudgetTrigger` previously received, making budget enforcement provider-agnostic.

### BrainSnapshot Metadata

The `BrainSnapshot.metadata.totalTokensUsed` field (defined in ADR-031) is populated from the aggregator during serialization:

```typescript
// In SqliteBrain.serialize() or ProviderRegistry.serializeState()

const snapshot: BrainSnapshot = {
  // ... other fields ...
  metadata: {
    lastProvider: registry.getCurrentProvider().name,
    switchReason: reason,
    totalTokensUsed: registry.getTokenUsage().totalTokens,
  },
};
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/token-aggregator.test.ts

describe('TokenAggregator', () => {
  let aggregator: TokenAggregator;

  beforeEach(() => {
    aggregator = new TokenAggregator();
  });

  it('starts with zero totals', () => {
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(0);
    expect(usage.byProvider.size).toBe(0);
  });

  it('records usage from a single provider', () => {
    aggregator.record('claude-cli', { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(150);
    expect(usage.totalInputTokens).toBe(100);
    expect(usage.totalOutputTokens).toBe(50);
  });

  it('accumulates multiple calls to the same provider', () => {
    aggregator.record('claude-cli', { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    aggregator.record('claude-cli', { inputTokens: 200, outputTokens: 80, totalTokens: 280 });
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(430);
    expect(usage.byProvider.get('claude-cli')!.totalTokens).toBe(430);
  });

  it('aggregates across multiple providers', () => {
    aggregator.record('claude-cli', { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    aggregator.record('codex-cli', { inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    aggregator.record('gemini-api', { inputTokens: 50, outputTokens: 25, totalTokens: 75 });
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(525);
    expect(usage.totalInputTokens).toBe(350);
    expect(usage.totalOutputTokens).toBe(175);
    expect(usage.byProvider.size).toBe(3);
  });

  it('provides per-provider breakdown', () => {
    aggregator.record('claude-cli', { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    aggregator.record('codex-cli', { inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    const usage = aggregator.getTotalUsage();
    expect(usage.byProvider.get('claude-cli')!.totalTokens).toBe(150);
    expect(usage.byProvider.get('codex-cli')!.totalTokens).toBe(300);
  });

  it('returns a copy of byProvider map (no mutation)', () => {
    aggregator.record('claude-cli', { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    const usage1 = aggregator.getTotalUsage();
    usage1.byProvider.clear();
    const usage2 = aggregator.getTotalUsage();
    expect(usage2.byProvider.size).toBe(1);
  });

  it('resets all counters', () => {
    aggregator.record('claude-cli', { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    aggregator.reset();
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(0);
    expect(usage.byProvider.size).toBe(0);
  });
});

// Integration: verify ProviderRegistry records tokens on done events
describe('ProviderRegistry token tracking', () => {
  it('accumulates tokens across provider switches', async () => {
    const registry = createTestRegistry([mockClaude, mockCodex]);
    // mockClaude yields done with 150 tokens then fails
    // mockCodex yields done with 300 tokens
    await consumeAll(registry.execute(testRequest));
    const usage = registry.getTokenUsage();
    expect(usage.totalTokens).toBe(450);
    expect(usage.byProvider.size).toBe(2);
  });

  it('populates BrainSnapshot metadata with aggregated tokens', () => {
    // After execution, serialize brain and verify totalTokensUsed
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/token-aggregator.ts`
- **Modify:** `packages/franken-orchestrator/src/providers/provider-registry.ts` — add `TokenAggregator` field, record on `done` events, expose `getTokenUsage()`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/token-aggregator.test.ts`

## Exit Criteria

- `TokenAggregator` tracks cumulative token usage across all providers
- `ProviderRegistry.getTokenUsage()` returns aggregated totals + per-provider breakdown
- Token counts survive provider failover (usage from provider A is preserved when switching to B)
- `BrainSnapshot.metadata.totalTokensUsed` is populated from the aggregator
- Governor's `BudgetTrigger` can read cumulative tokens via callback
- All tests pass
