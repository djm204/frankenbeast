import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
  ProviderCapabilities,
  BrainSnapshot,
} from '@franken/types';
import { TokenAggregator } from '../../../src/providers/token-aggregator.js';
import { ProviderRegistry } from '../../../src/providers/provider-registry.js';

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
    aggregator.record('claude-cli', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(150);
    expect(usage.totalInputTokens).toBe(100);
    expect(usage.totalOutputTokens).toBe(50);
  });

  it('accumulates multiple calls to the same provider', () => {
    aggregator.record('claude-cli', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    aggregator.record('claude-cli', {
      inputTokens: 200,
      outputTokens: 80,
      totalTokens: 280,
    });
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(430);
    expect(usage.byProvider.get('claude-cli')!.totalTokens).toBe(430);
  });

  it('aggregates across multiple providers', () => {
    aggregator.record('claude-cli', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    aggregator.record('codex-cli', {
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
    });
    aggregator.record('gemini-api', {
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
    });
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(525);
    expect(usage.totalInputTokens).toBe(350);
    expect(usage.totalOutputTokens).toBe(175);
    expect(usage.byProvider.size).toBe(3);
  });

  it('provides per-provider breakdown', () => {
    aggregator.record('claude-cli', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    aggregator.record('codex-cli', {
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
    });
    const usage = aggregator.getTotalUsage();
    expect(usage.byProvider.get('claude-cli')!.totalTokens).toBe(150);
    expect(usage.byProvider.get('codex-cli')!.totalTokens).toBe(300);
  });

  it('returns a copy of byProvider map (no mutation)', () => {
    aggregator.record('claude-cli', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    const usage1 = aggregator.getTotalUsage();
    usage1.byProvider.clear();
    const usage2 = aggregator.getTotalUsage();
    expect(usage2.byProvider.size).toBe(1);
  });

  it('resets all counters', () => {
    aggregator.record('claude-cli', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    aggregator.reset();
    const usage = aggregator.getTotalUsage();
    expect(usage.totalTokens).toBe(0);
    expect(usage.byProvider.size).toBe(0);
  });
});

// --- ProviderRegistry token tracking integration ---

function mockProvider(
  name: string,
  events: LlmStreamEvent[],
): ILlmProvider {
  return {
    name,
    type: 'claude-cli',
    authMethod: 'cli-login',
    capabilities: {
      streaming: true,
      toolUse: false,
      vision: false,
      maxContextTokens: 200_000,
      mcpSupport: false,
      skillDiscovery: false,
    } satisfies ProviderCapabilities,
    isAvailable: vi.fn().mockResolvedValue(true),
    execute: vi.fn(async function* () {
      for (const event of events) yield event;
    }),
    formatHandoff: vi.fn(() => '--- HANDOFF ---'),
  };
}

function mockBrain() {
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
      checkpoint: vi.fn(() => ({ id: 'cp-1' })),
      lastCheckpoint: vi.fn(() => null),
      listCheckpoints: vi.fn(() => []),
      clearCheckpoints: vi.fn(),
    },
    serialize: vi.fn(() => ({
      version: 1,
      timestamp: new Date().toISOString(),
      working: {},
      episodic: [],
      checkpoint: null,
      metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
    })),
  };
}

describe('ProviderRegistry token tracking', () => {
  it('records tokens from done events', async () => {
    const p1 = mockProvider('claude', [
      { type: 'text', content: 'Hello' },
      {
        type: 'done',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    ]);
    const registry = new ProviderRegistry([p1], mockBrain());

    const events: LlmStreamEvent[] = [];
    for await (const event of registry.execute({
      systemPrompt: '',
      messages: [],
    })) {
      events.push(event);
    }

    const usage = registry.getTokenUsage();
    expect(usage.totalTokens).toBe(150);
    expect(usage.byProvider.get('claude')!.totalTokens).toBe(150);
  });

  it('accumulates tokens across provider failover', async () => {
    // p1 emits text + error (non-retryable), so fails over
    // But since the error event causes failover BEFORE done,
    // p1 won't contribute tokens. Only p2's done is counted.
    const p1 = mockProvider('claude', [
      { type: 'error', error: 'crashed', retryable: false },
    ]);
    const p2 = mockProvider('codex', [
      { type: 'text', content: 'Hello' },
      {
        type: 'done',
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      },
    ]);
    const registry = new ProviderRegistry([p1, p2], mockBrain());

    for await (const _ of registry.execute({
      systemPrompt: '',
      messages: [],
    })) {
      /* consume */
    }

    const usage = registry.getTokenUsage();
    expect(usage.totalTokens).toBe(300);
    expect(usage.byProvider.get('codex')!.totalTokens).toBe(300);
  });
});
