import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../../../../src/skills/providers/gemini-provider.js';
import type { ICliProvider } from '../../../../src/skills/providers/cli-provider.js';

describe('GeminiProvider', () => {
  const provider = new GeminiProvider();

  it('implements ICliProvider', () => {
    const p: ICliProvider = provider;
    expect(p.name).toBe('gemini');
  });

  it('name is "gemini"', () => {
    expect(provider.name).toBe('gemini');
  });

  it('command is "gemini"', () => {
    expect(provider.command).toBe('gemini');
  });

  // -- buildArgs -----------------------------------------------------------

  it('buildArgs includes -p flag', () => {
    const args = provider.buildArgs({});
    expect(args).toContain('-p');
  });

  it('buildArgs supplies an empty prompt argument after -p for stdin-driven headless mode', () => {
    const args = provider.buildArgs({});
    const promptIndex = args.indexOf('-p');
    expect(promptIndex).toBeGreaterThanOrEqual(0);
    expect(args[promptIndex + 1]).toBe('');
  });

  it('buildArgs includes --yolo flag', () => {
    const args = provider.buildArgs({});
    expect(args).toContain('--yolo');
  });

  it('buildArgs includes --output-format stream-json', () => {
    const args = provider.buildArgs({});
    const idx = args.indexOf('--output-format');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('stream-json');
  });

  it('buildArgs appends extraArgs', () => {
    const args = provider.buildArgs({ extraArgs: ['--model', 'gemini-2.5-pro'] });
    expect(args).toContain('--model');
    expect(args).toContain('gemini-2.5-pro');
  });

  // -- supportsStreamJson --------------------------------------------------

  it('supportsStreamJson returns true', () => {
    expect(provider.supportsStreamJson()).toBe(true);
  });

  // -- filterEnv -----------------------------------------------------------

  it('filterEnv strips GEMINI* and GOOGLE* env vars', () => {
    const env = {
      PATH: '/usr/bin',
      GEMINI_API_KEY: 'gm-123',
      GOOGLE_CLOUD_PROJECT: 'my-project',
      GOOGLE_API_KEY: 'ga-456',
      HOME: '/home/user',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).toHaveProperty('PATH', '/usr/bin');
    expect(filtered).toHaveProperty('HOME', '/home/user');
    expect(filtered).not.toHaveProperty('GEMINI_API_KEY');
    expect(filtered).not.toHaveProperty('GOOGLE_CLOUD_PROJECT');
    expect(filtered).not.toHaveProperty('GOOGLE_API_KEY');
  });

  it('filterEnv returns a copy, does not mutate input', () => {
    const env = { PATH: '/usr/bin', GEMINI_KEY: 'secret' };
    const filtered = provider.filterEnv(env);
    expect(env).toHaveProperty('GEMINI_KEY', 'secret');
    expect(filtered).not.toBe(env);
  });

  // -- isRateLimited -------------------------------------------------------

  it('isRateLimited detects RESOURCE_EXHAUSTED', () => {
    expect(provider.isRateLimited('RESOURCE_EXHAUSTED: quota exceeded')).toBe(true);
  });

  it('isRateLimited detects common rate limit patterns', () => {
    expect(provider.isRateLimited('rate limit exceeded')).toBe(true);
    expect(provider.isRateLimited('HTTP 429')).toBe(true);
    expect(provider.isRateLimited('too many requests')).toBe(true);
  });

  it('isRateLimited returns false for normal errors', () => {
    expect(provider.isRateLimited('permission denied')).toBe(false);
    expect(provider.isRateLimited('')).toBe(false);
  });

  // -- parseRetryAfter -----------------------------------------------------

  it('parseRetryAfter parses retry-after header', () => {
    const ms = provider.parseRetryAfter('retry-after: 60');
    expect(ms).toBe(60_000);
  });

  it('parseRetryAfter returns undefined when no pattern matches', () => {
    expect(provider.parseRetryAfter('unknown error')).toBeUndefined();
  });

  // -- estimateTokens ------------------------------------------------------

  it('estimateTokens uses ~4 chars per token', () => {
    const text = 'a'.repeat(100);
    expect(provider.estimateTokens(text)).toBe(25);
  });

  // -- normalizeOutput -----------------------------------------------------

  it('normalizeOutput processes stream-json lines', () => {
    const raw = [
      JSON.stringify({ delta: { text: 'hello ' } }),
      JSON.stringify({ delta: { text: 'world' } }),
    ].join('\n');
    const result = provider.normalizeOutput(raw);
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('normalizeOutput passes through plain text', () => {
    expect(provider.normalizeOutput('plain output')).toBe('plain output');
  });

  it('normalizeOutput preserves raw JSON arrays', () => {
    const raw = '[{"issueNumber": 1}]';
    expect(provider.normalizeOutput(raw)).toBe(raw);
  });

  it('normalizeOutput skips structural JSON objects (no text keys)', () => {
    const raw = '{"type": "ping"}';
    expect(provider.normalizeOutput(raw)).toBe('');
  });
});
