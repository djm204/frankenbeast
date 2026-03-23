import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainSnapshot } from '@franken/types';
import { ClaudeCliAdapter } from '../../../src/providers/claude-cli-adapter.js';

describe('ClaudeCliAdapter', () => {
  let adapter: ClaudeCliAdapter;

  beforeEach(() => {
    adapter = new ClaudeCliAdapter({
      maxBudgetUsd: 5,
      maxTurns: 10,
      tools: ['Bash', 'Read'],
    });
  });

  describe('properties', () => {
    it('has correct name and type', () => {
      expect(adapter.name).toBe('claude-cli');
      expect(adapter.type).toBe('claude-cli');
      expect(adapter.authMethod).toBe('cli-login');
    });

    it('has correct capabilities', () => {
      expect(adapter.capabilities).toEqual({
        streaming: true,
        toolUse: true,
        vision: true,
        maxContextTokens: 200_000,
        mcpSupport: true,
        skillDiscovery: true,
      });
    });
  });

  describe('buildArgs()', () => {
    it('includes -p and --output-format stream-json', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('-p');
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
    });

    it('adds --append-system-prompt when provided', () => {
      const args = adapter.buildArgs({
        systemPrompt: 'Be helpful',
        messages: [],
      });
      expect(args).toContain('--append-system-prompt');
      expect(args).toContain('Be helpful');
    });

    it('omits --append-system-prompt when empty', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).not.toContain('--append-system-prompt');
    });

    it('adds --max-budget-usd when configured', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('--max-budget-usd');
      expect(args).toContain('5');
    });

    it('adds --max-turns when configured', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('--max-turns');
      expect(args).toContain('10');
    });

    it('adds --tools when configured', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('--tools');
      expect(args).toContain('Bash,Read');
    });
  });

  describe('sanitizedEnv()', () => {
    it('strips CLAUDE* env vars', () => {
      process.env['CLAUDE_CODE_ENTRYPOINT'] = 'test';
      process.env['CLAUDE_CONFIG'] = 'test';
      const env = adapter.sanitizedEnv();
      expect(env['CLAUDE_CODE_ENTRYPOINT']).toBeUndefined();
      expect(env['CLAUDE_CONFIG']).toBeUndefined();
      delete process.env['CLAUDE_CODE_ENTRYPOINT'];
      delete process.env['CLAUDE_CONFIG'];
    });

    it('sets FRANKENBEAST_SPAWNED=1', () => {
      const env = adapter.sanitizedEnv();
      expect(env['FRANKENBEAST_SPAWNED']).toBe('1');
    });
  });

  describe('formatHandoff()', () => {
    it('returns handoff text with delimiters', () => {
      const snapshot: BrainSnapshot = {
        version: 1,
        timestamp: '2026-03-22T00:00:00.000Z',
        working: { task: 'test' },
        episodic: [],
        checkpoint: null,
        metadata: { lastProvider: 'codex-cli', switchReason: 'error', totalTokensUsed: 100 },
      };
      const text = adapter.formatHandoff(snapshot);
      expect(text).toContain('--- BRAIN STATE HANDOFF ---');
      expect(text).toContain('Previous provider: codex-cli');
    });
  });
});
