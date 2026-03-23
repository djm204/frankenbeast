import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { BrainSnapshot, LlmStreamEvent } from '@franken/types';
import { ClaudeCliAdapter } from '../../../src/providers/claude-cli-adapter.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));
import { spawn } from 'node:child_process';

function mockSpawn(stdoutLines: string[], exitCode = 0) {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stdin,
    stderr: new PassThrough(),
    pid: 1234,
    kill: vi.fn(),
  });
  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

  // Feed lines async
  setImmediate(() => {
    for (const line of stdoutLines) {
      stdout.write(line + '\n');
    }
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

  describe('execute()', () => {
    it('parses text stream events', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 50 } } }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello world' } }),
        JSON.stringify({ type: 'message_delta', usage: { output_tokens: 10 } }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'Hello world' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 } });
    });

    it('parses tool_use events with accumulated input', async () => {
      mockSpawn([
        JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tu-1', name: 'read_file' } }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"path":' } }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"test.ts"}' } }),
        JSON.stringify({ type: 'content_block_stop' }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'read' }] }));
      expect(events[0]).toEqual({ type: 'tool_use', id: 'tu-1', name: 'read_file', input: { path: 'test.ts' } });
    });

    it('emits error on non-zero exit code', async () => {
      mockSpawn([], 1);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]!.type).toBe('error');
    });

    it('emits retryable error on rate limit', async () => {
      mockSpawn([
        JSON.stringify({ type: 'error', error: { message: 'rate limit exceeded' } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'rate limit exceeded', retryable: true });
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
