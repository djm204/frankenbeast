import { describe, it, expect, vi } from 'vitest';
import type { BrainSnapshot, LlmMessage, ToolDefinition } from '@franken/types';
import { AnthropicApiAdapter } from '../../../src/providers/anthropic-api-adapter.js';

describe('AnthropicApiAdapter', () => {
  describe('properties', () => {
    it('has correct name and type', () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      expect(adapter.name).toBe('anthropic-api');
      expect(adapter.type).toBe('anthropic-api');
      expect(adapter.authMethod).toBe('api-key');
    });

    it('has correct capabilities', () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      expect(adapter.capabilities).toEqual({
        streaming: true,
        toolUse: true,
        vision: true,
        maxContextTokens: 200_000,
        mcpSupport: false,
        skillDiscovery: false,
      });
    });
  });

  describe('isAvailable()', () => {
    it('returns true when API key is set via options', async () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('returns true when ANTHROPIC_API_KEY env var is set', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-env';
      const adapter = new AnthropicApiAdapter();
      expect(await adapter.isAvailable()).toBe(true);
      delete process.env['ANTHROPIC_API_KEY'];
    });

    it('returns false when no API key', async () => {
      const origKey = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      const adapter = new AnthropicApiAdapter();
      expect(await adapter.isAvailable()).toBe(false);
      if (origKey) process.env['ANTHROPIC_API_KEY'] = origKey;
    });
  });

  describe('translateMessages()', () => {
    it('translates string content messages', () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      const messages: LlmMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = adapter.translateMessages(messages);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
    });

    it('translates content block messages', () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Look at this' }],
        },
      ];
      const result = adapter.translateMessages(messages);
      expect(result[0]!.content).toEqual([
        { type: 'text', text: 'Look at this' },
      ]);
    });
  });

  describe('translateTools()', () => {
    it('translates ToolDefinition to Anthropic Tool format', () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      const tools: ToolDefinition[] = [
        { name: 'read', description: 'Read file', inputSchema: { type: 'object' } },
      ];
      const result = adapter.translateTools(tools);
      expect(result).toEqual([
        {
          name: 'read',
          description: 'Read file',
          input_schema: { type: 'object' },
        },
      ]);
    });
  });

  describe('formatHandoff()', () => {
    it('returns handoff text', () => {
      const adapter = new AnthropicApiAdapter({ apiKey: 'sk-test' });
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-03-22T00:00:00.000Z',
        working: {},
        episodic: [],
        checkpoint: null,
        metadata: { lastProvider: 'claude-cli', switchReason: 'rate-limit', totalTokensUsed: 0 },
      };
      expect(adapter.formatHandoff(snapshot)).toContain('--- BRAIN STATE HANDOFF ---');
    });
  });
});
