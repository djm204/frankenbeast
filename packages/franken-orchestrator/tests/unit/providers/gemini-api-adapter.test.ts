import { describe, it, expect } from 'vitest';
import type { BrainSnapshot, LlmMessage, ToolDefinition } from '@franken/types';
import { GeminiApiAdapter } from '../../../src/providers/gemini-api-adapter.js';

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
