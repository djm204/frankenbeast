import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { BrainSnapshot, LlmStreamEvent } from '@franken/types';
import { CodexCliAdapter } from '../../../src/providers/codex-cli-adapter.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));
import { spawn } from 'node:child_process';
import {
  RUN_CONFIG_INTEGRITY_BYPASS_ENV,
  RUN_CONFIG_INTEGRITY_ENV,
  RUN_CONFIG_INTEGRITY_SECRET_ENV,
} from '../../../src/cli/run-config-integrity.js';

function mockSpawn(stdoutLines: string[], exitCode = 0) {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stdin,
    stderr: new PassThrough(),
    pid: 1,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  });
  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);
  setImmediate(() => {
    for (const line of stdoutLines) stdout.write(line + '\n');
    stdout.end();
    setImmediate(() => {
      proc.exitCode = exitCode;
      proc.emit('close', exitCode);
    });
  });
  return proc;
}

function mockSpawnError(errorMessage = 'spawn command not found') {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stdin,
    stderr: new PassThrough(),
    pid: 1,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  });
  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);
  setImmediate(() => {
    proc.emit('error', Object.assign(new Error(errorMessage), { code: 'ENOENT' }));
    setImmediate(() => {
      stdout.end();
      proc.exitCode = 127;
      proc.emit('close', 127);
    });
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
    (spawn as ReturnType<typeof vi.fn>).mockClear();
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

  describe('isAvailable()', () => {
    it('does not expose runtime config integrity state to the Codex availability probe', async () => {
      const originalManifest = process.env[RUN_CONFIG_INTEGRITY_ENV];
      const originalSecret = process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
      const originalBypass = process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV];
      process.env[RUN_CONFIG_INTEGRITY_ENV] = '/tmp/run-config.integrity';
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = 'signing-key';
      process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV] = '1';
      try {
        mockSpawn([]);
        await expect(adapter.isAvailable()).resolves.toBe(true);
        const spawnOptions = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as { env?: Record<string, string> } | undefined;
        expect(spawnOptions?.env).not.toHaveProperty(RUN_CONFIG_INTEGRITY_ENV);
        expect(spawnOptions?.env).not.toHaveProperty(RUN_CONFIG_INTEGRITY_SECRET_ENV);
        expect(spawnOptions?.env).not.toHaveProperty(RUN_CONFIG_INTEGRITY_BYPASS_ENV);
      } finally {
        if (originalManifest === undefined) {
          delete process.env[RUN_CONFIG_INTEGRITY_ENV];
        } else {
          process.env[RUN_CONFIG_INTEGRITY_ENV] = originalManifest;
        }
        if (originalSecret === undefined) {
          delete process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
        } else {
          process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = originalSecret;
        }
        if (originalBypass === undefined) {
          delete process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV];
        } else {
          process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV] = originalBypass;
        }
      }
    });
  });

  describe('execute()', () => {
    it('does not expose runtime config integrity state to the Codex CLI process', async () => {
      const originalManifest = process.env[RUN_CONFIG_INTEGRITY_ENV];
      const originalSecret = process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
      process.env[RUN_CONFIG_INTEGRITY_ENV] = '/tmp/run-config.integrity';
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = 'signing-key';
      try {
        mockSpawn([JSON.stringify({ type: 'done' })]);
        await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
        const spawnOptions = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as { env?: Record<string, string> } | undefined;
        expect(spawnOptions?.env).not.toHaveProperty(RUN_CONFIG_INTEGRITY_ENV);
        expect(spawnOptions?.env).not.toHaveProperty(RUN_CONFIG_INTEGRITY_SECRET_ENV);
      } finally {
        if (originalManifest === undefined) {
          delete process.env[RUN_CONFIG_INTEGRITY_ENV];
        } else {
          process.env[RUN_CONFIG_INTEGRITY_ENV] = originalManifest;
        }
        if (originalSecret === undefined) {
          delete process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
        } else {
          process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = originalSecret;
        }
      }
    });

    it('parses text content events', async () => {
      const proc = mockSpawn([
        JSON.stringify({ type: 'message', content: 'Hello from Codex' }),
        JSON.stringify({ type: 'done', usage: { input_tokens: 80, output_tokens: 20 } }),
      ]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));
      expect(events[0]).toEqual({ type: 'text', content: 'Hello from Codex' });
      expect(events[1]).toEqual({ type: 'done', usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 } });
      expect(proc.kill).not.toHaveBeenCalled();
    });

    it('handles spawn failure errors without leaking unhandled events', async () => {
      const proc = mockSpawnError('codex: command not found');
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] }));

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'error',
        error: expect.stringContaining('codex process failed to start: codex: command not found'),
        retryable: false,
      });
      expect(proc.kill).not.toHaveBeenCalled();
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
      expect(events[0]).toEqual({
        type: 'error',
        error: 'codex process exited with code 1',
        retryable: false,
      });
    });

    it('emits retryable error on rate limit message', async () => {
      const proc = mockSpawn([JSON.stringify({ type: 'error', message: 'rate limit 429' })]);
      const events = await collectEvents(adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'x' }] }));
      expect(events[0]).toEqual({ type: 'error', error: 'rate limit 429', retryable: true });
      expect(proc.kill).toHaveBeenCalledTimes(1);
    });

    it('kills the spawned Codex process when stream iteration stops early', async () => {
      const proc = mockSpawn([JSON.stringify({ type: 'message', content: 'partial' })]);
      const iterator = adapter.execute({ systemPrompt: '', messages: [{ role: 'user', content: 'Hi' }] });

      await expect(iterator.next()).resolves.toEqual({ value: { type: 'text', content: 'partial' }, done: false });
      await iterator.return(undefined);

      expect(proc.kill).toHaveBeenCalledTimes(1);
    });
  });

  describe('discoverSkills()', () => {
    it('preserves MCP tool definitions in discovered catalog entries', async () => {
      const toolDefinitions = [
        { name: 'read_repo', description: 'Read a repository file', inputSchema: { type: 'object' } },
      ];
      mockSpawn([JSON.stringify([{ name: 'repo', toolDefinitions }])]);

      await expect(adapter.discoverSkills()).resolves.toEqual([
        expect.objectContaining({ name: 'repo', toolDefinitions }),
      ]);
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
