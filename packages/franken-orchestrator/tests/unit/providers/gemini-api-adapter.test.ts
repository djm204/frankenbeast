import { describe, it, expect, vi } from 'vitest';
import type { BrainSnapshot, LlmMessage, LlmStreamEvent, ToolDefinition } from '@franken/types';
import { GeminiApiAdapter } from '../../../src/providers/gemini-api-adapter.js';

async function collectEvents(iterable: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const e of iterable) events.push(e);
  return events;
}

describe('GeminiApiAdapter', () => {
  describe('properties', () => {
    it('has correct name and type', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test-key' });
      expect(adapter.name).toBe('gemini-api');
      expect(adapter.type).toBe('gemini-api');
      expect(adapter.authMethod).toBe('api-key');
    });

    it('has correct capabilities', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test-key' });
      expect(adapter.capabilities.maxContextTokens).toBe(1_000_000);
      expect(adapter.capabilities.vision).toBe(true);
      expect(adapter.capabilities.mcpSupport).toBe(false);
    });
  });

  describe('isAvailable()', () => {
    it('returns true when apiKey is set via options', async () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test-key' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('returns true when GOOGLE_API_KEY env var is set', async () => {
      process.env['GOOGLE_API_KEY'] = 'gk-env';
      const adapter = new GeminiApiAdapter();
      expect(await adapter.isAvailable()).toBe(true);
      delete process.env['GOOGLE_API_KEY'];
    });

    it('returns true when GEMINI_API_KEY env var is set', async () => {
      process.env['GEMINI_API_KEY'] = 'gk-env';
      const adapter = new GeminiApiAdapter();
      expect(await adapter.isAvailable()).toBe(true);
      delete process.env['GEMINI_API_KEY'];
    });

    it('returns false when no API key', async () => {
      const origG = process.env['GOOGLE_API_KEY'];
      const origGm = process.env['GEMINI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      const adapter = new GeminiApiAdapter();
      expect(await adapter.isAvailable()).toBe(false);
      if (origG) process.env['GOOGLE_API_KEY'] = origG;
      if (origGm) process.env['GEMINI_API_KEY'] = origGm;
    });
  });

  describe('translateMessages()', () => {
    it('maps assistant to model role', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test' });
      const messages: LlmMessage[] = [
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = adapter.translateMessages(messages);
      expect(result[0]!.role).toBe('model');
    });

    it('wraps content in parts array', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test' });
      const messages: LlmMessage[] = [
        { role: 'user', content: 'Hello' },
      ];
      const result = adapter.translateMessages(messages);
      expect(result[0]!.parts).toEqual([{ text: 'Hello' }]);
    });

    it('handles content block messages', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test' });
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Look' }],
        },
      ];
      const result = adapter.translateMessages(messages);
      expect(result[0]!.parts).toEqual([{ text: 'Look' }]);
    });
  });

  describe('execute()', () => {
    it('translates text and usage chunks into events', async () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test-key' });
      const mockChunks = [
        { text: 'Hello from Gemini', functionCalls: null, usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12 } },
        { text: ' more text', functionCalls: null, usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 20 } },
      ];
      (adapter as any).client = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue((async function* () {
            for (const chunk of mockChunks) yield chunk;
          })()),
        },
      };

      const events = await collectEvents(adapter.execute({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }));

      expect(events[0]).toEqual({ type: 'text', content: 'Hello from Gemini' });
      expect(events[1]).toEqual({ type: 'text', content: ' more text' });
      expect(events[2]).toEqual({ type: 'done', usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 } });
    });

    it('translates function call chunks', async () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test-key' });
      (adapter as any).client = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue((async function* () {
            yield { text: null, functionCalls: [{ name: 'search', args: { q: 'test' } }], usageMetadata: null };
          })()),
        },
      };

      const events = await collectEvents(adapter.execute({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }));

      expect(events[0]!.type).toBe('tool_use');
      expect((events[0] as any).name).toBe('search');
      expect((events[0] as any).input).toEqual({ q: 'test' });
    });

    it('emits retryable error on RESOURCE_EXHAUSTED', async () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test-key' });
      (adapter as any).client = {
        models: {
          generateContentStream: vi.fn().mockRejectedValue(new Error('RESOURCE_EXHAUSTED')),
        },
      };

      const events = await collectEvents(adapter.execute({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }));
      expect(events[0]).toEqual({ type: 'error', error: 'RESOURCE_EXHAUSTED', retryable: true });
    });
  });

  describe('translateTools()', () => {
    it('translates to function declarations', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test' });
      const tools: ToolDefinition[] = [
        { name: 'search', description: 'Search web', inputSchema: { type: 'object' } },
      ];
      const result = adapter.translateTools(tools);
      expect(result).toEqual([
        { name: 'search', description: 'Search web', parameters: { type: 'object' } },
      ]);
    });
  });

  describe('formatHandoff()', () => {
    it('returns handoff text', () => {
      const adapter = new GeminiApiAdapter({ apiKey: 'test' });
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-03-22T00:00:00.000Z',
        working: {},
        episodic: [],
        checkpoint: null,
        metadata: { lastProvider: 'claude-cli', switchReason: 'error', totalTokensUsed: 0 },
      };
      expect(adapter.formatHandoff(snapshot)).toContain('--- BRAIN STATE HANDOFF ---');
    });
  });
});
