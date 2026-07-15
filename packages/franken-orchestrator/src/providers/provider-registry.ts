import { createHash } from 'node:crypto';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '@franken/types';
import { isoNow, seededRandom, wallClockNow } from '@franken/types';
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
  /** Consecutive failures before opening the provider circuit. Default: 5. */
  circuitBreakerFailureThreshold?: number;
  /** Base provider cool-down window in ms after a breaker opens. Default: 60s. */
  circuitBreakerCooldownMs?: number;
  /** Jitter ratio applied to cool-downs to avoid synchronized retry storms. Default: 0.1. */
  circuitBreakerCooldownJitterRatio?: number;
  /** Bounded half-open probes allowed per cool-down window. Default: 1. */
  circuitBreakerHalfOpenMaxProbes?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Callback fired when provider health/circuit state changes. */
  onProviderHealthChange?: (event: ProviderHealthEvent) => void;
}

export interface ProviderSwitchEvent {
  from: string;
  to: string;
  reason: string;
  brainSnapshotHash: string;
}

export type ProviderCircuitState = 'closed' | 'open' | 'half-open';

export interface ProviderHealthState {
  /** Stable key for one provider instance; duplicate provider names receive #2/#3 suffixes. */
  providerKey: string;
  providerName: string;
  /** Request-level model when known; typed LlmRequest currently leaves this unspecified. */
  model: string | null;
  state: ProviderCircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  failureRate: number;
  lastErrorClass: string | null;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
  halfOpenProbeCount: number;
  updatedAt: string;
}

export interface ProviderHealthEvent {
  /** Stable key for the provider instance that changed state. */
  providerKey: string;
  providerName: string;
  state: ProviderCircuitState;
  reason: string;
  health: ProviderHealthState;
}

interface ProviderHealthRecord {
  providerKey: string;
  providerName: string;
  model: string | null;
  state: ProviderCircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  lastErrorClass: string | null;
  lastFailureAtMs: number | null;
  cooldownUntilMs: number | null;
  halfOpenProbeCount: number;
  updatedAtMs: number;
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
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownMs: number;
  circuitBreakerCooldownJitterRatio: number;
  circuitBreakerHalfOpenMaxProbes: number;
  now: () => number;
  onProviderHealthChange?: ProviderRegistryOptions['onProviderHealthChange'];
}

const MAX_RETRIES_PER_PROVIDER = 5;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 20;
const MAX_CIRCUIT_BREAKER_COOLDOWN_MS = 3_600_000;
const MAX_CIRCUIT_BREAKER_HALF_OPEN_PROBES = 10;

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

function normalizePositiveInteger(
  name: 'circuitBreakerFailureThreshold' | 'circuitBreakerHalfOpenMaxProbes',
  value: number | undefined,
  defaultValue: number,
  maxValue: number,
): number {
  const normalized = value ?? defaultValue;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maxValue) {
    throw new Error(`${name} must be an integer between 1 and ${maxValue}`);
  }
  return normalized;
}

function normalizeCircuitBreakerCooldownMs(value: number | undefined): number {
  const normalized = value ?? 60_000;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > MAX_CIRCUIT_BREAKER_COOLDOWN_MS) {
    throw new Error(`circuitBreakerCooldownMs must be a finite number between 0 and ${MAX_CIRCUIT_BREAKER_COOLDOWN_MS}`);
  }
  return normalized;
}

function normalizeJitterRatio(value: number | undefined): number {
  const normalized = value ?? 0.1;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new Error('circuitBreakerCooldownJitterRatio must be a finite number between 0 and 1');
  }
  return normalized;
}

function classifyProviderError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  const normalized = message.toLowerCase();
  if (
    normalized.includes('bad request')
    || normalized.includes('invalid request')
    || normalized.includes('context length')
    || normalized.includes('context window')
    || normalized.includes('tool schema')
    || normalized.includes('schema validation')
    || normalized.includes('400')
  ) return 'request_error';
  if (normalized.includes('rate limit') || normalized.includes('429')) return 'rate_limit';
  if (normalized.includes('auth') || normalized.includes('permission') || normalized.includes('unauthorized')) return 'auth';
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'timeout';
  if (normalized.includes('unavailable') || normalized.includes('enoent')) return 'unavailable';
  if (normalized.includes('stream ended without done')) return 'stream_incomplete';
  return 'execution_error';
}

function shouldRecordProviderHealthFailure(error: Error | string): boolean {
  return classifyProviderError(error) !== 'request_error';
}

export class ProviderRegistry {
  private providers: ILlmProvider[];
  private brain: IBrain;
  private opts: ResolvedOptions;
  private currentProviderIndex = 0;
  private readonly tokenAggregator = new TokenAggregator();
  private readonly providerHealth = new Map<string, ProviderHealthRecord>();
  private readonly providerKeys = new WeakMap<ILlmProvider, string>();

  constructor(
    providers: ILlmProvider[],
    brain: IBrain,
    options: ProviderRegistryOptions = {},
  ) {
    if (providers.length === 0) {
      throw new Error('ProviderRegistry requires at least one provider');
    }
    this.providers = providers;
    this.assignProviderKeys(providers);
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
      circuitBreakerFailureThreshold: normalizePositiveInteger(
        'circuitBreakerFailureThreshold',
        options.circuitBreakerFailureThreshold,
        5,
        MAX_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      ),
      circuitBreakerCooldownMs: normalizeCircuitBreakerCooldownMs(options.circuitBreakerCooldownMs),
      circuitBreakerCooldownJitterRatio: normalizeJitterRatio(options.circuitBreakerCooldownJitterRatio),
      circuitBreakerHalfOpenMaxProbes: normalizePositiveInteger(
        'circuitBreakerHalfOpenMaxProbes',
        options.circuitBreakerHalfOpenMaxProbes,
        1,
        MAX_CIRCUIT_BREAKER_HALF_OPEN_PROBES,
      ),
      now: options.now ?? wallClockNow,
      onProviderHealthChange: options.onProviderHealthChange,
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

  getProviderHealth(providerNameOrKey: string): ProviderHealthState | undefined {
    const exact = this.providerHealth.get(providerNameOrKey);
    if (exact) return this.toHealthState(exact);
    const matches = [...this.providerHealth.values()].filter((health) => health.providerName === providerNameOrKey);
    return matches.length === 1 ? this.toHealthState(matches[0]!) : undefined;
  }

  listProviderHealth(): ProviderHealthState[] {
    return [...this.providerHealth.values()].map((record) => this.toHealthState(record));
  }

  private assignProviderKeys(providers: ILlmProvider[]): void {
    const totals = new Map<string, number>();
    for (const provider of providers) {
      totals.set(provider.name, (totals.get(provider.name) ?? 0) + 1);
    }

    const occurrences = new Map<string, number>();
    const usedKeys = new Set<string>();
    for (const provider of providers) {
      if (this.providerKeys.has(provider)) continue;
      const occurrence = occurrences.get(provider.name) ?? 0;
      occurrences.set(provider.name, occurrence + 1);
      const candidateKey = (totals.get(provider.name) ?? 0) > 1
        ? `${provider.name}#${occurrence + 1}`
        : provider.name;
      let providerKey = candidateKey;
      let collisionSuffix = 2;
      while (usedKeys.has(providerKey)) {
        providerKey = `${candidateKey}#${collisionSuffix}`;
        collisionSuffix += 1;
      }
      usedKeys.add(providerKey);
      this.providerKeys.set(provider, providerKey);
    }
  }

  private providerKey(provider: ILlmProvider): string {
    return this.providerKeys.get(provider) ?? provider.name;
  }

  private getOrCreateProviderHealth(provider: ILlmProvider): ProviderHealthRecord {
    const providerKey = this.providerKey(provider);
    const existing = this.providerHealth.get(providerKey);
    if (existing) return existing;
    const now = this.opts.now();
    const created: ProviderHealthRecord = {
      providerKey,
      providerName: provider.name,
      model: null,
      state: 'closed',
      failures: 0,
      successes: 0,
      consecutiveFailures: 0,
      lastErrorClass: null,
      lastFailureAtMs: null,
      cooldownUntilMs: null,
      halfOpenProbeCount: 0,
      updatedAtMs: now,
    };
    this.providerHealth.set(providerKey, created);
    return created;
  }

  private toHealthState(record: ProviderHealthRecord): ProviderHealthState {
    const total = record.failures + record.successes;
    return {
      providerKey: record.providerKey,
      providerName: record.providerName,
      model: record.model,
      state: record.state,
      failures: record.failures,
      successes: record.successes,
      consecutiveFailures: record.consecutiveFailures,
      failureRate: total === 0 ? 0 : record.failures / total,
      lastErrorClass: record.lastErrorClass,
      lastFailureAt: record.lastFailureAtMs === null ? null : new Date(record.lastFailureAtMs).toISOString(),
      cooldownUntil: record.cooldownUntilMs === null ? null : new Date(record.cooldownUntilMs).toISOString(),
      halfOpenProbeCount: record.halfOpenProbeCount,
      updatedAt: new Date(record.updatedAtMs).toISOString(),
    };
  }

  private emitProviderHealthChange(provider: ILlmProvider, reason: string): void {
    const record = this.providerHealth.get(this.providerKey(provider));
    if (!record || !this.opts.onProviderHealthChange) return;
    this.opts.onProviderHealthChange({
      providerKey: record.providerKey,
      providerName: record.providerName,
      state: record.state,
      reason,
      health: this.toHealthState(record),
    });
  }

  private tripProvider(provider: ILlmProvider, error: Error | string, reason: string): ProviderHealthRecord {
    const record = this.getOrCreateProviderHealth(provider);
    const now = this.opts.now();
    const jitterMs = this.opts.circuitBreakerCooldownMs
      * this.opts.circuitBreakerCooldownJitterRatio
      * seededRandom.random();
    record.state = 'open';
    record.cooldownUntilMs = now + this.opts.circuitBreakerCooldownMs + jitterMs;
    record.halfOpenProbeCount = 0;
    record.lastErrorClass = classifyProviderError(error);
    record.updatedAtMs = now;
    this.emitProviderHealthChange(provider, reason);
    return record;
  }

  private recordProviderFailure(
    provider: ILlmProvider,
    error: Error | string,
    options: { tripHalfOpenProbe?: boolean } = {},
  ): ProviderHealthRecord {
    const record = this.getOrCreateProviderHealth(provider);
    const now = this.opts.now();
    record.failures += 1;
    record.consecutiveFailures += 1;
    record.lastErrorClass = classifyProviderError(error);
    record.lastFailureAtMs = now;
    record.updatedAtMs = now;

    if (
      options.tripHalfOpenProbe
      || record.state === 'half-open'
      || record.consecutiveFailures >= this.opts.circuitBreakerFailureThreshold
    ) {
      return this.tripProvider(provider, error, 'provider-failure-threshold');
    }

    this.emitProviderHealthChange(provider, 'provider-failure');
    return record;
  }

  private recordProviderSuccess(provider: ILlmProvider): void {
    const record = this.getOrCreateProviderHealth(provider);
    const previousState = record.state;
    record.successes += 1;
    record.updatedAtMs = this.opts.now();

    if (previousState === 'open') {
      this.emitProviderHealthChange(provider, 'stale-success-ignored');
      return;
    }

    record.consecutiveFailures = 0;
    record.state = 'closed';
    record.cooldownUntilMs = null;
    record.halfOpenProbeCount = 0;
    this.emitProviderHealthChange(provider, previousState === 'half-open' ? 'half-open-probe-succeeded' : 'provider-success');
  }

  private reserveCircuitBreakerProbe(provider: ILlmProvider): Error | undefined {
    const record = this.getOrCreateProviderHealth(provider);
    const now = this.opts.now();

    if (record.state === 'open') {
      if (record.cooldownUntilMs !== null && now < record.cooldownUntilMs) {
        return new Error(`Provider ${record.providerName} circuit breaker is open until ${new Date(record.cooldownUntilMs).toISOString()}`);
      }
      record.state = 'half-open';
      record.halfOpenProbeCount = 0;
      record.updatedAtMs = now;
      this.emitProviderHealthChange(provider, 'cooldown-elapsed-half-open');
    }

    if (record.state === 'half-open') {
      if (record.halfOpenProbeCount >= this.opts.circuitBreakerHalfOpenMaxProbes) {
        return new Error(`Provider ${record.providerName} circuit breaker half-open probe limit reached`);
      }
      record.halfOpenProbeCount += 1;
      record.updatedAtMs = now;
      this.emitProviderHealthChange(provider, 'half-open-probe-started');
    }

    return undefined;
  }

  private hasReservedHalfOpenProbe(provider: ILlmProvider): boolean {
    const record = this.providerHealth.get(this.providerKey(provider));
    return record?.state === 'half-open' && record.halfOpenProbeCount > 0;
  }

  private releaseHalfOpenProbe(provider: ILlmProvider, reason: string): void {
    const record = this.providerHealth.get(this.providerKey(provider));
    if (record?.state !== 'half-open' || record.halfOpenProbeCount <= 0) return;
    this.tripProvider(provider, reason, 'half-open-probe-released');
  }

  private getProviderIterationOrder(): number[] {
    const normalOrder = this.providers.map((_, offset) => (this.currentProviderIndex + offset) % this.providers.length);
    const now = this.opts.now();
    const readyProbeIndexes = this.providers
      .map((provider, index) => ({ provider, index }))
      .filter(({ provider }) => {
        const record = this.providerHealth.get(this.providerKey(provider));
        return record?.state === 'open'
          && (record.cooldownUntilMs === null || now >= record.cooldownUntilMs);
      })
      .map(({ index }) => index);

    return [...new Set([...readyProbeIndexes, ...normalOrder])];
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    let lastError: Error | undefined;
    let terminalError: Error | undefined;
    let lastFailedProviderName: string | undefined;
    const unavailableProviders: string[] = [];
    const circuitErrors: string[] = [];
    const availabilityErrors: string[] = [];
    let attemptedProviders = 0;

    const providerOrder = this.getProviderIterationOrder();
    for (let i = 0; i < providerOrder.length; i++) {
      const providerIndex = providerOrder[i]!;
      const provider = this.providers[providerIndex]!;

      const circuitError = this.reserveCircuitBreakerProbe(provider);
      if (circuitError) {
        unavailableProviders.push(provider.name);
        circuitErrors.push(circuitError.message);
        const health = this.providerHealth.get(this.providerKey(provider));
        if (health?.lastErrorClass === 'unavailable' || health?.lastErrorClass === 'auth') {
          availabilityErrors.push(`Provider ${provider.name} circuit opened after ${health.lastErrorClass} failure`);
        }
        if (!lastError) {
          lastFailedProviderName = provider.name;
          lastError = circuitError;
        }
        terminalError ??= circuitError;
        continue;
      }

      if (!(await provider.isAvailable())) {
        unavailableProviders.push(provider.name);
        const availabilityError = new Error(`Provider ${provider.name} is unavailable`);
        availabilityErrors.push(availabilityError.message);
        this.recordProviderFailure(provider, availabilityError);
        if (!lastError) {
          lastFailedProviderName = provider.name;
          lastError = availabilityError;
        }
        terminalError ??= availabilityError;
        continue;
      }
      attemptedProviders++;

      let effectiveRequest = request;
      if (providerIndex !== this.currentProviderIndex) {
        const snapshot = this.brain.serialize();
        const failedProviderName = lastFailedProviderName ?? this.providers[this.currentProviderIndex]!.name;
        const health = this.providerHealth.get(this.providerKey(provider));
        const switchReason = lastError?.message
          ?? (health?.state === 'half-open' ? 'provider circuit breaker cooldown elapsed' : 'unknown');
        snapshot.metadata.lastProvider = failedProviderName;
        snapshot.metadata.switchReason = switchReason;

        if (this.opts.onProviderSwitch) {
          const json = JSON.stringify(snapshot);
          const hash =
            'sha256:' + createHash('sha256').update(json).digest('hex');
          this.opts.onProviderSwitch({
            from: failedProviderName,
            to: provider.name,
            reason: switchReason,
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
        let failureAlreadyRecorded = false;
        let terminalEventObserved = false;
        const halfOpenProbeReserved = this.hasReservedHalfOpenProbe(provider);
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
              terminalEventObserved = true;
              const health = this.recordProviderFailure(provider, lastError);
              failureAlreadyRecorded = true;
              if (health.state === 'open') {
                terminalError = lastError;
                lastFailedProviderName = provider.name;
                throw lastError;
              }
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
              terminalEventObserved = true;
              if (shouldRecordProviderHealthFailure(lastError)) {
                this.recordProviderFailure(provider, lastError, { tripHalfOpenProbe: halfOpenProbeReserved });
                failureAlreadyRecorded = true;
              } else {
                failureAlreadyRecorded = true;
              }
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
              terminalEventObserved = true;
              this.tokenAggregator.record(provider.name, event.usage);
              this.recordProviderSuccess(provider);
            }
            yield event;
            if (event.type === 'done') {
              this.currentProviderIndex = providerIndex;
              return;
            }
          }

          lastError = new Error('stream ended without done');
          terminalEventObserved = true;
          this.recordProviderFailure(provider, lastError);
          terminalError = lastError;
          lastFailedProviderName = provider.name;
          break; // stream ended without done — failover
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error(String(error));
          if (!failureAlreadyRecorded) {
            terminalEventObserved = true;
            if (shouldRecordProviderHealthFailure(lastError)) {
              this.recordProviderFailure(provider, lastError, { tripHalfOpenProbe: halfOpenProbeReserved });
            }
          }
          terminalError = lastError;
          lastFailedProviderName = provider.name;
          break; // failover to next provider
        } finally {
          if (halfOpenProbeReserved && !terminalEventObserved) {
            this.releaseHalfOpenProbe(provider, 'half-open probe stream ended before a terminal event');
          }
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
      ? [
        `No providers available. Checked: ${unavailableProviders.join(', ')}.`,
        circuitErrors.length > 0
          ? `Provider circuit breakers are open: ${circuitErrors.join('; ')}.`
          : undefined,
        availabilityErrors.length > 0
          ? `Unavailable providers: ${availabilityErrors.join('; ')}.`
          : undefined,
        availabilityErrors.length > 0
          ? 'Install or authenticate configured provider CLIs, or configure provider overrides.'
          : undefined,
      ].filter((part): part is string => part !== undefined).join(' ')
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
