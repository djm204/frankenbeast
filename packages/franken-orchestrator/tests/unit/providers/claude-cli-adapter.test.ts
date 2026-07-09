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
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  });
  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

  // Feed lines async
  setImmediate(() => {
    for (const line of stdoutLines) {
      stdout.write(line + '\n');
    }
    stdout.end();
    setImmediate(() => {
      proc.exitCode = exitCode;
      proc.emit('close', exitCode);
    });
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
    it('includes -p, --output-format stream-json, and --verbose', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('-p');
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
      expect(args).toContain('--verbose');
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

    it('parses Claude CLI result wrapper frames', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'result',
          result: 'Final Claude CLI answer',
          usage: { input_tokens: 12, output_tokens: 7 },
        }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'text', content: 'Final Claude CLI answer' },
        { type: 'done', usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } },
      ]);
    });

    it('reads top-level Claude result token totals', async () => {
      mockSpawn([
        JSON.stringify({ type: 'result', result: 'Final answer', usage: {}, total_input_tokens: 21, total_output_tokens: 8 }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 21, outputTokens: 8, totalTokens: 29 } });
    });

    it('treats Claude error result subtypes as failures', async () => {
      mockSpawn([
        JSON.stringify({ type: 'result', subtype: 'error_max_turns', result: '', errors: ['turn limit reached'] }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'turn limit reached', retryable: false });
    });

    it('does not duplicate Claude result text after assistant deltas', async () => {
      mockSpawn([
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'final answer' } }),
        JSON.stringify({ type: 'result', result: 'final answer', total_input_tokens: 4, total_output_tokens: 2 }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'final answer' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } });
    });

    it('allows Claude tool-only result frames to complete without text', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'tool-only', name: 'Read', input: { file_path: 'README.md' } }] },
        }),
        JSON.stringify({ type: 'result', result: '', total_input_tokens: 5, total_output_tokens: 0 }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'tool_use', id: 'tool-only', name: 'Read', input: { file_path: 'README.md' } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 } },
      ]);
    });

    it('emits Claude tool-use blocks from assistant frames', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } }] },
        }),
        JSON.stringify({ type: 'result', result: 'done' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } });
      expect(events[1]).toEqual({ type: 'text', content: 'done' });
    });

    it('emits Claude assistant-frame content in provider order', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I will read ' },
              { type: 'tool_use', id: 'tool-ordered', name: 'Read', input: { file_path: 'README.md' } },
              { type: 'text', text: ' after that.' },
            ],
          },
        }),
        JSON.stringify({ type: 'result', result: '' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'text', content: 'I will read ' },
        { type: 'tool_use', id: 'tool-ordered', name: 'Read', input: { file_path: 'README.md' } },
        { type: 'text', content: ' after that.' },
        { type: 'done', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
      ]);
    });

    it('preserves Claude assistant-frame whitespace and usage', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'assistant',
          message: {
            usage: { input_tokens: 12, output_tokens: 6 },
            content: [{ type: 'text', text: '  formatted answer\n' }],
          },
        }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: '  formatted answer\n' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 } });
    });

    it('ignores Claude user tool-result frames before the final result', async () => {
      mockSpawn([
        JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'secret tool stdout' }] } }),
        JSON.stringify({ type: 'result', result: 'Final assistant answer' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'Final assistant answer' });
    });

    it('ignores Claude system frames before the final result', async () => {
      mockSpawn([
        JSON.stringify({ type: 'system', subtype: 'hook_progress', output: 'internal hook status' }),
        JSON.stringify({ type: 'result', result: 'Final assistant answer' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'text', content: 'Final assistant answer' },
        { type: 'done', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
      ]);
    });

    it('preserves Claude result-frame error messages', async () => {
      mockSpawn([
        JSON.stringify({ type: 'result', is_error: true, result: '', error: 'permission denied' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'permission denied', retryable: false });
    });

    it('errors when a successful process produces no parseable text or result frame', async () => {
      mockSpawn([], 0);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({
        type: 'error',
        error: 'claude process exited without producing a result frame or text output',
        retryable: false,
      });
    });

    it('fails closed when Claude message_stop arrives without text or tools', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 3 } } }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'claude stream completed without parseable text', retryable: true });
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

    it('kills the spawned Claude process when stream iteration stops early', async () => {
      const proc = mockSpawn([
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }),
      ]);
      const iterator = adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] });

      await expect(iterator.next()).resolves.toEqual({ value: { type: 'text', content: 'partial' }, done: false });
      await iterator.return(undefined);

      expect(proc.kill).toHaveBeenCalledTimes(1);
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
