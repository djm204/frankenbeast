import { createHash } from 'node:crypto';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '@franken/types';
import type { IBrain } from '@franken/types';
import { TokenAggregator, type AggregatedTokenUsage } from './token-aggregator.js';

export interface ProviderRegistryOptions {
  /** Maximum retries per provider before failing over */
  maxRetriesPerProvider?: number;
  /** Delay between retries in ms */
  retryDelayMs?: number;
  /** Rate limit backoff multiplier */
  backoffMultiplier?: number;
  /** Callback fired when switching providers */
  onProviderSwitch?: (event: {
    from: string;
    to: string;
    reason: string;
    brainSnapshotHash: string;
  }) => void;
}

interface ResolvedOptions {
  maxRetriesPerProvider: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  onProviderSwitch?: ProviderRegistryOptions['onProviderSwitch'];
}

export class ProviderRegistry {
  private providers: ILlmProvider[];
  private brain: IBrain;
  private opts: ResolvedOptions;
  private currentProviderIndex = 0;
  private readonly tokenAggregator = new TokenAggregator();

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
    this.opts = {
      maxRetriesPerProvider: options.maxRetriesPerProvider ?? 1,
      retryDelayMs: options.retryDelayMs ?? 1000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      onProviderSwitch: options.onProviderSwitch,
    };
  }

  get currentProvider(): ILlmProvider {
    return this.providers[this.currentProviderIndex]!;
  }

  getProviders(): readonly ILlmProvider[] {
    return this.providers;
  }

  async listProviders(): Promise<Array<{ provider: ILlmProvider; available: boolean }>> {
    return Promise.all(
      this.providers.map(async (provider) => ({
        provider,
        available: await provider.isAvailable(),
      })),
    );
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.providers.length; i++) {
      const providerIndex =
        (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[providerIndex]!;

      if (!(await provider.isAvailable())) continue;

      let effectiveRequest = request;
      if (i > 0) {
        const snapshot = this.brain.serialize();
        const previousProvider = this.providers[this.currentProviderIndex]!;
        snapshot.metadata.lastProvider = previousProvider.name;
        snapshot.metadata.switchReason = lastError?.message ?? 'unknown';

        if (this.opts.onProviderSwitch) {
          const json = JSON.stringify(snapshot);
          const hash =
            'sha256:' + createHash('sha256').update(json).digest('hex');
          this.opts.onProviderSwitch({
            from: previousProvider.name,
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

      for (
        let retry = 0;
        retry <= this.opts.maxRetriesPerProvider;
        retry++
      ) {
        try {
          const stream = provider.execute(effectiveRequest);
          let retried = false;
          const buffer: LlmStreamEvent[] = [];

          for await (const event of stream) {
            if (
              event.type === 'error' &&
              event.retryable &&
              retry < this.opts.maxRetriesPerProvider
            ) {
              lastError = new Error(event.error);
              const delay =
                this.opts.retryDelayMs *
                Math.pow(this.opts.backoffMultiplier, retry);
              await new Promise((resolve) => setTimeout(resolve, delay));
              retried = true;
              break; // discard buffer, retry same provider
            }
            if (event.type === 'error' && !event.retryable) {
              lastError = new Error(event.error);
              throw lastError; // discard buffer, failover
            }
            buffer.push(event);
          }

          if (retried) continue;

          // Attempt completed — flush buffered events
          for (const event of buffer) {
            if (event.type === 'done') {
              this.tokenAggregator.record(provider.name, event.usage);
            }
            yield event;
            if (event.type === 'done') {
              this.currentProviderIndex = providerIndex;
              return;
            }
          }

          break; // stream ended without done — failover
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error(String(error));
          break; // failover to next provider
        }
      }
    }

    // All providers exhausted
    this.brain.recovery.checkpoint({
      runId: 'failover-exhausted',
      phase: 'provider-failover',
      step: 0,
      context: { lastError: lastError?.message },
      timestamp: new Date().toISOString(),
    });

    throw new Error(
      `All providers exhausted. Last error: ${lastError?.message ?? 'unknown'}. ` +
        `Brain state checkpointed for recovery.`,
    );
  }

  getTokenUsage(): AggregatedTokenUsage {
    return this.tokenAggregator.getTotalUsage();
  }

  setOrder(providerNames: string[]): void {
    const byName = new Map(this.providers.map((p) => [p.name, p]));
    const reordered = providerNames
      .map((name) => byName.get(name))
      .filter((p): p is ILlmProvider => p !== undefined);
    if (reordered.length > 0) {
      this.providers = reordered;
      this.currentProviderIndex = 0;
    }
  }
}
