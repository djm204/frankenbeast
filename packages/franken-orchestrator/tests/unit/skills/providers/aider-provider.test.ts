import { describe, it, expect } from 'vitest';
import { AiderProvider } from '../../../../src/skills/providers/aider-provider.js';
import type { ICliProvider } from '../../../../src/skills/providers/cli-provider.js';

describe('AiderProvider', () => {
  const provider = new AiderProvider();

  it('implements ICliProvider', () => {
    const p: ICliProvider = provider;
    expect(p.name).toBe('aider');
  });

  it('name is "aider"', () => {
    expect(provider.name).toBe('aider');
  });

  it('command is "aider"', () => {
    expect(provider.command).toBe('aider');
  });

  // -- buildArgs -----------------------------------------------------------

  it('buildArgs includes --message flag', () => {
    const args = provider.buildArgs({});
    expect(args).toContain('--message');
  });

  it('buildArgs includes --yes-always --no-stream --no-auto-commits', () => {
    const args = provider.buildArgs({});
    expect(args).toContain('--yes-always');
    expect(args).toContain('--no-stream');
    expect(args).toContain('--no-auto-commits');
  });

  it('buildArgs appends extraArgs', () => {
    const args = provider.buildArgs({ extraArgs: ['--model', 'gpt-4'] });
    expect(args).toContain('--model');
    expect(args).toContain('gpt-4');
  });

  // -- supportsStreamJson --------------------------------------------------

  it('supportsStreamJson returns false', () => {
    expect(provider.supportsStreamJson()).toBe(false);
  });

  // -- filterEnv -----------------------------------------------------------

  it('filterEnv strips AIDER* env vars', () => {
    const env = {
      PATH: '/usr/bin',
      AIDER_MODEL: 'gpt-4',
      AIDER_API_KEY: 'ak-123',
      HOME: '/home/user',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).toHaveProperty('PATH', '/usr/bin');
    expect(filtered).toHaveProperty('HOME', '/home/user');
    expect(filtered).not.toHaveProperty('AIDER_MODEL');
    expect(filtered).not.toHaveProperty('AIDER_API_KEY');
  });

  it('filterEnv returns a copy, does not mutate input', () => {
    const env = { PATH: '/usr/bin', AIDER_KEY: 'secret' };
    const filtered = provider.filterEnv(env);
    expect(env).toHaveProperty('AIDER_KEY', 'secret');
    expect(filtered).not.toBe(env);
  });

  // -- isRateLimited -------------------------------------------------------

  it('isRateLimited always returns false (LiteLLM handles retries)', () => {
    expect(provider.isRateLimited('rate limit exceeded')).toBe(false);
    expect(provider.isRateLimited('HTTP 429')).toBe(false);
    expect(provider.isRateLimited('too many requests')).toBe(false);
    expect(provider.isRateLimited('')).toBe(false);
  });

  // -- parseRetryAfter -----------------------------------------------------

  it('parseRetryAfter always returns undefined (LiteLLM handles retries)', () => {
    expect(provider.parseRetryAfter('retry-after: 30')).toBeUndefined();
    expect(provider.parseRetryAfter('unknown error')).toBeUndefined();
  });

  // -- estimateTokens ------------------------------------------------------

  it('estimateTokens uses ~4 chars per token', () => {
    const text = 'a'.repeat(100);
    expect(provider.estimateTokens(text)).toBe(25);
  });

  // -- normalizeOutput -----------------------------------------------------

  it('normalizeOutput strips ANSI escape codes', () => {
    const ansi = '\x1b[31mError:\x1b[0m something failed\x1b[1m badly\x1b[22m';
    const result = provider.normalizeOutput(ansi);
    expect(result).toBe('Error: something failed badly');
  });

  it('normalizeOutput preserves plain text', () => {
    expect(provider.normalizeOutput('clean output')).toBe('clean output');
  });

  it('normalizeOutput handles multi-line ANSI output', () => {
    const raw = '\x1b[32mline1\x1b[0m\n\x1b[33mline2\x1b[0m';
    const result = provider.normalizeOutput(raw);
    expect(result).toBe('line1\nline2');
  });
});
