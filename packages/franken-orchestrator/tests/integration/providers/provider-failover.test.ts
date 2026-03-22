import { describe, it, expect, vi } from 'vitest';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
  ProviderCapabilities,
  BrainSnapshot,
} from '@franken/types';
import { SqliteBrain } from 'franken-brain';
import { ProviderRegistry } from '../../../src/providers/provider-registry.js';

// --- Helpers ---

const defaultCapabilities: ProviderCapabilities = {
  streaming: true,
  toolUse: true,
  vision: false,
  maxContextTokens: 200_000,
  mcpSupport: false,
  skillDiscovery: false,
};

function createSuccessProvider(name: string): ILlmProvider {
  return {
    name,
    type: 'claude-cli',
    authMethod: 'cli-login',
    capabilities: defaultCapabilities,
    isAvailable: vi.fn().mockResolvedValue(true),
    execute: vi.fn(async function* () {
      yield { type: 'text' as const, content: `Response from ${name}` };
      yield {
        type: 'done' as const,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      };
    }),
    formatHandoff: vi.fn((snapshot: BrainSnapshot) => {
      return [
        '--- HANDOFF ---',
        `From: ${snapshot.metadata.lastProvider}`,
        `Reason: ${snapshot.metadata.switchReason}`,
      ].join('\n');
    }),
  };
}

function createFailingProvider(
  name: string,
  error: string,
  retryable: boolean,
): ILlmProvider {
  return {
    name,
    type: 'claude-cli',
    authMethod: 'cli-login',
    capabilities: defaultCapabilities,
    isAvailable: vi.fn().mockResolvedValue(true),
    execute: vi.fn(async function* () {
      yield { type: 'error' as const, error, retryable };
    }),
    formatHandoff: vi.fn(() => '--- HANDOFF ---'),
  };
}

const request: LlmRequest = {
  systemPrompt: 'You are helpful',
  messages: [{ role: 'user', content: 'Fix the auth bug' }],
};

async function collectEvents(
  iterable: AsyncIterable<LlmStreamEvent>,
): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

// --- Integration Tests ---

describe('Provider failover integration', () => {
  describe('basic failover', () => {
    it('uses first provider when it succeeds', async () => {
      const brain = new SqliteBrain();
      const p1 = createSuccessProvider('primary');

      const registry = new ProviderRegistry([p1], brain);
      const events = await collectEvents(registry.execute(request));

      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Response from primary',
      });
      brain.close();
    });

    it('fails over to second provider on non-retryable error', async () => {
      const brain = new SqliteBrain();
      const p1 = createFailingProvider('primary', 'auth failed', false);
      const p2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry([p1, p2], brain);
      const events = await collectEvents(registry.execute(request));

      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Response from secondary',
      });
      brain.close();
    });

    it('retries before failover on retryable error', async () => {
      const brain = new SqliteBrain();
      let p1Attempts = 0;
      const p1: ILlmProvider = {
        ...createFailingProvider('primary', 'rate limit', true),
        execute: vi.fn(async function* () {
          p1Attempts++;
          yield { type: 'error' as const, error: 'rate limit', retryable: true };
        }),
      };
      const p2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry([p1, p2], brain, {
        maxRetriesPerProvider: 2,
        retryDelayMs: 1,
      });

      const events = await collectEvents(registry.execute(request));

      // 1 initial + 2 retries = 3 attempts on p1
      expect(p1Attempts).toBe(3);
      expect(events.some((e) => e.type === 'done')).toBe(true);
      brain.close();
    });
  });

  describe('brain state handoff', () => {
    it('serializes brain state before switching providers', async () => {
      const brain = new SqliteBrain();
      brain.working.set('task', 'fix auth');
      brain.episodic.record({
        type: 'decision',
        summary: 'Decided to refactor auth module',
        createdAt: new Date().toISOString(),
      });

      const p1 = createFailingProvider('primary', 'crashed', false);
      const p2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry([p1, p2], brain);
      await collectEvents(registry.execute(request));

      // Verify formatHandoff was called with a snapshot containing our data
      expect(p2.formatHandoff).toHaveBeenCalled();
      const snapshot = (p2.formatHandoff as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as BrainSnapshot;
      expect(snapshot.working).toHaveProperty('task', 'fix auth');
      expect(snapshot.episodic.length).toBeGreaterThan(0);
      expect(snapshot.metadata.lastProvider).toBe('primary');
      expect(snapshot.metadata.switchReason).toContain('crashed');
      brain.close();
    });

    it('injects handoff context into systemPrompt', async () => {
      const brain = new SqliteBrain();
      brain.working.set('progress', 0.7);

      const p1 = createFailingProvider('primary', 'error', false);
      const p2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry([p1, p2], brain);
      await collectEvents(
        registry.execute({
          systemPrompt: 'Original prompt',
          messages: [],
        }),
      );

      const callArgs = (p2.execute as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as LlmRequest;
      expect(callArgs.systemPrompt).toContain('Original prompt');
      expect(callArgs.systemPrompt).toContain('--- HANDOFF ---');
      brain.close();
    });
  });

  describe('three-provider chain', () => {
    it('tries all three providers, third succeeds', async () => {
      const brain = new SqliteBrain();
      const p1 = createFailingProvider('claude', 'rate limit', true);
      const p2 = createFailingProvider('codex', 'timeout', false);
      const p3 = createSuccessProvider('gemini');

      const registry = new ProviderRegistry([p1, p2, p3], brain, {
        maxRetriesPerProvider: 1,
        retryDelayMs: 1,
      });

      const events = await collectEvents(registry.execute(request));
      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(events.find((e) => e.type === 'text')).toEqual({
        type: 'text',
        content: 'Response from gemini',
      });
      brain.close();
    });
  });

  describe('all providers exhausted', () => {
    it('checkpoints brain and throws', async () => {
      const brain = new SqliteBrain();
      brain.working.set('task', 'important work');

      const p1 = createFailingProvider('primary', 'error1', false);
      const p2 = createFailingProvider('secondary', 'error2', false);

      const registry = new ProviderRegistry([p1, p2], brain);

      await expect(async () => {
        await collectEvents(registry.execute(request));
      }).rejects.toThrow(/All providers exhausted/);

      // Verify brain checkpoint was created
      const checkpoint = brain.recovery.lastCheckpoint();
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.phase).toBe('provider-failover');
      brain.close();
    });
  });

  describe('onProviderSwitch callback', () => {
    it('fires with correct metadata on failover', async () => {
      const brain = new SqliteBrain();
      const p1 = createFailingProvider('claude', 'overloaded', false);
      const p2 = createSuccessProvider('codex');
      const onSwitch = vi.fn();

      const registry = new ProviderRegistry([p1, p2], brain, {
        onProviderSwitch: onSwitch,
      });
      await collectEvents(registry.execute(request));

      expect(onSwitch).toHaveBeenCalledTimes(1);
      expect(onSwitch).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'claude',
          to: 'codex',
          reason: 'overloaded',
          brainSnapshotHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      );
      brain.close();
    });
  });

  describe('provider reordering', () => {
    it('uses new order after setOrder()', async () => {
      const brain = new SqliteBrain();
      const p1 = createSuccessProvider('claude');
      const p2 = createSuccessProvider('codex');

      const registry = new ProviderRegistry([p1, p2], brain);
      expect(registry.currentProvider.name).toBe('claude');

      registry.setOrder(['codex', 'claude']);
      expect(registry.currentProvider.name).toBe('codex');

      const events = await collectEvents(registry.execute(request));
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Response from codex',
      });
      brain.close();
    });
  });
});
