import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CodexProvider } from '../../../../src/skills/providers/codex-provider.js';
import type { ICliProvider } from '../../../../src/skills/providers/cli-provider.js';
import { RUN_CONFIG_INTEGRITY_ENV, RUN_CONFIG_INTEGRITY_SECRET_ENV } from '../../../../src/cli/run-config-integrity.js';

describe('CodexProvider', () => {
  const provider = new CodexProvider();

  it('implements ICliProvider', () => {
    const p: ICliProvider = provider;
    expect(p.name).toBe('codex');
  });

  it('name is "codex"', () => {
    expect(provider.name).toBe('codex');
  });

  it('command is "codex"', () => {
    expect(provider.command).toBe('codex');
  });

  // -- buildArgs -----------------------------------------------------------

  it('buildArgs uses the supported workspace-write sandbox', () => {
    const args = provider.buildArgs({});
    expect(args).toEqual(['exec', '--sandbox', 'workspace-write', '--json', '--color', 'never']);
    expect(args).not.toContain('--full-auto');
  });

  it('buildArgs includes --color never', () => {
    const args = provider.buildArgs({});
    const idx = args.indexOf('--color');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('never');
  });

  it('buildArgs appends extraArgs', () => {
    const args = provider.buildArgs({ extraArgs: ['--foo', 'bar'] });
    expect(args.slice(-2)).toEqual(['--foo', 'bar']);
  });

  it('lets one explicit sandbox argument replace the default', () => {
    const args = provider.buildArgs({ extraArgs: ['--sandbox', 'read-only'] });
    expect(args.filter((arg) => arg === '--sandbox')).toHaveLength(1);
    expect(args).toContain('read-only');
    expect(args).not.toContain('workspace-write');
  });

  it.each([
    ['--config=sandbox_mode="read-only"'],
    ['-c=sandbox_mode="read-only"'],
    ['--yolo'],
  ])('recognizes single-token sandbox selection %s', (...extraArgs) => {
    const args = provider.buildArgs({ extraArgs });
    expect(args).toEqual(['exec', '--json', '--color', 'never', ...extraArgs]);
    expect(args).not.toContain('workspace-write');
  });

  it('rejects deprecated or contradictory sandbox arguments', () => {
    expect(() => provider.buildArgs({ extraArgs: ['--full-auto'] })).toThrow(/deprecated/i);
    expect(() => provider.buildArgs({
      extraArgs: ['--sandbox', 'read-only', '-s', 'workspace-write'],
    })).toThrow(/one Codex sandbox selection/i);
  });

  it('buildArgs includes the selected model', () => {
    const args = provider.buildArgs({ model: 'gpt-5.3-codex-spark' });
    const idx = args.indexOf('--model');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('gpt-5.3-codex-spark');
  });

  // -- supportsStreamJson --------------------------------------------------

  it('supportsStreamJson returns false', () => {
    expect(provider.supportsStreamJson()).toBe(false);
  });

  // -- filterEnv -----------------------------------------------------------

  it('filterEnv marks spawned child processes and strips runtime config integrity state', () => {
    const env = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'test-env-value',
      HOME: '/home/user',
      [RUN_CONFIG_INTEGRITY_ENV]: '/tmp/run-config.integrity',
      [RUN_CONFIG_INTEGRITY_SECRET_ENV]: 'signing-key',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).toEqual({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'test-env-value',
      HOME: '/home/user',
      FRANKENBEAST_SPAWNED: '1',
    });
    expect(env).toHaveProperty(RUN_CONFIG_INTEGRITY_ENV, '/tmp/run-config.integrity');
    expect(env).toHaveProperty(RUN_CONFIG_INTEGRITY_SECRET_ENV, 'signing-key');
  });

  it('filterEnv returns a copy, does not mutate input', () => {
    const env = { PATH: '/usr/bin' };
    const filtered = provider.filterEnv(env);
    expect(filtered).not.toBe(env);
    expect(env).not.toHaveProperty('FRANKENBEAST_SPAWNED');
    expect(filtered).toEqual({
      ...env,
      FRANKENBEAST_SPAWNED: '1',
    });
  });

  // -- isRateLimited -------------------------------------------------------

  it('isRateLimited detects rate limit patterns', () => {
    expect(provider.isRateLimited('rate limit exceeded')).toBe(true);
    expect(provider.isRateLimited('HTTP 429')).toBe(true);
    expect(provider.isRateLimited('too many requests')).toBe(true);
  });

  it('isRateLimited returns false for normal errors', () => {
    expect(provider.isRateLimited('file not found')).toBe(false);
    expect(provider.isRateLimited('')).toBe(false);
  });

  // -- parseRetryAfter -----------------------------------------------------

  it('parseRetryAfter parses "resets in 30s"', () => {
    const ms = provider.parseRetryAfter('resets in 30s');
    expect(ms).toBe(30_000);
  });

  it('parseRetryAfter returns undefined when no pattern matches', () => {
    expect(provider.parseRetryAfter('unknown error')).toBeUndefined();
  });

  // -- estimateTokens ------------------------------------------------------

  it('estimateTokens uses ~16 chars per token (code-heavy output)', () => {
    const text = 'a'.repeat(160);
    expect(provider.estimateTokens(text)).toBe(10);
  });

  // -- normalizeOutput -----------------------------------------------------

  it('normalizeOutput extracts text from JSON output', () => {
    const raw = JSON.stringify({ output_text: 'hello world' });
    expect(provider.normalizeOutput(raw)).toContain('hello world');
  });

  it('normalizeOutput passes through plain text lines', () => {
    expect(provider.normalizeOutput('plain output')).toBe('plain output');
  });

  it('normalizeOutput returns empty string when JSON parses but contains no text', () => {
    const raw = [
      JSON.stringify({ type: 'thread.started', thread_id: '019ccc41-a358' }),
      JSON.stringify({ type: 'message_stop' }),
    ].join('\n');
    expect(provider.normalizeOutput(raw)).toBe('');
  });

  it('normalizeOutput does not keep a redundant parsed-json empty-output branch', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../../../src/skills/providers/codex-provider.ts'),
      'utf-8',
    );

    expect(source).not.toContain('parsedJsonLines > 0 && extracted.length === 0');
  });

  it('normalizeOutput handles mixed JSON and plain text', () => {
    const raw = [
      JSON.stringify({ output_text: 'from json' }),
      'plain line',
    ].join('\n');
    const result = provider.normalizeOutput(raw);
    expect(result).toContain('from json');
    expect(result).toContain('plain line');
  });

  it('normalizeOutput extracts Codex JSONL error messages', () => {
    const raw = JSON.stringify({ type: 'error', error: { message: 'workspace is not trusted' } });
    expect(provider.normalizeOutput(raw)).toBe('workspace is not trusted');
  });

  it('normalizeOutput extracts assistant text from codex item.completed events', () => {
    const raw = JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'Implemented chunk 08' },
          { type: 'output_text', text: '<promise>HARDEN_08_http-chat-routes_DONE</promise>' },
        ],
      },
    });

    const result = provider.normalizeOutput(raw);
    expect(result).toContain('Implemented chunk 08');
    expect(result).toContain('<promise>HARDEN_08_http-chat-routes_DONE</promise>');
  });
});
