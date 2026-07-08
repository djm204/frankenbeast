import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, statSync, lstatSync, symlinkSync } from 'node:fs';
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
    it('includes empty -p for headless stdin mode and --output-format stream-json', () => {
      const args = adapter.buildArgs({ systemPrompt: 'system prompt', messages: [] });
      expect(args).toEqual([
        '-p',
        '',
        '--output-format',
        'stream-json',
        '-m',
        'gemini-2.5-flash',
      ]);
    });

    it('includes -m for model', () => {
      const args = adapter.buildArgs({ systemPrompt: '', messages: [] });
      expect(args).toContain('-m');
      expect(args).toContain('gemini-2.5-flash');
    });
  });

  describe('writeContextSettings()', () => {
    it('merges inherited Gemini system settings while enabling include-dir memory', () => {
      const originalSettingsPath = process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      const existingSettings = join(tempDir, 'existing-settings.json');
      writeFileSync(
        existingSettings,
        `// comment\n{\n  "sandbox": true,\n  "server": "https://example.com/gemini",\n  "context": { "fileName": "GEMINI.md" } /* trailing block */\n}`,
      );
      process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = existingSettings;

      try {
        const settingsPath = (adapter as unknown as { writeContextSettings(dir: string): string }).writeContextSettings(tempDir);
        expect(JSON.parse(readFileSync(settingsPath, 'utf-8'))).toEqual({
          sandbox: true,
          server: 'https://example.com/gemini',
          context: { fileName: 'GEMINI.md', loadMemoryFromIncludeDirectories: true },
        });
      } finally {
        if (originalSettingsPath === undefined) {
          delete process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
        } else {
          process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = originalSettingsPath;
        }
      }
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

    it('parses Gemini stream-json message and result events', async () => {
      mockSpawn([
        JSON.stringify({ type: 'init' }),
        JSON.stringify({ type: 'message', role: 'user', content: { parts: [{ text: 'Hi' }] } }),
        JSON.stringify({ type: 'message', role: 'assistant', content: { parts: [{ text: 'Gemini ' }, { text: 'native' }] } }),
        JSON.stringify({ type: 'tool_use', tool_id: 'tool-1', tool_name: 'read_file', parameters: { path: 'README.md' } }),
        JSON.stringify({ type: 'tool_result', tool_id: 'tool-1', output: 'ok', status: 'success' }),
        JSON.stringify({ type: 'result', stats: { input_tokens: 12, output_tokens: 5, total_tokens: 17 } }),
      ]);

      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));

      expect(events[0]).toEqual({ type: 'text', content: 'Gemini ' });
      expect(events[1]).toEqual({ type: 'text', content: 'native' });
      expect(events[2]).toEqual({ type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } });
      expect(events[3]).toEqual({ type: 'tool_result', toolUseId: 'tool-1', content: 'ok', isError: false });
      expect(events[4]).toEqual({ type: 'done', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } });
    });

    it('emits error on Gemini error result frames', async () => {
      mockSpawn([JSON.stringify({ type: 'result', status: 'error', error: 'RESOURCE_EXHAUSTED' })]);

      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));

      expect(events[0]).toEqual({ type: 'error', error: 'RESOURCE_EXHAUSTED', retryable: true });
    });

    it('runs from an isolated context cwd while including the configured workspace', async () => {
      mockSpawn([JSON.stringify({ type: 'message_stop' })]);

      await collectEvents(adapter.execute({ systemPrompt: 'private sys', messages: [{ role: 'user', content: 'Hi' }] }));

      const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      const spawnArgs = spawnCall[1] as string[];
      const spawnOptions = spawnCall[2] as { cwd: string; env: Record<string, string> };
      expect(spawnOptions.cwd).toBe(tempDir);
      expect(spawnArgs).toContain('--include-directories');
      const includeDir = spawnArgs[spawnArgs.indexOf('--include-directories') + 1];
      expect(includeDir).toContain('franken-gemini-context-');
      expect(includeDir).not.toContain(tempDir);
      const settingsPath = spawnOptions.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      expect(settingsPath).toContain('franken-gemini-settings-');
      expect(settingsPath).not.toContain(includeDir);
      expect(spawnArgs).not.toContain('private sys');
      expect(existsSync(join(tempDir, 'GEMINI.md'))).toBe(false);
      expect(existsSync(includeDir)).toBe(false);
      expect(existsSync(settingsPath)).toBe(false);
    });

    it('removes a stale managed GEMINI.md block before launching', async () => {
      const geminiPath = join(tempDir, 'GEMINI.md');
      writeFileSync(geminiPath, `user notes\n\n<!-- FRANKENBEAST MANAGED SECTION - DO NOT EDIT -->\nstale\n<!-- END FRANKENBEAST SECTION -->\n`);
      mockSpawn([JSON.stringify({ type: 'message_stop' })]);

      await collectEvents(adapter.execute({ systemPrompt: 'fresh sys', messages: [{ role: 'user', content: 'Hi' }] }));

      expect(readFileSync(geminiPath, 'utf-8')).toBe('user notes\n\n');
    });

    it('removes stale managed content through a symlinked GEMINI.md without replacing the link', async () => {
      const targetPath = join(tempDir, 'shared-GEMINI.md');
      const geminiPath = join(tempDir, 'GEMINI.md');
      writeFileSync(targetPath, `user notes\n\n<!-- FRANKENBEAST MANAGED SECTION - DO NOT EDIT -->\nstale\n<!-- END FRANKENBEAST SECTION -->\n`);
      symlinkSync(targetPath, geminiPath);
      mockSpawn([JSON.stringify({ type: 'message_stop' })]);

      await collectEvents(adapter.execute({ systemPrompt: 'fresh sys', messages: [{ role: 'user', content: 'Hi' }] }));

      expect(lstatSync(geminiPath).isSymbolicLink()).toBe(true);
      expect(readFileSync(targetPath, 'utf-8')).toBe('user notes\n\n');
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
      writeFileSync(join(tempDir, 'GEMINI.md'), `User notes\n\n<!-- FRANKENBEAST MANAGED SECTION - DO NOT EDIT -->\nOld\n<!-- END FRANKENBEAST SECTION -->\n`);
      adapter.writeGeminiMd('New');
      const content = readFileSync(join(tempDir, 'GEMINI.md'), 'utf-8');
      expect(content).toContain('User notes');
      expect(content).toContain('New');
    });

    it('preserves GEMINI.md file mode when updating atomically', () => {
      const geminiPath = join(tempDir, 'GEMINI.md');
      writeFileSync(geminiPath, 'User notes');
      chmodSync(geminiPath, 0o600);

      adapter.writeGeminiMd('New');

      expect(statSync(geminiPath).mode & 0o777).toBe(0o600);
    });

    it('updates symlinked GEMINI.md targets without replacing the symlink', () => {
      const targetPath = join(tempDir, 'shared-GEMINI.md');
      const geminiPath = join(tempDir, 'GEMINI.md');
      writeFileSync(targetPath, 'user notes\n');
      symlinkSync(targetPath, geminiPath);

      adapter.writeGeminiMd('System prompt here');

      expect(lstatSync(geminiPath).isSymbolicLink()).toBe(true);
      expect(readFileSync(targetPath, 'utf-8')).toContain('System prompt here');
    });

    it('creates the target for dangling symlinked GEMINI.md without replacing the link', () => {
      const targetPath = join(tempDir, 'generated-later-GEMINI.md');
      const geminiPath = join(tempDir, 'GEMINI.md');
      symlinkSync(targetPath, geminiPath);

      adapter.writeGeminiMd('System prompt here');

      expect(lstatSync(geminiPath).isSymbolicLink()).toBe(true);
      expect(readFileSync(targetPath, 'utf-8')).toContain('System prompt here');
    });

    it('prepends managed content to user GEMINI.md content', () => {
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
