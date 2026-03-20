# Chunk 3.2: ProviderRegistry

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Medium (~150 lines + tests)

---

## Purpose

Implement the `ProviderRegistry` class that manages an ordered list of `ILlmProvider` instances and handles automatic failover with brain state handoff.

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/provider-registry.ts

import { createHash } from 'node:crypto';
import type { ILlmProvider, LlmRequest, LlmStreamEvent, TokenUsage } from '@frankenbeast/types';
import type { IBrain } from '@frankenbeast/types';

export interface ProviderRegistryOptions {
  /** Maximum retries per provider before failing over */
  maxRetriesPerProvider?: number;  // default: 1
  /** Delay between retries in ms */
  retryDelayMs?: number;          // default: 1000
  /** Rate limit backoff multiplier */
  backoffMultiplier?: number;     // default: 2
  /** Callback fired when switching providers (used by audit trail, Phase 7.3) */
  onProviderSwitch?: (event: {
    from: string;
    to: string;
    reason: string;
    brainSnapshotHash: string;
  }) => void;
}

export class ProviderRegistry {
  private providers: ILlmProvider[];
  private brain: IBrain;
  private options: Required<ProviderRegistryOptions>;
  private currentProviderIndex: number = 0;

  constructor(
    providers: ILlmProvider[],
    brain: IBrain,
    options: ProviderRegistryOptions = {},
  ) {
    if (providers.length === 0) {
      throw new Error('ProviderRegistry requires at least one provider');
    }
    this.providers = providers;
    this.brain = brain;
    this.options = {
      maxRetriesPerProvider: options.maxRetriesPerProvider ?? 1,
      retryDelayMs: options.retryDelayMs ?? 1000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
    };
  }

  /** Get the currently active provider */
  get currentProvider(): ILlmProvider {
    return this.providers[this.currentProviderIndex];
  }

  /** Get all registered providers (raw list) */
  getProviders(): readonly ILlmProvider[] {
    return this.providers;
  }

  /** Get all registered providers with availability status */
  async listProviders(): Promise<Array<{ provider: ILlmProvider; available: boolean }>> {
    return Promise.all(
      this.providers.map(async (provider) => ({
        provider,
        available: await provider.isAvailable(),
      }))
    );
  }

  /**
   * Execute a request with automatic failover.
   *
   * Flow:
   * 1. Try current provider
   * 2. On retryable error: retry up to maxRetriesPerProvider times
   * 3. On non-retryable error or retries exhausted: serialize brain, failover to next provider
   * 4. Next provider receives handoff context via formatHandoff()
   * 5. If all providers exhausted: checkpoint brain and throw
   */
  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.providers.length; i++) {
      const providerIndex = (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[providerIndex];

      if (!(await provider.isAvailable())) continue;

      // If switching providers, inject handoff context and emit callback
      let effectiveRequest = request;
      if (i > 0) {
        const snapshot = this.brain.serialize();
        snapshot.metadata.lastProvider = this.providers[this.currentProviderIndex].name;
        snapshot.metadata.switchReason = lastError?.message ?? 'unknown';

        // Emit provider switch callback (wired to audit trail in Phase 8)
        if (this.options.onProviderSwitch) {
          const snapshotJson = JSON.stringify(snapshot);
          const hash = 'sha256:' + createHash('sha256').update(snapshotJson).digest('hex');
          this.options.onProviderSwitch({
            from: this.providers[this.currentProviderIndex].name,
            to: provider.name,
            reason: lastError?.message ?? 'unknown',
            brainSnapshotHash: hash,
          });
        }

        const handoffContext = provider.formatHandoff(snapshot);
        effectiveRequest = {
          ...request,
          systemPrompt: request.systemPrompt + '\n\n' + handoffContext,
        };
      }

      for (let retry = 0; retry <= this.options.maxRetriesPerProvider; retry++) {
        try {
          const stream = provider.execute(effectiveRequest);
          for await (const event of stream) {
            if (event.type === 'error' && event.retryable && retry < this.options.maxRetriesPerProvider) {
              lastError = new Error(event.error);
              const delay = this.options.retryDelayMs * Math.pow(this.options.backoffMultiplier, retry);
              await new Promise(resolve => setTimeout(resolve, delay));
              break;  // retry same provider
            }
            if (event.type === 'error' && !event.retryable) {
              lastError = new Error(event.error);
              throw lastError;  // failover to next provider
            }
            yield event;
            if (event.type === 'done') {
              this.currentProviderIndex = providerIndex;
              return;
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          break;  // failover to next provider
        }
      }
    }

    // All providers exhausted — checkpoint and throw
    this.brain.recovery.checkpoint({
      runId: 'failover-exhausted',
      phase: 'provider-failover',
      step: 0,
      context: { lastError: lastError?.message },
      timestamp: new Date().toISOString(),
    });

    throw new Error(
      `All providers exhausted. Last error: ${lastError?.message ?? 'unknown'}. ` +
      `Brain state checkpointed for recovery.`
    );
  }

  /** Reorder providers (e.g., from user config or dashboard) */
  setOrder(providerNames: string[]): void {
    const byName = new Map(this.providers.map(p => [p.name, p]));
    const reordered = providerNames
      .map(name => byName.get(name))
      .filter((p): p is ILlmProvider => p !== undefined);
    if (reordered.length > 0) {
      this.providers = reordered;
      this.currentProviderIndex = 0;
    }
  }
}
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/provider-registry.test.ts

describe('ProviderRegistry', () => {
  // Helper: create mock provider
  function mockProvider(name: string, opts: {
    available?: boolean;
    events?: LlmStreamEvent[];
    failOnExecute?: Error;
  }): ILlmProvider { ... }

  describe('constructor', () => {
    it('throws if no providers given', () => { ... });
    it('sets defaults for options', () => { ... });
  });

  describe('execute()', () => {
    it('uses first available provider', () => { ... });
    it('skips unavailable providers', () => { ... });
    it('yields all stream events from successful provider', () => { ... });
    it('retries on retryable error up to maxRetriesPerProvider', () => { ... });
    it('fails over to next provider on non-retryable error', () => { ... });
    it('injects handoff context on failover', () => {
      // Verify formatHandoff() was called
      // Verify systemPrompt was augmented
    });
    it('serializes brain state before failover', () => { ... });
    it('checkpoints brain when all providers exhausted', () => { ... });
    it('throws with descriptive error when all providers exhausted', () => { ... });
    it('applies exponential backoff between retries', () => { ... });
  });

  describe('listProviders()', () => {
    it('returns all providers with availability status', () => { ... });
  });

  describe('setOrder()', () => {
    it('reorders providers by name', () => { ... });
    it('ignores unknown provider names', () => { ... });
    it('resets currentProviderIndex to 0', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/provider-registry.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/provider-registry.test.ts`

## Exit Criteria

- `ProviderRegistry` tries providers in order with automatic failover
- Brain state is serialized and injected via `formatHandoff()` on provider switch
- `onProviderSwitch` callback fires on failover with from/to names, reason, and brain snapshot hash
- Retryable errors trigger retry with exponential backoff
- Non-retryable errors trigger immediate failover
- All providers exhausted → checkpoint + throw
- `currentProvider` getter returns active provider
- `getProviders()` returns full provider list
- `setOrder()` allows runtime reordering
- `listProviders()` shows availability status
