import { describe, it, expect, vi } from 'vitest';
import type {
  ILlmProvider,
  LlmStreamEvent,
  ProviderCapabilities,
} from '@franken/types';
import {
  createModelProviderFailoverAuditPayload,
  ProviderRegistry,
  type ProviderSwitchEvent,
} from '../../../src/providers/provider-registry.js';
import { AuditTrail, createAuditEvent } from '@franken/observer';

function mockProvider(
  name: string,
  opts: { fail?: boolean } = {},
): ILlmProvider {
  return {
    name,
    type: 'claude-cli',
    authMethod: 'cli-login',
    capabilities: {
      streaming: true, toolUse: false, vision: false,
      maxContextTokens: 200_000, mcpSupport: false, skillDiscovery: false,
    } satisfies ProviderCapabilities,
    isAvailable: vi.fn().mockResolvedValue(true),
    execute: vi.fn(async function* () {
      if (opts.fail) {
        yield { type: 'error' as const, error: 'crashed', retryable: false };
        return;
      }
      yield { type: 'text' as const, content: `Hello from ${name}` };
      yield { type: 'done' as const, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
    }),
    formatHandoff: vi.fn(() => '--- HANDOFF ---'),
  };
}

function mockBrain() {
  return {
    working: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), has: vi.fn(), keys: vi.fn(() => []), snapshot: vi.fn(() => ({})), restore: vi.fn(), clear: vi.fn() },
    episodic: { record: vi.fn(), recall: vi.fn(() => []), recentFailures: vi.fn(() => []), recent: vi.fn(() => []), count: vi.fn(() => 0) },
    recovery: { checkpoint: vi.fn(() => ({ id: 'cp' })), lastCheckpoint: vi.fn(() => null), listCheckpoints: vi.fn(() => []), clearCheckpoints: vi.fn() },
    serialize: vi.fn(() => ({
      version: 1, timestamp: new Date().toISOString(), working: {}, episodic: [], checkpoint: null,
      metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 },
    })),
  };
}

describe('Provider switch audit integration', () => {
  it('emits model-provider.failover audit event on failover', async () => {
    const auditTrail = new AuditTrail();
    const onSwitch = vi.fn((event: ProviderSwitchEvent) => {
      auditTrail.append(createAuditEvent('model-provider.failover', createModelProviderFailoverAuditPayload(event), {
        phase: 'execution',
        provider: event.to,
      }));
    });

    const registry = new ProviderRegistry(
      [mockProvider('primary', { fail: true }), mockProvider('secondary')],
      mockBrain(),
      { onProviderSwitch: onSwitch },
    );

    const events: LlmStreamEvent[] = [];
    for await (const e of registry.execute({ systemPrompt: '', messages: [] })) {
      events.push(e);
    }

    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({
      from: 'primary',
      to: 'secondary',
      brainSnapshotHash: expect.stringMatching(/^sha256:/),
    }));

    const failoverEvents = auditTrail.getByType('model-provider.failover');
    expect(failoverEvents).toHaveLength(1);
    const payload = failoverEvents[0]!.payload as Record<string, string>;
    expect(payload['event']).toBe('model-provider.failover');
    expect(payload['category']).toBe('availability');
    expect(payload['from']).toBe('primary');
    expect(payload['to']).toBe('secondary');
    expect(payload['reason']).toBe('crashed');
    expect(payload['operatorGuidance']).toContain('Provider failover occurred');
  });

  it('does not emit event when no switch occurs', async () => {
    const onSwitch = vi.fn();
    const registry = new ProviderRegistry(
      [mockProvider('primary')],
      mockBrain(),
      { onProviderSwitch: onSwitch },
    );

    for await (const event of registry.execute({ systemPrompt: '', messages: [] })) {
      expect(event.type).toBeDefined();
    }
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('includes brain snapshot hash for verification', async () => {
    const brain = mockBrain();
    const capturedHash: string[] = [];

    const registry = new ProviderRegistry(
      [mockProvider('p1', { fail: true }), mockProvider('p2')],
      brain,
      {
        onProviderSwitch: (event) => {
          capturedHash.push(event.brainSnapshotHash);
        },
      },
    );

    for await (const event of registry.execute({ systemPrompt: '', messages: [] })) {
      expect(event.type).toBeDefined();
    }

    expect(capturedHash).toHaveLength(1);
    expect(capturedHash[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
