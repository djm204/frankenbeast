import { describe, it, expect, beforeEach } from 'vitest';
import type { BrainSnapshot } from '@franken/types';
import { CodexCliAdapter } from '../../../src/providers/codex-cli-adapter.js';

describe('CodexCliAdapter', () => {
  let adapter: CodexCliAdapter;

  beforeEach(() => {
    adapter = new CodexCliAdapter({
      profile: 'dev',
      configOverrides: { model: 'o3' },
    });
  });

  describe('properties', () => {
    it('has correct name and type', () => {
      expect(adapter.name).toBe('codex-cli');
      expect(adapter.type).toBe('codex-cli');
      expect(adapter.authMethod).toBe('cli-login');
    });

    it('has correct capabilities', () => {
      expect(adapter.capabilities.vision).toBe(false);
      expect(adapter.capabilities.maxContextTokens).toBe(128_000);
      expect(adapter.capabilities.mcpSupport).toBe(true);
      expect(adapter.capabilities.skillDiscovery).toBe(true);
    });
  });

  describe('buildArgs()', () => {
    it('includes exec --json --ephemeral', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args[0]).toBe('exec');
      expect(args).toContain('--json');
      expect(args).toContain('--ephemeral');
    });

    it('adds -c for system prompt', () => {
      const args = adapter.buildArgs({
        systemPrompt: 'Be helpful',
        messages: [],
      });
      expect(args).toContain('-c');
      expect(args).toContain('instructions=Be helpful');
    });

    it('adds -p for profile', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('-p');
      expect(args).toContain('dev');
    });

    it('adds -c for config overrides', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('model=o3');
    });
  });

  describe('formatHandoff()', () => {
    it('returns handoff text', () => {
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-03-22T00:00:00.000Z',
        working: {},
        episodic: [],
        checkpoint: null,
        metadata: { lastProvider: 'claude-cli', switchReason: 'timeout', totalTokensUsed: 0 },
      };
      const text = adapter.formatHandoff(snapshot);
      expect(text).toContain('--- BRAIN STATE HANDOFF ---');
      expect(text).toContain('claude-cli');
    });
  });
});
