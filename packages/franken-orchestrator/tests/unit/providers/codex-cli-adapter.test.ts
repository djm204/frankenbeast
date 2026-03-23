import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { BrainSnapshot, LlmStreamEvent } from '@franken/types';
import { CodexCliAdapter } from '../../../src/providers/codex-cli-adapter.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));
import { spawn } from 'node:child_process';

function mockSpawn(stdoutLines: string[], exitCode = 0) {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const proc = Object.assign(new EventEmitter(), { stdout, stdin, stderr: new PassThrough(), pid: 1, kill: vi.fn() });
  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);
  setImmediate(() => {
    for (const line of stdoutLines) stdout.write(line + '\n');
    stdout.end();
    setImmediate(() => proc.emit('close', exitCode));
  });
  return proc;
}

async function collectEvents(iterable: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const e of iterable) events.push(e);
  return events;
}

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

  describe('execute()', () => {
    it('parses text content events', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message', content: 'Hello from Codex' }),
        JSON.stringify({ type: 'done', usage: { input_tokens: 80, output_tokens: 20 } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'Hello from Codex' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 } });
    });

    it('parses tool call events', async () => {
      mockSpawn([
        JSON.stringify({ type: 'function_call', id: 'fc-1', name: 'read', arguments: '{"path":"a.ts"}' }),
        JSON.stringify({ type: 'done', usage: { input_tokens: 10, output_tokens: 5 } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({ type: 'tool_use', id: 'fc-1', name: 'read', input: '{"path":"a.ts"}' });
    });

    it('emits error on non-zero exit code', async () => {
      mockSpawn([], 1);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]!.type).toBe('error');
      expect((events[0] as any).retryable).toBe(false);
    });

    it('emits retryable error on rate limit message', async () => {
      mockSpawn([JSON.stringify({ type: 'error', message: 'rate limit 429' })]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'rate limit 429', retryable: true });
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
