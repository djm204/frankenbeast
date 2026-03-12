import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { CliLlmAdapter } from '../../../src/adapters/cli-llm-adapter.js';
import { AiderProvider } from '../../../src/skills/providers/aider-provider.js';
import { ClaudeProvider } from '../../../src/skills/providers/claude-provider.js';
import { CodexProvider } from '../../../src/skills/providers/codex-provider.js';

// --- Mock spawn infrastructure ---

interface MockSpawnCall {
  cmd: string;
  args: string[];
  options: SpawnOptions;
}

interface MockSpawnResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
  neverExit?: boolean;
}

function createMockSpawn(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
  neverExit?: boolean;
}): { spawnFn: (cmd: string, args: readonly string[], options: SpawnOptions) => ChildProcess; calls: MockSpawnCall[] } {
  const calls: MockSpawnCall[] = [];

  const spawnFn = (cmd: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
    calls.push({ cmd, args: [...args], options });

    const proc = new EventEmitter() as ChildProcess;
    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    Object.defineProperty(proc, 'stdin', { value: stdinStream, writable: false });
    Object.defineProperty(proc, 'stdout', { value: stdoutStream, writable: false });
    Object.defineProperty(proc, 'stderr', { value: stderrStream, writable: false });
    Object.defineProperty(proc, 'pid', { value: 12345, writable: false });

    const killFn = vi.fn(() => {
      if (!opts.neverExit) {
        setTimeout(() => proc.emit('close', null), 2);
      }
      return true;
    });
    Object.defineProperty(proc, 'kill', { value: killFn, writable: false });

    if (!opts.neverExit) {
      setTimeout(() => {
        if (opts.stdout) stdoutStream.write(opts.stdout);
        stdoutStream.end();
        if (opts.stderr) stderrStream.write(opts.stderr);
        stderrStream.end();
        proc.emit('close', opts.exitCode ?? 0);
      }, opts.delayMs ?? 5);
    }

    return proc;
  };

  return { spawnFn, calls };
}

function createQueuedSpawn(results: MockSpawnResult[]): {
  spawnFn: (cmd: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  calls: MockSpawnCall[];
} {
  const calls: MockSpawnCall[] = [];
  let index = 0;

  const spawnFn = (cmd: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
    calls.push({ cmd, args: [...args], options });
    const current = results[index++] ?? { stdout: '', stderr: 'unexpected spawn', exitCode: 1 };

    const proc = new EventEmitter() as ChildProcess;
    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    Object.defineProperty(proc, 'stdin', { value: stdinStream, writable: false });
    Object.defineProperty(proc, 'stdout', { value: stdoutStream, writable: false });
    Object.defineProperty(proc, 'stderr', { value: stderrStream, writable: false });
    Object.defineProperty(proc, 'pid', { value: 12345 + index, writable: false });

    const killFn = vi.fn(() => {
      if (!current.neverExit) {
        setTimeout(() => proc.emit('close', null), 2);
      }
      return true;
    });
    Object.defineProperty(proc, 'kill', { value: killFn, writable: false });

    if (!current.neverExit) {
      setTimeout(() => {
        if (current.stdout) stdoutStream.write(current.stdout);
        stdoutStream.end();
        if (current.stderr) stderrStream.write(current.stderr);
        stderrStream.end();
        proc.emit('close', current.exitCode ?? 0);
      }, current.delayMs ?? 5);
    }

    return proc;
  };

  return { spawnFn, calls };
}

// --- Tests ---

describe('CliLlmAdapter', () => {
  const aiderProvider = new AiderProvider();
  const claudeProvider = new ClaudeProvider();
  const codexProvider = new CodexProvider();
  const baseOpts = { workingDir: '/tmp/test' };

  describe('constructor', () => {
    it('accepts ICliProvider and opts', () => {
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
      expect(adapter).toBeDefined();
    });

    it('accepts optional timeoutMs in opts', () => {
      const adapter = new CliLlmAdapter(claudeProvider, { ...baseOpts, timeoutMs: 60_000 });
      expect(adapter).toBeDefined();
    });

    it('accepts optional commandOverride in opts', () => {
      const adapter = new CliLlmAdapter(claudeProvider, { ...baseOpts, commandOverride: '/usr/local/bin/claude-custom' });
      expect(adapter).toBeDefined();
    });

    it('accepts optional _spawnFn as third argument', () => {
      const { spawnFn } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);
      expect(adapter).toBeDefined();
    });
  });

  describe('transformRequest', () => {
    it('extracts the last user message content and returns maxTurns: 1', () => {
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
      const result = adapter.transformRequest({
        id: 'req-1',
        provider: 'adapter',
        model: 'adapter',
        messages: [
          { role: 'user', content: 'first message' },
          { role: 'assistant', content: 'reply' },
          { role: 'user', content: 'second message' },
        ],
      });
      expect(result).toEqual({
        prompt: 'second message',
        maxTurns: 1,
        model: undefined,
        chatMode: false,
        sessionContinue: false,
        requestId: 'req-1',
      });
    });

    it('returns empty prompt when no user messages exist', () => {
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
      const result = adapter.transformRequest({
        id: 'req-2',
        provider: 'adapter',
        model: 'adapter',
        messages: [{ role: 'assistant', content: 'hello' }],
      });
      expect(result).toEqual({
        prompt: '',
        maxTurns: 1,
        model: undefined,
        chatMode: false,
        sessionContinue: false,
        requestId: 'req-2',
      });
    });
  });

  describe('execute', () => {
    describe('with ClaudeProvider', () => {
      it('spawns claude binary using provider.command', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'hello', exitCode: 0 });
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(calls[0]!.cmd).toBe('claude');
      });

      it('uses commandOverride instead of provider.command when provided', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
        const adapter = new CliLlmAdapter(
          claudeProvider,
          { ...baseOpts, commandOverride: '/usr/local/bin/claude-custom' },
          spawnFn,
        );
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(calls[0]!.cmd).toBe('/usr/local/bin/claude-custom');
      });

      it('builds args via provider.buildArgs() and pipes prompt via stdin', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);
        await adapter.execute({ prompt: 'do something', maxTurns: 1 });

        const args = calls[0]!.args;
        // ClaudeProvider includes these flags
        expect(args).toContain('--print');
        expect(args).toContain('--dangerously-skip-permissions');
        expect(args).toContain('--output-format');
        expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
        expect(args).toContain('--verbose');
        expect(args).toContain('--plugin-dir');
        expect(args[args.indexOf('--plugin-dir') + 1]).toBe('/dev/null');
        expect(args).toContain('--no-session-persistence');
        expect(args).toContain('--max-turns');
        expect(args[args.indexOf('--max-turns') + 1]).toBe('1');
        // prompt piped via stdin, not in args
        expect(args).not.toContain('do something');
        // stdin is pipe
        expect(calls[0]!.options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
      });

      it('filters CLAUDE* env vars via provider.filterEnv()', async () => {
        const originalEnv = process.env;
        process.env = {
          ...originalEnv,
          CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
          CLAUDE_SESSION_ID: 'abc123',
          CLAUDECODE_PLUGIN: 'some-plugin',
          PATH: '/usr/bin',
          HOME: '/home/test',
        };

        try {
          const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
          const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);
          await adapter.execute({ prompt: 'test', maxTurns: 1 });

          const env = calls[0]!.options.env as Record<string, string>;
          expect(env['CLAUDE_CODE_ENTRYPOINT']).toBeUndefined();
          expect(env['CLAUDE_SESSION_ID']).toBeUndefined();
          expect(env['CLAUDECODE_PLUGIN']).toBeUndefined();
          expect(env['PATH']).toBe('/usr/bin');
          expect(env['HOME']).toBe('/home/test');
        } finally {
          process.env = originalEnv;
        }
      });
    });

    describe('with CodexProvider', () => {
      it('spawns codex binary using provider.command', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'hello', exitCode: 0 });
        const adapter = new CliLlmAdapter(codexProvider, baseOpts, spawnFn);
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(calls[0]!.cmd).toBe('codex');
      });

      it('builds codex args via provider.buildArgs()', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
        const adapter = new CliLlmAdapter(codexProvider, baseOpts, spawnFn);
        await adapter.execute({ prompt: 'test', maxTurns: 1 });

        const args = calls[0]!.args;
        expect(args).toContain('exec');
        expect(args).toContain('--full-auto');
        expect(args).toContain('--json');
        expect(args).toContain('--color');
        // prompt piped via stdin, not in args
        expect(args).not.toContain('test');
      });

      it('does not filter CLAUDE* env vars (codex filterEnv passes through)', async () => {
        const originalEnv = process.env;
        process.env = {
          ...originalEnv,
          CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
          PATH: '/usr/bin',
        };

        try {
          const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
          const adapter = new CliLlmAdapter(codexProvider, baseOpts, spawnFn);
          await adapter.execute({ prompt: 'test', maxTurns: 1 });

          const env = calls[0]!.options.env as Record<string, string>;
          // CodexProvider.filterEnv preserves CLAUDE* vars
          expect(env['CLAUDE_CODE_ENTRYPOINT']).toBe('claude-vscode');
          expect(env['PATH']).toBe('/usr/bin');
        } finally {
          process.env = originalEnv;
        }
      });
    });

    describe('common behavior', () => {
      it('resolves with stdout string on exit code 0', async () => {
        const { spawnFn } = createMockSpawn({ stdout: 'response text', exitCode: 0 });
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);
        const result = await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(result).toBe('response text');
      });

      it('rejects on non-zero exit code with stderr in error message', async () => {
        const { spawnFn } = createMockSpawn({
          stdout: '',
          stderr: 'something went wrong',
          exitCode: 1,
        });
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);

        await expect(adapter.execute({ prompt: 'test', maxTurns: 1 }))
          .rejects.toThrow('something went wrong');
      });

      it('kills child process on timeout and rejects', async () => {
        const { spawnFn } = createMockSpawn({
          neverExit: true,
        });
        const adapter = new CliLlmAdapter(
          claudeProvider,
          { ...baseOpts, timeoutMs: 50 },
          spawnFn,
        );

        await expect(adapter.execute({ prompt: 'test', maxTurns: 1 }))
          .rejects.toThrow(/timeout/i);
      });

      it('sets cwd to opts.workingDir', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
        const adapter = new CliLlmAdapter(
          claudeProvider,
          { workingDir: '/my/project' },
          spawnFn,
        );
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(calls[0]!.options.cwd).toBe('/my/project');
      });

      it('uses stdio pipe/pipe/pipe for stdin prompt piping', async () => {
        const { spawnFn, calls } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(calls[0]!.options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
      });

      it('calls onStreamLine for each complete line of stdout', async () => {
        const lines = 'line1\nline2\nline3\n';
        const { spawnFn } = createMockSpawn({ stdout: lines, exitCode: 0 });
        const collected: string[] = [];
        const adapter = new CliLlmAdapter(
          claudeProvider,
          { ...baseOpts, onStreamLine: (l) => collected.push(l) },
          spawnFn,
        );
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(collected).toEqual(['line1', 'line2', 'line3']);
      });

      it('does not call onStreamLine for empty lines', async () => {
        const lines = 'line1\n\n\nline2\n';
        const { spawnFn } = createMockSpawn({ stdout: lines, exitCode: 0 });
        const collected: string[] = [];
        const adapter = new CliLlmAdapter(
          claudeProvider,
          { ...baseOpts, onStreamLine: (l) => collected.push(l) },
          spawnFn,
        );
        await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(collected).toEqual(['line1', 'line2']);
      });

      it('still returns full stdout even with onStreamLine', async () => {
        const { spawnFn } = createMockSpawn({ stdout: 'full output', exitCode: 0 });
        const adapter = new CliLlmAdapter(
          claudeProvider,
          { ...baseOpts, onStreamLine: () => {} },
          spawnFn,
        );
        const result = await adapter.execute({ prompt: 'test', maxTurns: 1 });
        expect(result).toBe('full output');
      });

      it('switches to the next provider when the selected provider is rate limited', async () => {
        const { spawnFn, calls } = createQueuedSpawn([
          { stderr: 'rate limit exceeded', exitCode: 1 },
          { stdout: 'codex success', exitCode: 0 },
        ]);
        const adapter = new CliLlmAdapter(
          claudeProvider,
          {
            ...baseOpts,
            providers: ['codex', 'claude'],
          } as never,
          spawnFn,
        );

        const result = await adapter.execute({ prompt: 'test', maxTurns: 1 });

        expect(result).toBe('codex success');
        expect(calls).toHaveLength(2);
        expect(calls[0]!.cmd).toBe('claude');
        expect(calls[1]!.cmd).toBe('codex');
      });

      it('sleeps after all configured providers are exhausted, then retries from the selected provider', async () => {
        const sleepFn = vi.fn(async () => {});
        const { spawnFn, calls } = createQueuedSpawn([
          { stderr: 'retry-after: 5', exitCode: 1 },
          { stderr: 'resets in 3s', exitCode: 1 },
          { stdout: 'claude recovered', exitCode: 0 },
        ]);
        const adapter = new CliLlmAdapter(
          claudeProvider,
          {
            ...baseOpts,
            providers: ['claude', 'codex'],
            _sleepFn: sleepFn,
          } as never,
          spawnFn,
        );

        const result = await adapter.execute({ prompt: 'test', maxTurns: 1 });

        expect(result).toBe('claude recovered');
        expect(sleepFn).toHaveBeenCalledWith(3_000);
        expect(calls).toHaveLength(3);
        expect(calls[0]!.cmd).toBe('claude');
        expect(calls[1]!.cmd).toBe('codex');
        expect(calls[2]!.cmd).toBe('claude');
      });

      it('does not forward the selected provider model to fallback providers in chat mode', async () => {
        const { spawnFn, calls } = createQueuedSpawn([
          { stderr: 'rate limit exceeded', exitCode: 1 },
          { stdout: 'claude fallback success', exitCode: 0 },
        ]);
        const adapter = new CliLlmAdapter(
          codexProvider,
          {
            ...baseOpts,
            chatMode: true,
            model: 'codex-mini',
            providers: ['claude', 'codex'],
          },
          spawnFn,
        );

        const request = adapter.transformRequest({
          id: 'req-chat-1',
          provider: 'adapter',
          model: 'adapter',
          messages: [{ role: 'user', content: 'hello' }],
        });

        expect(request.model).toBe('codex-mini');
        await adapter.execute(request);

        expect(calls).toHaveLength(2);
        expect(calls[0]!.cmd).toBe('codex');
        expect(calls[1]!.cmd).toBe('claude');
        expect(calls[1]!.args).not.toContain('codex-mini');
      });

      it('normalizes successful fallback output with the provider that produced it', async () => {
        const { spawnFn } = createQueuedSpawn([
          { stderr: 'rate limit exceeded', exitCode: 1 },
          { stdout: '\u001b[31mfallback output\u001b[0m', exitCode: 0 },
        ]);
        const adapter = new CliLlmAdapter(
          claudeProvider,
          {
            ...baseOpts,
            providers: ['aider', 'claude'],
          },
          spawnFn,
        );

        const request = adapter.transformRequest({
          id: 'req-fallback-1',
          provider: 'adapter',
          model: 'adapter',
          messages: [{ role: 'user', content: 'hello' }],
        });

        const raw = await adapter.execute(request);
        const response = adapter.transformResponse(raw, 'req-fallback-1');

        expect(response.content).toBe('fallback output');
      });
    });
  });

  describe('transformResponse', () => {
    describe('stream-json path (supportsStreamJson=true, ClaudeProvider)', () => {
      it('extracts text from stream-json deltas via provider.normalizeOutput', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const streamJson = [
          '{"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[]}}',
          '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}',
          '{"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}',
          '{"type":"message_stop"}',
        ].join('\n');

        const result = adapter.transformResponse(streamJson, 'req-1');
        // Provider joins per-line extracted text with \n
        expect(result.content).toBe('Hello \nworld');
      });

      it('returns plain text as-is when not JSON', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const result = adapter.transformResponse('just plain text', 'req-1');
        expect(result).toEqual({ content: 'just plain text' });
      });

      it('returns empty string for empty input', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const result = adapter.transformResponse('', 'req-1');
        expect(result).toEqual({ content: '' });
      });

      it('handles mixed JSON and non-JSON lines', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const mixed = [
          'Starting...',
          '{"type":"content_block_delta","delta":{"type":"text_delta","text":"result"}}',
        ].join('\n');

        const result = adapter.transformResponse(mixed, 'req-1');
        expect(result.content).toContain('result');
      });

      it('handles message-level content array with text blocks', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const json = '{"type":"message","message":{"content":[{"type":"text","text":"full response"}]}}';
        const result = adapter.transformResponse(json, 'req-1');
        expect(result.content).toContain('full response');
      });

      it('filters out multi-line hookSpecificOutput from stream-json', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const raw = [
          '{',
          '  "hookSpecificOutput": {',
          '    "hookEventName": "SessionStart",',
          '    "additionalContext": "<EXTREMELY_IMPORTANT>skill prompt</EXTREMELY_IMPORTANT>"',
          '  }',
          '}',
          '{"type":"content_block_delta","delta":{"type":"text_delta","text":"actual response"}}',
        ].join('\n');

        const result = adapter.transformResponse(raw, 'req-1');

        expect(result.content).toContain('actual response');
        expect(result.content).not.toContain('hookSpecificOutput');
        expect(result.content).not.toContain('EXTREMELY_IMPORTANT');
      });

      it('returns empty string when all lines are structural stream-json frames', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const allStructural = [
          '{"type":"thread.started","thread_id":"019ccc41-a358-72b3-a5d1-1d4534be15"}',
          '{"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[]}}',
          '{"type":"ping"}',
          '{"type":"message_stop"}',
        ].join('\n');

        const result = adapter.transformResponse(allStructural, 'req-1');
        // Must NOT return raw JSON — that causes junk git commit messages
        expect(result.content).toBe('');
      });

      it('delegates to provider.normalizeOutput for all providers including stream-json', () => {
        // Mock provider that returns a known value from normalizeOutput
        const mockProvider = {
          name: 'mock',
          command: 'mock',
          buildArgs: () => [],
          normalizeOutput: (raw: string) => `normalized:${raw.length}`,
          estimateTokens: () => 0,
          isRateLimited: () => false,
          parseRetryAfter: () => undefined,
          filterEnv: (env: Record<string, string>) => env,
          supportsStreamJson: () => true,
        };

        const adapter = new CliLlmAdapter(mockProvider, baseOpts);
        const result = adapter.transformResponse('some raw output', 'req-1');
        expect(result.content).toBe('normalized:15');
      });

      it('returns empty content when response is only hook output', () => {
        const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
        const raw = [
          '{',
          '  "hookSpecificOutput": {',
          '    "hookEventName": "SessionStart",',
          '    "additionalContext": "plugin prompt"',
          '  }',
          '}',
        ].join('\n');

        const result = adapter.transformResponse(raw, 'req-1');

        expect(result.content).not.toContain('hookSpecificOutput');
        expect(result.content).not.toContain('plugin prompt');
      });
    });

    describe('non-stream-json path (supportsStreamJson=false, CodexProvider)', () => {
      it('delegates to provider.normalizeOutput()', () => {
        const adapter = new CliLlmAdapter(codexProvider, baseOpts);
        const raw = '{"output":"codex result"}';
        const result = adapter.transformResponse(raw, 'req-1');
        // CodexProvider.normalizeOutput extracts "output" key
        expect(result.content).toBe('codex result');
      });

      it('returns empty string when JSON parses but no text is extracted', () => {
        const adapter = new CliLlmAdapter(codexProvider, baseOpts);
        const raw = '{"type":"status","status":"complete"}';
        const result = adapter.transformResponse(raw, 'req-1');
        // CodexProvider.normalizeOutput returns '' when JSON parsed but no text extracted
        expect(result.content).toBe('');
      });

      it('returns empty string for empty input', () => {
        const adapter = new CliLlmAdapter(codexProvider, baseOpts);
        const result = adapter.transformResponse('', 'req-1');
        expect(result).toEqual({ content: '' });
      });

      it('handles plain text through normalizeOutput', () => {
        const adapter = new CliLlmAdapter(codexProvider, baseOpts);
        const result = adapter.transformResponse('plain text output', 'req-1');
        expect(result.content).toBe('plain text output');
      });
    });
  });

  describe('validateCapabilities', () => {
    it('returns true for text-completion', () => {
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
      expect(adapter.validateCapabilities('text-completion')).toBe(true);
    });

    it('returns false for unsupported capabilities', () => {
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
      expect(adapter.validateCapabilities('image-generation')).toBe(false);
      expect(adapter.validateCapabilities('embeddings')).toBe(false);
    });
  });

  describe('IAdapter contract', () => {
    it('implements IAdapter interface (transformRequest, execute, transformResponse, validateCapabilities)', () => {
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts);
      expect(typeof adapter.transformRequest).toBe('function');
      expect(typeof adapter.execute).toBe('function');
      expect(typeof adapter.transformResponse).toBe('function');
      expect(typeof adapter.validateCapabilities).toBe('function');
    });
  });

  describe('integration: full flow', () => {
      it('transforms request, executes with ClaudeProvider, and transforms stream-json response', async () => {
      const streamOutput = [
        '{"type":"content_block_delta","delta":{"type":"text_delta","text":"The answer is 42"}}',
      ].join('\n');

      const { spawnFn } = createMockSpawn({ stdout: streamOutput, exitCode: 0 });
      const adapter = new CliLlmAdapter(claudeProvider, baseOpts, spawnFn);

      const request = {
        id: 'req-1',
        provider: 'adapter',
        model: 'adapter',
        messages: [{ role: 'user' as const, content: 'What is the answer?' }],
      };

      const transformed = adapter.transformRequest(request);
      expect(transformed).toEqual({
        prompt: 'What is the answer?',
        maxTurns: 1,
        model: undefined,
        chatMode: false,
        sessionContinue: false,
        requestId: 'req-1',
      });

      const rawResponse = await adapter.execute(transformed);
      expect(typeof rawResponse).toBe('string');

      const response = adapter.transformResponse(rawResponse, 'req-1');
      expect(response.content).toBe('The answer is 42');
    });

    it('transforms request, executes with CodexProvider, and transforms non-stream response', async () => {
      const codexOutput = '{"output":"codex says 42"}';

      const { spawnFn } = createMockSpawn({ stdout: codexOutput, exitCode: 0 });
      const adapter = new CliLlmAdapter(codexProvider, baseOpts, spawnFn);

      const request = {
        id: 'req-2',
        provider: 'adapter',
        model: 'adapter',
        messages: [{ role: 'user' as const, content: 'What is the answer?' }],
      };

      const transformed = adapter.transformRequest(request);
      const rawResponse = await adapter.execute(transformed);
      const response = adapter.transformResponse(rawResponse, 'req-2');
      expect(response.content).toBe('codex says 42');
    });
  });
});
