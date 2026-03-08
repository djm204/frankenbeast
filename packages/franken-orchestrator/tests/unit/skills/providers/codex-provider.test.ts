import { describe, it, expect } from 'vitest';
import { CodexProvider } from '../../../../src/skills/providers/codex-provider.js';
import type { ICliProvider } from '../../../../src/skills/providers/cli-provider.js';

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

  it('buildArgs includes exec --full-auto --json', () => {
    const args = provider.buildArgs({});
    expect(args[0]).toBe('exec');
    expect(args).toContain('--full-auto');
    expect(args).toContain('--json');
  });

  it('buildArgs includes --color never', () => {
    const args = provider.buildArgs({});
    const idx = args.indexOf('--color');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('never');
  });

  it('buildArgs appends extraArgs', () => {
    const args = provider.buildArgs({ extraArgs: ['--model', 'o3'] });
    expect(args).toContain('--model');
    expect(args).toContain('o3');
  });

  // -- supportsStreamJson --------------------------------------------------

  it('supportsStreamJson returns false', () => {
    expect(provider.supportsStreamJson()).toBe(false);
  });

  // -- filterEnv -----------------------------------------------------------

  it('filterEnv returns env unchanged (no filtering needed)', () => {
    const env = { PATH: '/usr/bin', OPENAI_API_KEY: 'sk-123', HOME: '/home/user' };
    const filtered = provider.filterEnv(env);
    expect(filtered).toEqual(env);
  });

  it('filterEnv returns a copy, does not mutate input', () => {
    const env = { PATH: '/usr/bin' };
    const filtered = provider.filterEnv(env);
    expect(filtered).not.toBe(env);
    expect(filtered).toEqual(env);
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

  it('normalizeOutput handles mixed JSON and plain text', () => {
    const raw = [
      JSON.stringify({ output_text: 'from json' }),
      'plain line',
    ].join('\n');
    const result = provider.normalizeOutput(raw);
    expect(result).toContain('from json');
    expect(result).toContain('plain line');
  });
});
