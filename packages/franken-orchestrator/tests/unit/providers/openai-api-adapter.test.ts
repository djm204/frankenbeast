import { describe, it, expect } from 'vitest';
import type { BrainSnapshot, LlmRequest, ToolDefinition } from '@franken/types';
import { OpenAiApiAdapter } from '../../../src/providers/openai-api-adapter.js';

describe('OpenAiApiAdapter', () => {
  describe('properties', () => {
    it('has correct name and type', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      expect(adapter.name).toBe('openai-api');
      expect(adapter.type).toBe('openai-api');
      expect(adapter.authMethod).toBe('api-key');
    });

    it('has correct capabilities', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      expect(adapter.capabilities.maxContextTokens).toBe(128_000);
      expect(adapter.capabilities.mcpSupport).toBe(false);
    });
  });

  describe('isAvailable()', () => {
    it('returns true when API key is set', async () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('returns true when OPENAI_API_KEY env var is set', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-env';
      const adapter = new OpenAiApiAdapter();
      expect(await adapter.isAvailable()).toBe(true);
      delete process.env['OPENAI_API_KEY'];
    });

    it('returns false when no API key', async () => {
      const origKey = process.env['OPENAI_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      const adapter = new OpenAiApiAdapter();
      expect(await adapter.isAvailable()).toBe(false);
      if (origKey) process.env['OPENAI_API_KEY'] = origKey;
    });
  });

  describe('translateMessages()', () => {
    it('prepends system message', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      const request: LlmRequest = {
        systemPrompt: 'Be helpful',
        messages: [{ role: 'user', content: 'Hi' }],
      };
      const result = adapter.translateMessages(request);
      expect(result[0]).toEqual({ role: 'system', content: 'Be helpful' });
      expect(result[1]).toEqual({ role: 'user', content: 'Hi' });
    });

    it('maps user and assistant messages', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      const request: LlmRequest = {
        systemPrompt: 'sys',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
      };
      const result = adapter.translateMessages(request);
      expect(result).toHaveLength(3); // system + 2 messages
    });

    it('translates image blocks to image_url format', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      const request: LlmRequest = {
        systemPrompt: 'sys',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image',
                source: { type: 'base64', mediaType: 'image/png', data: 'abc123' },
              },
            ],
          },
        ],
      };
      const result = adapter.translateMessages(request);
      const userMsg = result[1] as { content: Array<{ type: string; image_url?: { url: string } }> };
      expect(userMsg.content[0]).toEqual({ type: 'text', text: 'What is in this image?' });
      expect(userMsg.content[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abc123' },
      });
    });

    it('translates tool_result blocks as labeled text', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      const request: LlmRequest = {
        systemPrompt: 'sys',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'tool_result', toolUseId: 'tu-1', content: 'file contents here' },
            ],
          },
        ],
      };
      const result = adapter.translateMessages(request);
      const userMsg = result[1] as { content: Array<{ type: string; text?: string }> };
      expect(userMsg.content[0]!.type).toBe('text');
      expect(userMsg.content[0]!.text).toContain('tu-1');
      expect(userMsg.content[0]!.text).toContain('file contents here');
    });
  });

  describe('translateTools()', () => {
    it('wraps in function type', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      const tools: ToolDefinition[] = [
        { name: 'read', description: 'Read file', inputSchema: { type: 'object' } },
      ];
      const result = adapter.translateTools(tools);
      expect(result).toEqual([
        {
          type: 'function',
          function: {
            name: 'read',
            description: 'Read file',
            parameters: { type: 'object' },
          },
        },
      ]);
    });
  });

  describe('formatHandoff()', () => {
    it('returns handoff text', () => {
      const adapter = new OpenAiApiAdapter({ apiKey: 'sk-test' });
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-03-22T00:00:00.000Z',
        working: {},
        episodic: [],
        checkpoint: null,
        metadata: { lastProvider: 'claude-cli', switchReason: 'down', totalTokensUsed: 0 },
      };
      expect(adapter.formatHandoff(snapshot)).toContain('--- BRAIN STATE HANDOFF ---');
    });
  });
});
