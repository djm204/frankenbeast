import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BrainSnapshot, LlmStreamEvent } from '@franken/types';

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
import { GeminiCliAdapter } from '../../../src/providers/gemini-cli-adapter.js';

describe('GeminiCliAdapter', () => {
  let adapter: GeminiCliAdapter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gemini-test-'));
    adapter = new GeminiCliAdapter({ workingDir: tempDir, model: 'gemini-2.5-flash' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('properties', () => {
    it('has correct name and type', () => {
      expect(adapter.name).toBe('gemini-cli');
      expect(adapter.type).toBe('gemini-cli');
      expect(adapter.authMethod).toBe('cli-login');
    });

    it('has correct capabilities', () => {
      expect(adapter.capabilities.maxContextTokens).toBe(1_000_000);
      expect(adapter.capabilities.vision).toBe(true);
      expect(adapter.capabilities.mcpSupport).toBe(true);
    });
  });

  describe('buildArgs()', () => {
    it('includes -p --output-format stream-json', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('-p');
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
    });

    it('includes -m for model', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('-m');
      expect(args).toContain('gemini-2.5-flash');
    });
  });

  describe('execute()', () => {
    it('parses stream-json text events', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 30 } } }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Gemini says hi' } }),
        JSON.stringify({ type: 'message_delta', usage: { output_tokens: 8 } }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'Gemini says hi' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 30, outputTokens: 8, totalTokens: 38 } });
    });

    it('emits error on non-zero exit code', async () => {
      mockSpawn([], 2);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]!.type).toBe('error');
      expect((events[0] as any).error).toContain('gemini process exited with code 2');
    });
  });

  describe('writeGeminiMd()', () => {
    it('creates GEMINI.md if not exists', () => {
      adapter.writeGeminiMd('System prompt here');
      const content = readFileSync(join(tempDir, 'GEMINI.md'), 'utf-8');
      expect(content).toContain('FRANKENBEAST MANAGED SECTION');
      expect(content).toContain('System prompt here');
      expect(content).toContain('END FRANKENBEAST SECTION');
    });

    it('replaces managed section if exists', () => {
      adapter.writeGeminiMd('Version 1');
      adapter.writeGeminiMd('Version 2');
      const content = readFileSync(join(tempDir, 'GEMINI.md'), 'utf-8');
      expect(content).toContain('Version 2');
      expect(content).not.toContain('Version 1');
    });

    it('preserves user content outside managed section', () => {
      writeFileSync(
        join(tempDir, 'GEMINI.md'),
        '# My Project\nUser content here\n',
      );
      adapter.writeGeminiMd('System prompt');
      const content = readFileSync(join(tempDir, 'GEMINI.md'), 'utf-8');
      expect(content).toContain('System prompt');
      expect(content).toContain('User content here');
    });

    it('includes handoff context when provided', () => {
      adapter.writeGeminiMd('System', '--- HANDOFF ---');
      const content = readFileSync(join(tempDir, 'GEMINI.md'), 'utf-8');
      expect(content).toContain('--- HANDOFF ---');
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
        metadata: { lastProvider: 'claude-cli', switchReason: 'down', totalTokensUsed: 0 },
      };
      expect(adapter.formatHandoff(snapshot)).toContain('--- BRAIN STATE HANDOFF ---');
    });
  });
});
