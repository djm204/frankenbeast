import { describe, it, expect, vi } from 'vitest';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
  ProviderCapabilities,
  BrainSnapshot,
} from '@franken/types';
import { seededRandom } from '@franken/types';
import { ProviderRegistry } from '../../../src/providers/provider-registry.js';

// --- Helpers ---

function mockProvider(
  name: string,
  opts: {
    available?: boolean;
    events?: LlmStreamEvent[];
    failOnExecute?: Error;
  } = {},
): ILlmProvider {
  const events = opts.events ?? [
    { type: 'text' as const, content: `Hello from ${name}` },
    {
      type: 'done' as const,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    },
  ];

  return {
    name,
    type: 'claude-cli',
    authMethod: 'cli-login',
    capabilities: {
      streaming: true,
      toolUse: true,
      vision: false,
      maxContextTokens: 200_000,
      mcpSupport: false,
      skillDiscovery: false,
    } satisfies ProviderCapabilities,
    isAvailable: vi.fn().mockResolvedValue(opts.available ?? true),
    execute: vi.fn(async function* () {
      if (opts.failOnExecute) throw opts.failOnExecute;
      for (const event of events) {
        yield event;
      }
    }),
    formatHandoff: vi.fn((_snapshot: BrainSnapshot) => '--- HANDOFF ---'),
  };
}

function makeRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    systemPrompt: 'You are helpful',
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

async function collectEvents(
  iterable: AsyncIterable<LlmStreamEvent>,
): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

// --- Mock brain ---

function mockBrain() {
  const checkpoints: Array<{ phase: string }> = [];
  return {
    working: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      keys: vi.fn(() => []),
      snapshot: vi.fn(() => ({})),
      restore: vi.fn(),
      clear: vi.fn(),
    },
    episodic: {
      record: vi.fn(),
      recall: vi.fn(() => []),
      recentFailures: vi.fn(() => []),
      recent: vi.fn(() => []),
      count: vi.fn(() => 0),
    },
    recovery: {
      checkpoint: vi.fn((state: { phase: string }) => {
        checkpoints.push(state);
        return { id: `cp-${checkpoints.length}` };
      }),
      lastCheckpoint: vi.fn(() =>
        checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null,
      ),
      listCheckpoints: vi.fn(() => checkpoints),
      clearCheckpoints: vi.fn(),
    },
    serialize: vi.fn(() => ({
      version: 1,
      timestamp: new Date().toISOString(),
      working: {},
      episodic: [],
      checkpoint: null,
      metadata: {
        lastProvider: '',
        switchReason: '',
        totalTokensUsed: 0,
      },
    })),
    _checkpoints: checkpoints,
  };
}

// --- Tests ---

describe('ProviderRegistry', () => {
  describe('constructor', () => {
    it('throws if no providers given', () => {
      expect(() => new ProviderRegistry([], mockBrain())).toThrow(
        'ProviderRegistry requires at least one provider',
      );
    });

    it('sets defaults for options', () => {
      const registry = new ProviderRegistry([mockProvider('a')], mockBrain());
      expect(registry.currentProvider.name).toBe('a');
    });
  });

  describe('currentProvider', () => {
    it('returns the first provider initially', () => {
      const p1 = mockProvider('first');
      const p2 = mockProvider('second');
      const registry = new ProviderRegistry([p1, p2], mockBrain());
      expect(registry.currentProvider).toBe(p1);
    });
  });

  describe('getProviders()', () => {
    it('returns all providers', () => {
      const p1 = mockProvider('a');
      const p2 = mockProvider('b');
      const registry = new ProviderRegistry([p1, p2], mockBrain());
      expect(registry.getProviders()).toEqual([p1, p2]);
    });
  });

  describe('listProviders()', () => {
    it('returns all providers with availability status', async () => {
      const p1 = mockProvider('a', { available: true });
      const p2 = mockProvider('b', { available: false });
      const registry = new ProviderRegistry([p1, p2], mockBrain());

      const list = await registry.listProviders();
      expect(list).toEqual([
        { provider: p1, available: true },
        { provider: p2, available: false },
      ]);
    });
  });

  describe('execute()', () => {
    it('uses first available provider', async () => {
      const p1 = mockProvider('primary');
      const registry = new ProviderRegistry([p1], mockBrain());

      const events = await collectEvents(registry.execute(makeRequest()));
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'text', content: 'Hello from primary' });
      expect(events[1].type).toBe('done');
    });

    it('skips unavailable providers', async () => {
      const p1 = mockProvider('down', { available: false });
      const p2 = mockProvider('up');
      const registry = new ProviderRegistry([p1, p2], mockBrain());

      const events = await collectEvents(registry.execute(makeRequest()));
      expect(events[0]).toEqual({ type: 'text', content: 'Hello from up' });
      expect(p1.execute).not.toHaveBeenCalled();
      expect(p2.execute).toHaveBeenCalled();
    });

    it('yields all stream events from successful provider', async () => {
      const events: LlmStreamEvent[] = [
        { type: 'text', content: 'Part 1' },
        { type: 'text', content: 'Part 2' },
        { type: 'tool_use', id: 'tu-1', name: 'read', input: {} },
        { type: 'tool_result', toolUseId: 'tu-1', content: 'file data' },
        { type: 'done', usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 } },
      ];
      const p1 = mockProvider('p1', { events });
      const registry = new ProviderRegistry([p1], mockBrain());

      const collected = await collectEvents(registry.execute(makeRequest()));
      expect(collected).toEqual(events);
    });

    it('retries on retryable error up to maxRetriesPerProvider', async () => {
      let attempts = 0;
      const p1: ILlmProvider = {
        ...mockProvider('retry-me'),
        execute: vi.fn(async function* () {
          attempts++;
          yield { type: 'error' as const, error: 'rate limit', retryable: true };
        }),
      };
      const p2 = mockProvider('backup');

      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        maxRetriesPerProvider: 2,
        retryDelayMs: 1, // fast for tests
      });

      const events = await collectEvents(registry.execute(makeRequest()));
      // p1 tried 1 initial + 2 retries = 3 attempts
      expect(attempts).toBe(3);
      // Then fell through to p2
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });

    it('fails over to next provider on non-retryable error', async () => {
      const p1 = mockProvider('p1', {
        events: [{ type: 'error', error: 'auth failed', retryable: false }],
      });
      const p2 = mockProvider('p2');

      const registry = new ProviderRegistry([p1, p2], mockBrain());
      const events = await collectEvents(registry.execute(makeRequest()));

      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(events[0]).toEqual({ type: 'text', content: 'Hello from p2' });
    });

    it('fails over on thrown exceptions', async () => {
      const p1 = mockProvider('p1', { failOnExecute: new Error('connection reset') });
      const p2 = mockProvider('p2');

      const registry = new ProviderRegistry([p1, p2], mockBrain());
      const events = await collectEvents(registry.execute(makeRequest()));

      expect(events[0]).toEqual({ type: 'text', content: 'Hello from p2' });
    });

    it('injects handoff context on failover', async () => {
      const p1 = mockProvider('p1', { failOnExecute: new Error('down') });
      const p2 = mockProvider('p2');
      const brain = mockBrain();

      const registry = new ProviderRegistry([p1, p2], brain);
      await collectEvents(registry.execute(makeRequest({ systemPrompt: 'Original prompt' })));

      // p2.formatHandoff should have been called
      expect(p2.formatHandoff).toHaveBeenCalled();

      // p2.execute should receive augmented systemPrompt
      const callArgs = (p2.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as LlmRequest;
      expect(callArgs.systemPrompt).toContain('Original prompt');
      expect(callArgs.systemPrompt).toContain('--- HANDOFF ---');
    });

    it('serializes brain state before failover', async () => {
      const p1 = mockProvider('p1', { failOnExecute: new Error('down') });
      const p2 = mockProvider('p2');
      const brain = mockBrain();

      const registry = new ProviderRegistry([p1, p2], brain);
      await collectEvents(registry.execute(makeRequest()));

      expect(brain.serialize).toHaveBeenCalled();
    });

    it('fires onProviderSwitch callback on failover', async () => {
      const p1 = mockProvider('primary', { failOnExecute: new Error('crashed') });
      const p2 = mockProvider('secondary');
      const brain = mockBrain();
      const onSwitch = vi.fn();

      const registry = new ProviderRegistry([p1, p2], brain, {
        onProviderSwitch: onSwitch,
      });
      await collectEvents(registry.execute(makeRequest()));

      expect(onSwitch).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'primary',
          to: 'secondary',
          reason: 'crashed',
          brainSnapshotHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      );
    });

    it('reports the actual failed provider during chained failover', async () => {
      const p1 = mockProvider('primary', { failOnExecute: new Error('primary crashed') });
      const p2 = mockProvider('secondary', { failOnExecute: new Error('secondary crashed') });
      const p3 = mockProvider('tertiary');
      const onSwitch = vi.fn();

      const registry = new ProviderRegistry([p1, p2, p3], mockBrain(), {
        onProviderSwitch: onSwitch,
      });
      await collectEvents(registry.execute(makeRequest()));

      expect(onSwitch).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          from: 'primary',
          to: 'secondary',
          reason: 'primary crashed',
        }),
      );
      expect(onSwitch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          from: 'secondary',
          to: 'tertiary',
          reason: 'secondary crashed',
        }),
      );
    });

    it('preserves the executed failure across unavailable fallback providers', async () => {
      const p1 = mockProvider('primary', { failOnExecute: new Error('primary crashed') });
      const p2 = mockProvider('secondary', { available: false });
      const p3 = mockProvider('tertiary');
      const onSwitch = vi.fn();

      const registry = new ProviderRegistry([p1, p2, p3], mockBrain(), {
        onProviderSwitch: onSwitch,
      });
      await collectEvents(registry.execute(makeRequest()));

      expect(onSwitch).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'primary',
          to: 'tertiary',
          reason: 'primary crashed',
        }),
      );
    });

    it('checkpoints brain when all providers exhausted', async () => {
      const p1 = mockProvider('p1', { failOnExecute: new Error('err1') });
      const p2 = mockProvider('p2', { failOnExecute: new Error('err2') });
      const brain = mockBrain();

      const registry = new ProviderRegistry([p1, p2], brain);

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow(/All providers exhausted/);

      expect(brain.recovery.checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'provider-failover' }),
      );
    });

    it('throws with descriptive error when all providers exhausted', async () => {
      const p1 = mockProvider('p1', { failOnExecute: new Error('connection timeout') });
      const brain = mockBrain();

      const registry = new ProviderRegistry([p1], brain);

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('connection timeout');
    });

    it('throws an actionable error when every provider reports unavailable', async () => {
      const p1 = mockProvider('claude', { available: false });
      const p2 = mockProvider('codex', { available: false });
      const brain = mockBrain();

      const registry = new ProviderRegistry([p1, p2], brain);

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('No providers available. Checked: claude, codex');
      expect(p1.execute).not.toHaveBeenCalled();
      expect(p2.execute).not.toHaveBeenCalled();
    });

    it('applies exponential backoff between retries', async () => {
      const timestamps: number[] = [];
      const p1: ILlmProvider = {
        ...mockProvider('slow'),
        execute: vi.fn(async function* () {
          timestamps.push(Date.now());
          yield { type: 'error' as const, error: 'rate limit', retryable: true };
        }),
      };
      const p2 = mockProvider('backup');

      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        maxRetriesPerProvider: 2,
        retryDelayMs: 50,
        backoffMultiplier: 2,
      });

      await collectEvents(registry.execute(makeRequest()));

      // Should have 3 attempts on p1 with increasing delays
      expect(timestamps).toHaveLength(3);
      // First retry delay: ~50ms, second: ~100ms
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      expect(delay1).toBeGreaterThanOrEqual(40); // 50ms with some tolerance
      expect(delay2).toBeGreaterThanOrEqual(80); // 100ms with some tolerance
    });

    it('caps retry delays and exposes them to deterministic sleep hooks', async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const p1: ILlmProvider = {
        ...mockProvider('rate-limited'),
        execute: vi.fn(async function* () {
          yield { type: 'error' as const, error: 'rate limit', retryable: true };
        }),
      };
      const p2 = mockProvider('backup');

      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        maxRetriesPerProvider: 3,
        retryDelayMs: 1_000,
        maxRetryDelayMs: 1_500,
        backoffMultiplier: 10,
        sleep,
      });

      await collectEvents(registry.execute(makeRequest()));

      expect(sleep.mock.calls.map((call) => call[0])).toEqual([1_000, 1_500, 1_500]);
    });

    it('rejects unbounded retry policy options before executing a provider', () => {
      const invalidOptions = [
        { maxRetriesPerProvider: -1 },
        { maxRetriesPerProvider: Number.NaN },
        { maxRetriesPerProvider: Number.POSITIVE_INFINITY },
        { maxRetriesPerProvider: 1.5 },
        { maxRetriesPerProvider: 6 },
        { retryDelayMs: -1 },
        { retryDelayMs: Number.NaN },
        { retryDelayMs: Number.POSITIVE_INFINITY },
        { maxRetryDelayMs: -1 },
        { maxRetryDelayMs: Number.NaN },
        { maxRetryDelayMs: Number.POSITIVE_INFINITY },
        { backoffMultiplier: 0 },
        { backoffMultiplier: Number.NaN },
        { backoffMultiplier: Number.POSITIVE_INFINITY },
        { circuitBreakerFailureThreshold: 0 },
        { circuitBreakerFailureThreshold: 21 },
        { circuitBreakerFailureThreshold: 1.5 },
        { circuitBreakerCooldownMs: -1 },
        { circuitBreakerCooldownMs: Number.NaN },
        { circuitBreakerCooldownMs: Number.POSITIVE_INFINITY },
        { circuitBreakerCooldownMs: 3_600_001 },
        { circuitBreakerCooldownJitterRatio: -0.1 },
        { circuitBreakerCooldownJitterRatio: 1.1 },
        { circuitBreakerCooldownJitterRatio: Number.NaN },
        { circuitBreakerHalfOpenMaxProbes: 0 },
        { circuitBreakerHalfOpenMaxProbes: 11 },
        { circuitBreakerHalfOpenMaxProbes: 1.5 },
      ];

      for (const options of invalidOptions) {
        const provider = mockProvider('guarded');
        expect(() => new ProviderRegistry([provider], mockBrain(), options)).toThrow(
          /maxRetriesPerProvider|retryDelayMs|maxRetryDelayMs|backoffMultiplier|circuitBreaker/,
        );
        expect(provider.execute).not.toHaveBeenCalled();
      }
    });

    it('uses the exhausted retryable error as failover reason', async () => {
      const p1: ILlmProvider = {
        ...mockProvider('rate-limited'),
        execute: vi.fn(async function* () {
          yield { type: 'error' as const, error: 'rate limit', retryable: true };
        }),
      };
      const p2 = mockProvider('backup');
      const onSwitch = vi.fn();

      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        maxRetriesPerProvider: 1,
        retryDelayMs: 1,
        onProviderSwitch: onSwitch,
      });

      await collectEvents(registry.execute(makeRequest()));

      expect(onSwitch).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'rate-limited',
          to: 'backup',
          reason: 'rate limit',
        }),
      );
    });

    it('opens provider circuit breakers and routes to fallback during cooldown', async () => {
      const onHealthChange = vi.fn();
      const p1 = mockProvider('primary', { failOnExecute: new Error('rate limit 429') });
      const p2 = mockProvider('fallback');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => Date.UTC(2026, 0, 1),
        onProviderHealthChange: onHealthChange,
      });

      const events = await collectEvents(registry.execute(makeRequest()));

      expect(events[0]).toEqual({ type: 'text', content: 'Hello from fallback' });
      expect(p1.execute).toHaveBeenCalledTimes(1);
      expect(registry.getProviderHealth('primary')).toMatchObject({
        providerName: 'primary',
        model: null,
        state: 'open',
        failures: 1,
        successes: 0,
        consecutiveFailures: 1,
        failureRate: 1,
        lastErrorClass: 'rate_limit',
        cooldownUntil: '2026-01-01T00:00:10.000Z',
      });
      expect(onHealthChange).toHaveBeenCalledWith(expect.objectContaining({
        providerName: 'primary',
        state: 'open',
        reason: 'provider-failure-threshold',
      }));
    });

    it('keeps an open breaker from calling the provider before cooldown expires', async () => {
      let now = Date.UTC(2026, 0, 1);
      const p1 = mockProvider('primary', { failOnExecute: new Error('provider down') });
      const p2 = mockProvider('fallback');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => now,
      });

      await collectEvents(registry.execute(makeRequest()));
      now += 5_000;
      registry.setOrder(['primary', 'fallback']);
      await collectEvents(registry.execute(makeRequest()));

      expect(p1.execute).toHaveBeenCalledTimes(1);
      expect(p2.execute).toHaveBeenCalledTimes(2);
      expect(registry.getProviderHealth('primary')?.state).toBe('open');
    });

    it('allows a bounded half-open probe after cooldown and closes on success', async () => {
      let now = Date.UTC(2026, 0, 1);
      let primaryShouldFail = true;
      const p1: ILlmProvider = {
        ...mockProvider('primary'),
        execute: vi.fn(async function* () {
          if (primaryShouldFail) throw new Error('transient outage');
          yield { type: 'text' as const, content: 'primary recovered' };
          yield { type: 'done' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        }),
      };
      const p2 = mockProvider('fallback');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => now,
      });

      await collectEvents(registry.execute(makeRequest()));
      now += 10_001;
      primaryShouldFail = false;
      registry.setOrder(['primary', 'fallback']);
      const events = await collectEvents(registry.execute(makeRequest()));

      expect(events[0]).toEqual({ type: 'text', content: 'primary recovered' });
      expect(registry.getProviderHealth('primary')).toMatchObject({
        state: 'closed',
        failures: 1,
        successes: 1,
        consecutiveFailures: 0,
        failureRate: 0.5,
        cooldownUntil: null,
        halfOpenProbeCount: 0,
      });
    });

    it('probes recovered providers after cooldown even when fallback is current', async () => {
      let now = Date.UTC(2026, 0, 1);
      let primaryShouldFail = true;
      const p1: ILlmProvider = {
        ...mockProvider('primary'),
        execute: vi.fn(async function* () {
          if (primaryShouldFail) throw new Error('transient outage');
          yield { type: 'text' as const, content: 'primary recovered' };
          yield { type: 'done' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        }),
      };
      const p2 = mockProvider('fallback');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => now,
      });

      await collectEvents(registry.execute(makeRequest()));
      expect(registry.currentProvider.name).toBe('fallback');

      now += 10_001;
      primaryShouldFail = false;
      const events = await collectEvents(registry.execute(makeRequest()));

      expect(events[0]).toEqual({ type: 'text', content: 'primary recovered' });
      expect(p1.execute).toHaveBeenCalledTimes(2);
      expect(registry.currentProvider.name).toBe('primary');
      expect(registry.getProviderHealth('primary')?.state).toBe('closed');
    });

    it('keeps circuit breaker state isolated for duplicate provider names', async () => {
      const p1 = mockProvider('openai-api', { failOnExecute: new Error('credential A exhausted') });
      const p2 = mockProvider('openai-api');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => Date.UTC(2026, 0, 1),
      });

      const events = await collectEvents(registry.execute(makeRequest()));
      const health = registry.listProviderHealth();
      const states = health.map((entry) => entry.state).sort();

      expect(events[0]).toEqual({ type: 'text', content: 'Hello from openai-api' });
      expect(p1.execute).toHaveBeenCalledTimes(1);
      expect(p2.execute).toHaveBeenCalledTimes(1);
      expect(states).toEqual(['closed', 'open']);
      expect(health.map((entry) => entry.providerKey).sort()).toEqual(['openai-api#1', 'openai-api#2']);
      expect(registry.getProviderHealth('openai-api')).toBeUndefined();
      expect(registry.getProviderHealth('openai-api#1')?.state).toBe('open');
      expect(registry.getProviderHealth('openai-api#2')?.state).toBe('closed');
    });

    it('reports open breaker cooldowns instead of credential guidance when all providers are skipped', async () => {
      const p1 = mockProvider('primary', { failOnExecute: new Error('outage') });
      const registry = new ProviderRegistry([p1], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => Date.UTC(2026, 0, 1),
      });

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('All providers exhausted');

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('Provider circuit breakers are open');
    });

    it('keeps unavailable fallback guidance with mixed open breakers and unavailable providers', async () => {
      const p1 = mockProvider('primary', { failOnExecute: new Error('outage') });
      const p2 = mockProvider('backup', { available: false });
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => Date.UTC(2026, 0, 1),
      });

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('outage');

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow(/Provider circuit breakers are open:.*Unavailable providers: Provider backup circuit opened after unavailable failure.*authenticate/s);
    });

    it('reopens half-open probes when consumers cancel before a terminal event', async () => {
      let now = Date.UTC(2026, 0, 1);
      const p1 = mockProvider('primary', { failOnExecute: new Error('outage') });
      const p2 = mockProvider('fallback');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        now: () => now,
      });
      const controls = registry as unknown as {
        reserveCircuitBreakerProbe(provider: ILlmProvider): Error | undefined;
        releaseHalfOpenProbe(provider: ILlmProvider, reason: string): void;
      };

      await collectEvents(registry.execute(makeRequest()));
      now += 10_001;
      expect(controls.reserveCircuitBreakerProbe(p1)).toBeUndefined();
      controls.releaseHalfOpenProbe(p1, 'cancelled stream');

      expect(registry.getProviderHealth('primary')).toMatchObject({
        state: 'open',
        cooldownUntil: '2026-01-01T00:00:20.001Z',
      });
    });

    it('reopens the breaker when a half-open probe fails without retry storms', async () => {
      let now = Date.UTC(2026, 0, 1);
      const p1: ILlmProvider = {
        ...mockProvider('primary'),
        execute: vi.fn(async function* () {
          yield { type: 'error' as const, error: 'rate limit', retryable: true };
        }),
      };
      const p2 = mockProvider('fallback');
      const registry = new ProviderRegistry([p1, p2], mockBrain(), {
        maxRetriesPerProvider: 2,
        retryDelayMs: 1,
        circuitBreakerFailureThreshold: 1,
        circuitBreakerCooldownMs: 10_000,
        circuitBreakerCooldownJitterRatio: 0,
        circuitBreakerHalfOpenMaxProbes: 1,
        now: () => now,
      });

      await collectEvents(registry.execute(makeRequest()));
      now += 10_001;
      registry.setOrder(['primary', 'fallback']);
      await collectEvents(registry.execute(makeRequest()));

      expect(p1.execute).toHaveBeenCalledTimes(2);
      expect(registry.getProviderHealth('primary')).toMatchObject({
        state: 'open',
        failures: 2,
        lastErrorClass: 'rate_limit',
        cooldownUntil: '2026-01-01T00:00:20.001Z',
      });
    });

    it('adds bounded cooldown jitter to prevent synchronized provider retries', async () => {
      const randomSpy = vi.spyOn(seededRandom, 'random').mockReturnValue(0.5);
      try {
        const p1 = mockProvider('primary', { failOnExecute: new Error('timeout') });
        const p2 = mockProvider('fallback');
        const registry = new ProviderRegistry([p1, p2], mockBrain(), {
          circuitBreakerFailureThreshold: 1,
          circuitBreakerCooldownMs: 10_000,
          circuitBreakerCooldownJitterRatio: 0.2,
          now: () => Date.UTC(2026, 0, 1),
        });

        await collectEvents(registry.execute(makeRequest()));

        expect(registry.getProviderHealth('primary')?.cooldownUntil).toBe('2026-01-01T00:00:11.000Z');
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('preserves execution failure as terminal error when later providers are unavailable', async () => {
      const p1 = mockProvider('runner', { failOnExecute: new Error('runner crashed') });
      const p2 = mockProvider('unavailable-backup', { available: false });
      const brain = mockBrain();
      const registry = new ProviderRegistry([p1, p2], brain);

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('runner crashed');
      expect(brain.recovery.checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { lastError: 'runner crashed' },
        }),
      );
    });

    it('reports no-done streams as the terminal exhaustion error', async () => {
      const p1 = mockProvider('unavailable-primary', { available: false });
      const p2 = mockProvider('silent', {
        events: [{ type: 'text' as const, content: 'partial' }],
      });
      const brain = mockBrain();
      const registry = new ProviderRegistry([p1, p2], brain);

      await expect(async () => {
        await collectEvents(registry.execute(makeRequest()));
      }).rejects.toThrow('stream ended without done');
      expect(brain.recovery.checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { lastError: 'stream ended without done' },
        }),
      );
    });

    it('discards partial output from failed provider on failover', async () => {
      // p1 streams some text then errors — those text events should NOT appear
      const p1: ILlmProvider = {
        ...mockProvider('p1'),
        execute: vi.fn(async function* () {
          yield { type: 'text' as const, content: 'Partial from p1' };
          yield { type: 'text' as const, content: 'More partial' };
          yield { type: 'error' as const, error: 'mid-stream crash', retryable: false };
        }),
      };
      const p2 = mockProvider('p2');

      const registry = new ProviderRegistry([p1, p2], mockBrain());
      const events = await collectEvents(registry.execute(makeRequest()));

      // No partial output from p1 should be present
      expect(events.some((e) => e.type === 'text' && e.content.includes('Partial'))).toBe(false);
      // Only p2's output
      expect(events[0]).toEqual({ type: 'text', content: 'Hello from p2' });
    });

    it('discards partial output on retryable error before retry', async () => {
      let attempt = 0;
      const p1: ILlmProvider = {
        ...mockProvider('p1'),
        execute: vi.fn(async function* () {
          attempt++;
          if (attempt === 1) {
            yield { type: 'text' as const, content: 'Abandoned text' };
            yield { type: 'error' as const, error: 'rate limit', retryable: true };
          } else {
            yield { type: 'text' as const, content: 'Good text' };
            yield {
              type: 'done' as const,
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            };
          }
        }),
      };

      const registry = new ProviderRegistry([p1], mockBrain(), {
        maxRetriesPerProvider: 1,
        retryDelayMs: 1,
      });
      const events = await collectEvents(registry.execute(makeRequest()));

      expect(events.some((e) => e.type === 'text' && e.content === 'Abandoned text')).toBe(false);
      expect(events[0]).toEqual({ type: 'text', content: 'Good text' });
    });

    it('updates currentProviderIndex on successful execution', async () => {
      const p1 = mockProvider('down', { available: false });
      const p2 = mockProvider('up');
      const registry = new ProviderRegistry([p1, p2], mockBrain());

      await collectEvents(registry.execute(makeRequest()));
      expect(registry.currentProvider.name).toBe('up');
    });
  });

  describe('setOrder()', () => {
    it('reorders providers by name', () => {
      const p1 = mockProvider('claude');
      const p2 = mockProvider('codex');
      const p3 = mockProvider('gemini');
      const registry = new ProviderRegistry([p1, p2, p3], mockBrain());

      registry.setOrder(['gemini', 'claude', 'codex']);
      const names = registry.getProviders().map((p) => p.name);
      expect(names).toEqual(['gemini', 'claude', 'codex']);
    });

    it('ignores unknown provider names', () => {
      const p1 = mockProvider('claude');
      const p2 = mockProvider('codex');
      const registry = new ProviderRegistry([p1, p2], mockBrain());

      registry.setOrder(['unknown', 'codex', 'claude']);
      const names = registry.getProviders().map((p) => p.name);
      expect(names).toEqual(['codex', 'claude']);
    });

    it('resets currentProviderIndex to 0', () => {
      const p1 = mockProvider('claude');
      const p2 = mockProvider('codex');
      const registry = new ProviderRegistry([p1, p2], mockBrain());

      registry.setOrder(['codex', 'claude']);
      expect(registry.currentProvider.name).toBe('codex');
    });

    it('no-ops if no names match', () => {
      const p1 = mockProvider('claude');
      const registry = new ProviderRegistry([p1], mockBrain());

      registry.setOrder(['nonexistent']);
      expect(registry.getProviders()).toEqual([p1]);
    });
  });
});
