import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistryIAdapter } from '../../../src/adapters/provider-registry-adapter.js';
import type { ProviderRegistry } from '../../../src/providers/provider-registry.js';

function makeRequest() {
  return {
    id: 'req-1',
    provider: 'test',
    model: 'test-model',
    system: 'You are helpful.',
    messages: [{ role: 'user' as const, content: 'Hello' }],
  };
}

async function* textEvents(text: string) {
  yield { type: 'text' as const, content: text };
  yield { type: 'done' as const, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
}

async function* multiChunkEvents() {
  yield { type: 'text' as const, content: 'Hello' };
  yield { type: 'text' as const, content: ' world' };
  yield { type: 'done' as const, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
}

async function* errorEvent() {
  yield { type: 'error' as const, error: 'Rate limited', retryable: true };
}

function makeRegistry(generator: () => AsyncGenerator<any>): ProviderRegistry {
  return { execute: vi.fn().mockReturnValue(generator()) } as unknown as ProviderRegistry;
}

describe('ProviderRegistryIAdapter', () => {
  describe('transformRequest', () => {
    it('maps UnifiedRequest to LlmRequest', () => {
      const adapter = new ProviderRegistryIAdapter(makeRegistry(() => textEvents('hi')));
      const result = adapter.transformRequest(makeRequest());
      expect(result).toEqual({
        systemPrompt: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
      });
    });

    it('applies middleware processRequest when provided', () => {
      const processRequest = vi.fn((req: any) => ({ ...req, systemPrompt: 'SANITIZED' }));
      const middleware = { processRequest, processResponse: vi.fn((r: any) => r) };
      const adapter = new ProviderRegistryIAdapter(
        makeRegistry(() => textEvents('hi')),
        middleware as any,
      );
      const result = adapter.transformRequest(makeRequest()) as any;
      expect(processRequest).toHaveBeenCalled();
      expect(result.systemPrompt).toBe('SANITIZED');
    });

    it('uses empty string for system when not provided', () => {
      const adapter = new ProviderRegistryIAdapter(makeRegistry(() => textEvents('hi')));
      const req = { ...makeRequest(), system: undefined };
      const result = adapter.transformRequest(req) as any;
      expect(result.systemPrompt).toBe('');
    });
  });

  describe('execute', () => {
    it('drains async generator and returns concatenated text', async () => {
      const registry = makeRegistry(() => multiChunkEvents());
      const adapter = new ProviderRegistryIAdapter(registry);
      const result = await adapter.execute({
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
      });
      expect(result).toBe('Hello world');
    });

    it('passes the request to registry.execute()', async () => {
      const registry = makeRegistry(() => textEvents('response'));
      const adapter = new ProviderRegistryIAdapter(registry);
      const req = { systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }], tools: [] };
      await adapter.execute(req);
      expect(registry.execute).toHaveBeenCalledWith(req);
    });

    it('throws on error events', async () => {
      const registry = makeRegistry(() => errorEvent());
      const adapter = new ProviderRegistryIAdapter(registry);
      await expect(adapter.execute({
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
      })).rejects.toThrow('Rate limited');
    });
  });

  describe('transformResponse', () => {
    it('returns content from string response', () => {
      const adapter = new ProviderRegistryIAdapter(makeRegistry(() => textEvents('hi')));
      const result = adapter.transformResponse('Hello world', 'req-1');
      expect(result).toEqual({ content: 'Hello world' });
    });

    it('applies middleware processResponse when provided', () => {
      const processResponse = vi.fn(() => ({ content: 'VALIDATED', usage: { inputTokens: 0, outputTokens: 0 } }));
      const middleware = { processRequest: vi.fn((r: any) => r), processResponse };
      const adapter = new ProviderRegistryIAdapter(
        makeRegistry(() => textEvents('hi')),
        middleware as any,
      );
      const result = adapter.transformResponse('raw output', 'req-1');
      expect(processResponse).toHaveBeenCalled();
      expect(result).toEqual({ content: 'VALIDATED' });
    });
  });

  describe('validateCapabilities', () => {
    it('returns true for text-completion', () => {
      const adapter = new ProviderRegistryIAdapter(makeRegistry(() => textEvents('hi')));
      expect(adapter.validateCapabilities('text-completion')).toBe(true);
    });

    it('returns false for other features', () => {
      const adapter = new ProviderRegistryIAdapter(makeRegistry(() => textEvents('hi')));
      expect(adapter.validateCapabilities('image-generation')).toBe(false);
    });
  });
});
