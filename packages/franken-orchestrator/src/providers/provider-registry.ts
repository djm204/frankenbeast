import { createHash } from 'node:crypto';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '@franken/types';
import { isoNow } from '@franken/types';
import type { IBrain } from '@franken/types';
import { TokenAggregator, type AggregatedTokenUsage } from './token-aggregator.js';
import { truncateSnapshot } from './format-handoff.js';

export interface ProviderRegistryOptions {
  /**
   * Maximum retries per provider before failing over. Default: 1.
   * Must be an integer between 0 and 5 so provider outages cannot create
   * unbounded retry loops across long fallback chains.
   */
  maxRetriesPerProvider?: number;
  /** Initial delay between retries in ms */
  retryDelayMs?: number;
  /** Maximum delay between retries in ms */
  maxRetryDelayMs?: number;
  /** Rate limit backoff multiplier */
  backoffMultiplier?: number;
  /** Injectable sleep for deterministic tests */
  sleep?: (ms: number) => Promise<void>;
  /** Callback fired when switching providers */
  onProviderSwitch?: (event: ProviderSwitchEvent) => void;
}

export interface ProviderSwitchEvent {
  from: string;
  to: string;
  reason: string;
  brainSnapshotHash: string;
}

export interface ModelProviderFailoverAuditPayload extends ProviderSwitchEvent {
  event: 'model-provider.failover';
  category: 'availability';
  operatorGuidance: string;
}

export function createModelProviderFailoverAuditPayload(
  event: ProviderSwitchEvent,
): ModelProviderFailoverAuditPayload {
  return {
    event: 'model-provider.failover',
    category: 'availability',
    from: event.from,
    to: event.to,
    reason: event.reason,
    brainSnapshotHash: event.brainSnapshotHash,
    operatorGuidance:
      'Provider failover occurred. Inspect the failed provider health/credentials and use brainSnapshotHash to correlate the handoff state.',
  };
}

interface ResolvedOptions {
  maxRetriesPerProvider: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  backoffMultiplier: number;
  sleep: (ms: number) => Promise<void>;
  onProviderSwitch?: ProviderRegistryOptions['onProviderSwitch'];
}

const MAX_RETRIES_PER_PROVIDER = 5;
const MAX_RETRY_DELAY_MS = 30_000;

function normalizeMaxRetriesPerProvider(value: number | undefined): number {
  const normalized = value ?? 1;
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > MAX_RETRIES_PER_PROVIDER) {
    throw new Error(`maxRetriesPerProvider must be an integer between 0 and ${MAX_RETRIES_PER_PROVIDER}`);
  }
  return normalized;
}

function normalizeNonNegativeFinite(
  name: 'retryDelayMs' | 'maxRetryDelayMs',
  value: number | undefined,
  defaultValue: number,
): number {
  const normalized = value ?? defaultValue;
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  return normalized;
}

function normalizeBackoffMultiplier(value: number | undefined): number {
  const normalized = value ?? 2;
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error('backoffMultiplier must be a finite number greater than or equal to 1');
  }
  return normalized;
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
    const retryDelayMs = normalizeNonNegativeFinite('retryDelayMs', options.retryDelayMs, 1000);
    const maxRetryDelayMs = normalizeNonNegativeFinite('maxRetryDelayMs', options.maxRetryDelayMs, MAX_RETRY_DELAY_MS);
    this.opts = {
      maxRetriesPerProvider: normalizeMaxRetriesPerProvider(options.maxRetriesPerProvider),
      retryDelayMs,
      maxRetryDelayMs,
      backoffMultiplier: normalizeBackoffMultiplier(options.backoffMultiplier),
      sleep: options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
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
    let terminalError: Error | undefined;
    let lastFailedProviderName: string | undefined;
    const unavailableProviders: string[] = [];
    let attemptedProviders = 0;

    for (let i = 0; i < this.providers.length; i++) {
      const providerIndex =
        (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[providerIndex]!;

      if (!(await provider.isAvailable())) {
        unavailableProviders.push(provider.name);
        const availabilityError = new Error(`Provider ${provider.name} is unavailable`);
        if (!lastError) {
          lastFailedProviderName = provider.name;
          lastError = availabilityError;
        }
        terminalError ??= availabilityError;
        continue;
      }
      attemptedProviders++;

      let effectiveRequest = request;
      if (i > 0) {
        const snapshot = this.brain.serialize();
        const failedProviderName = lastFailedProviderName ?? this.providers[this.currentProviderIndex]!.name;
        snapshot.metadata.lastProvider = failedProviderName;
        snapshot.metadata.switchReason = lastError?.message ?? 'unknown';

        if (this.opts.onProviderSwitch) {
          const json = JSON.stringify(snapshot);
          const hash =
            'sha256:' + createHash('sha256').update(json).digest('hex');
          this.opts.onProviderSwitch({
            from: failedProviderName,
            to: provider.name,
            reason: lastError?.message ?? 'unknown',
            brainSnapshotHash: hash,
          });
        }

        const effectiveSnapshot =
          provider.capabilities.maxHandoffTokens != null
            ? truncateSnapshot(snapshot, provider.capabilities.maxHandoffTokens)
            : snapshot;
        const handoffContext = provider.formatHandoff(effectiveSnapshot);
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
              const delay = Math.min(
                this.opts.retryDelayMs *
                Math.pow(this.opts.backoffMultiplier, retry),
                this.opts.maxRetryDelayMs,
              );
              await this.opts.sleep(delay);
              retried = true;
              break; // discard buffer, retry same provider
            }
            if (event.type === 'error') {
              lastError = new Error(event.error);
              terminalError = lastError;
              lastFailedProviderName = provider.name;
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

          lastError = new Error('stream ended without done');
          terminalError = lastError;
          lastFailedProviderName = provider.name;
          break; // stream ended without done — failover
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error(String(error));
          terminalError = lastError;
          lastFailedProviderName = provider.name;
          break; // failover to next provider
        }
      }
    }

    // All providers exhausted
    this.brain.recovery.checkpoint({
      runId: 'failover-exhausted',
      phase: 'provider-failover',
      step: 0,
      context: { lastError: (terminalError ?? lastError)?.message },
      timestamp: isoNow(),
    });

    const exhaustionReason = attemptedProviders === 0
      ? `No providers available. Checked: ${unavailableProviders.join(', ')}. `
        + 'Install or authenticate at least one configured provider CLI, or configure provider overrides.'
      : `All providers exhausted. Last error: ${(terminalError ?? lastError)?.message ?? 'unknown'}. `;

    throw new Error(
      exhaustionReason + 'Brain state checkpointed for recovery.',
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
