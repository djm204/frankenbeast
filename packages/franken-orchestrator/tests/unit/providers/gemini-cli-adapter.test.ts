import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, statSync, lstatSync, symlinkSync, mkdirSync } from 'node:fs';
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

    it('drops include-directory extra args so only the managed prompt dir is scanned for memory', () => {
      adapter = new GeminiCliAdapter({
        binaryPath: 'gemini',
        model: 'gemini-2.5-flash',
        workingDir: tempDir,
        extraArgs: ['--foo', 'bar', '--include-directories', '/tmp/untrusted', '--include-directories=/tmp/also-untrusted'],
      });

      expect(adapter.buildArgs({ systemPrompt: '', messages: [] })).toEqual([
        '-p',
        '',
        '--output-format',
        'stream-json',
        '-m',
        'gemini-2.5-flash',
        '--foo',
        'bar',
      ]);
    });
  });

  describe('writeContextSettings()', () => {
    it('merges inherited Gemini system settings while preserving scoped context files', () => {
      const originalSettingsPath = process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      const originalSystemDefaultsPath = process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH;
      const originalGeminiCliHome = process.env.GEMINI_CLI_HOME;
      const existingSettings = join(tempDir, 'existing-settings.json');
      const systemDefaults = join(tempDir, 'system-defaults.json');
      const geminiCliHome = join(tempDir, 'gemini-home');
      mkdirSync(join(tempDir, '.gemini'));
      mkdirSync(join(geminiCliHome, '.gemini'), { recursive: true });
      writeFileSync(
        systemDefaults,
        `{ "context": { "fileName": ["CORP.md"], "includeDirectories": ["/default/docs"] }, "server": "https://default.example.com" }`,
      );
      writeFileSync(
        join(geminiCliHome, '.gemini', 'settings.json'),
        `{ "context": { "includeDirectories": ["/user/docs"] } }`,
      );
      writeFileSync(
        join(tempDir, '.gemini', 'settings.json'),
        `{ "sandbox": false, "context": { "includeDirectories": ["/project/docs"] } }`,
      );
      writeFileSync(
        existingSettings,
        `// comment\n{\n  "sandbox": true,\n  "server": "https://example.com/gemini",\n  "context": { "fileName": "PROJECT.md", "includeDirectories": ["/shared/docs"] } /* trailing block */\n}`,
      );
      adapter = new GeminiCliAdapter({
        binaryPath: 'gemini',
        model: 'gemini-2.5-flash',
        workingDir: tempDir,
        extraArgs: ['--include-directories', '/sibling/repo,/sibling/docs', '--include-directories=/more/docs,/even-more/docs'],
      });
      process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = existingSettings;
      process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = systemDefaults;
      process.env.GEMINI_CLI_HOME = geminiCliHome;

      try {
        const includeDir = join(tempDir, 'managed-context');
        const { settingsPath, managedContextFileName } = (adapter as unknown as { writeContextSettings(dir: string, includeDir: string): { settingsPath: string; managedContextFileName: string } }).writeContextSettings(tempDir, includeDir);
        expect(managedContextFileName).toMatch(/^FRANKENBEAST_GEMINI_[0-9a-f-]+\.md$/);
        expect(JSON.parse(readFileSync(settingsPath, 'utf-8'))).toEqual({
          sandbox: true,
          server: 'https://example.com/gemini',
          context: {
            fileName: [managedContextFileName, 'PROJECT.md', 'CORP.md', 'GEMINI.md'],
            includeDirectories: [includeDir],
            loadMemoryFromIncludeDirectories: true,
          },
        });
      } finally {
        if (originalSettingsPath === undefined) {
          delete process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
        } else {
          process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = originalSettingsPath;
        }
        if (originalSystemDefaultsPath === undefined) {
          delete process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH;
        } else {
          process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = originalSystemDefaultsPath;
        }
        if (originalGeminiCliHome === undefined) {
          delete process.env.GEMINI_CLI_HOME;
        } else {
          process.env.GEMINI_CLI_HOME = originalGeminiCliHome;
        }
      }
    });

    it('leaves lower-scope include directories to Gemini trust handling', () => {
      const originalSettingsPath = process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      const originalSystemDefaultsPath = process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH;
      const originalGeminiCliHome = process.env.GEMINI_CLI_HOME;
      const originalTrustWorkspace = process.env.GEMINI_CLI_TRUST_WORKSPACE;
      const existingSettings = join(tempDir, 'existing-settings.json');
      const systemDefaults = join(tempDir, 'system-defaults.json');
      const geminiCliHome = join(tempDir, 'gemini-home-trusted');
      mkdirSync(join(tempDir, '.gemini'));
      mkdirSync(join(geminiCliHome, '.gemini'), { recursive: true });
      writeFileSync(systemDefaults, `{ "context": { "includeDirectories": ["/default/docs"] } }`);
      writeFileSync(
        join(geminiCliHome, '.gemini', 'settings.json'),
        `{ "context": { "includeDirectories": ["/user/docs"] } }`,
      );
      writeFileSync(
        join(tempDir, '.gemini', 'settings.json'),
        `{ "context": { "includeDirectories": ["/project/docs"] } }`,
      );
      writeFileSync(existingSettings, `{ "sandbox": true, "context": { "fileName": "PROJECT.md" } }`);
      adapter = new GeminiCliAdapter({ workingDir: tempDir });
      process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = existingSettings;
      process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = systemDefaults;
      process.env.GEMINI_CLI_HOME = geminiCliHome;
      process.env.GEMINI_CLI_TRUST_WORKSPACE = 'true';

      try {
        const includeDir = join(tempDir, 'managed-context');
        const { settingsPath, managedContextFileName } = (adapter as unknown as { writeContextSettings(dir: string, includeDir: string): { settingsPath: string; managedContextFileName: string } }).writeContextSettings(tempDir, includeDir);
        expect(JSON.parse(readFileSync(settingsPath, 'utf-8'))).toMatchObject({
          sandbox: true,
          context: {
            fileName: [managedContextFileName, 'PROJECT.md', 'GEMINI.md'],
            includeDirectories: [includeDir],
            loadMemoryFromIncludeDirectories: true,
          },
        });
      } finally {
        if (originalSettingsPath === undefined) {
          delete process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
        } else {
          process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = originalSettingsPath;
        }
        if (originalSystemDefaultsPath === undefined) {
          delete process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH;
        } else {
          process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = originalSystemDefaultsPath;
        }
        if (originalGeminiCliHome === undefined) {
          delete process.env.GEMINI_CLI_HOME;
        } else {
          process.env.GEMINI_CLI_HOME = originalGeminiCliHome;
        }
        if (originalTrustWorkspace === undefined) {
          delete process.env.GEMINI_CLI_TRUST_WORKSPACE;
        } else {
          process.env.GEMINI_CLI_TRUST_WORKSPACE = originalTrustWorkspace;
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

      expect(events[0]).toEqual({ type: 'text', content: 'Gemini native' });
      expect(events[1]).toEqual({ type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } });
      expect(events[2]).toEqual({ type: 'done', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } });
    });

    it('emits error on Gemini error result frames', async () => {
      mockSpawn([JSON.stringify({ type: 'result', status: 'error', error: 'RESOURCE_EXHAUSTED' })]);

      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));

      expect(events[0]).toEqual({ type: 'error', error: 'RESOURCE_EXHAUSTED', retryable: true });
    });

    it('runs from the configured workspace while scoping temp Gemini context through settings', async () => {
      mockSpawn([JSON.stringify({ type: 'message_stop' })]);

      await collectEvents(adapter.execute({ systemPrompt: 'private sys', messages: [{ role: 'user', content: 'Hi' }] }));

      const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      const spawnArgs = spawnCall[1] as string[];
      const spawnOptions = spawnCall[2] as { cwd: string; env: Record<string, string> };
      expect(spawnOptions.cwd).toBe(tempDir);
      expect(spawnArgs).not.toContain('--include-directories');
      const settingsPath = spawnOptions.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      expect(settingsPath).toContain('franken-gemini-settings-');
      expect(spawnOptions.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH).toBeTruthy();
      expect(settingsPath).not.toContain(tempDir);
      expect(spawnArgs).not.toContain('private sys');
      expect(existsSync(join(tempDir, 'GEMINI.md'))).toBe(false);
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

    it('parses Gemini CLI result wrapper frames', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'result',
          result: { response: { text: 'Gemini wrapper answer' } },
          usage: { input_tokens: 8, output_tokens: 3 },
        }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'text', content: 'Gemini wrapper answer' },
        { type: 'done', usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 } },
      ]);
    });

    it('preserves whitespace in Gemini result wrapper frames', async () => {
      mockSpawn([
        JSON.stringify({ type: 'result', result: { response: { text: '  code block\n' } } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: '  code block\n' });
    });

    it('reads Gemini stats token totals from result frames', async () => {
      mockSpawn([
        JSON.stringify({
          type: 'result',
          result: { response: { text: 'Gemini stats answer' } },
          stats: { promptTokenCount: 11, candidatesTokenCount: 5 },
        }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 11, outputTokens: 5, totalTokens: 16 } });
    });

    it('emits only assistant Gemini message chunks', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message', message: { role: 'user', content: [{ text: 'echoed prompt' }] } }),
        JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ text: 'assistant answer' }] } }),
        JSON.stringify({ type: 'result', stats: { promptTokenCount: 1, candidatesTokenCount: 2 } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'assistant answer' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } });
    });

    it('preserves whitespace in Gemini assistant message chunks', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ text: 'hello ' }] } }),
        JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ text: 'world\n\n' }] } }),
        JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ text: '  \n' }] } }),
        JSON.stringify({ type: 'result', stats: { promptTokenCount: 1, candidatesTokenCount: 2 } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'hello ' });
      expect(events[1]).toEqual({ type: 'text', content: 'world\n\n' });
      expect(events[2]).toEqual({ type: 'text', content: '  \n' });
    });

    it('fails closed when Gemini message_stop arrives without text', async () => {
      mockSpawn([
        JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 3 } } }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'gemini stream completed without parseable text', retryable: true });
    });

    it('allows tool-only Gemini turns to complete without text', async () => {
      mockSpawn([
        JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } } }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } },
        { type: 'done', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
      ]);
    });

    it('emits top-level Gemini tool_use events', async () => {
      mockSpawn([
        JSON.stringify({ type: 'tool_use', tool_id: 'tool-2', tool_name: 'search', parameters: { query: 'docs' } }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'done' } }),
        JSON.stringify({ type: 'message_stop' }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'tool_use', id: 'tool-2', name: 'search', input: { query: 'docs' } });
      expect(events[1]).toEqual({ type: 'text', content: 'done' });
    });

    it('allows top-level Gemini tool-only result frames to complete without text', async () => {
      mockSpawn([
        JSON.stringify({ type: 'tool_use', tool_id: 'tool-3', tool_name: 'search', parameters: { query: 'docs' } }),
        JSON.stringify({ type: 'result', stats: { promptTokenCount: 4, candidatesTokenCount: 0 } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events).toEqual([
        { type: 'tool_use', id: 'tool-3', name: 'search', input: { query: 'docs' } },
        { type: 'done', usage: { inputTokens: 4, outputTokens: 0, totalTokens: 4 } },
      ]);
    });

    it('ignores Gemini tool result output before final result text', async () => {
      mockSpawn([
        JSON.stringify({ type: 'tool_result', output: 'raw tool stdout' }),
        JSON.stringify({ type: 'result', result: { response: { text: 'final text' } } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'final text' });
    });

    it('treats Gemini status error result frames as failures', async () => {
      mockSpawn([
        JSON.stringify({ type: 'result', status: 'error', error: { message: 'RESOURCE_EXHAUSTED quota' } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'RESOURCE_EXHAUSTED quota', retryable: true });
    });

    it('errors instead of returning empty success when the stream has no parseable text', async () => {
      mockSpawn([], 0);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({
        type: 'error',
        error: 'gemini process exited without producing a result frame or text output',
        retryable: false,
      });
    });

    it('emits error on non-zero exit code', async () => {
      mockSpawn([], 2);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toMatchObject({
        type: 'error',
        error: expect.stringContaining('gemini process exited with code 2'),
      });
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
