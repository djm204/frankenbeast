import { describe, it, expect } from 'vitest';
import { ClaudeProvider } from '../../../../src/skills/providers/claude-provider.js';
import type { ICliProvider } from '../../../../src/skills/providers/cli-provider.js';

describe('ClaudeProvider', () => {
  const provider = new ClaudeProvider();

  it('implements ICliProvider', () => {
    const p: ICliProvider = provider;
    expect(p.name).toBe('claude');
  });

  it('name is "claude"', () => {
    expect(provider.name).toBe('claude');
  });

  it('command is "claude"', () => {
    expect(provider.command).toBe('claude');
  });

  // -- buildArgs -----------------------------------------------------------

  it('buildArgs includes --print and structural flags', () => {
    const args = provider.buildArgs({});
    expect(args).toContain('--print');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--verbose');
    expect(args).toContain('--disable-slash-commands');
    expect(args).toContain('--no-session-persistence');
  });

  it('buildArgs includes --output-format stream-json', () => {
    const args = provider.buildArgs({});
    const idx = args.indexOf('--output-format');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('stream-json');
  });

  it('buildArgs includes --plugin-dir /dev/null', () => {
    const args = provider.buildArgs({});
    const idx = args.indexOf('--plugin-dir');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('/dev/null');
  });

  it('buildArgs includes --max-turns when provided', () => {
    const args = provider.buildArgs({ maxTurns: 25 });
    const idx = args.indexOf('--max-turns');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('25');
  });

  it('buildArgs appends extraArgs', () => {
    const args = provider.buildArgs({ extraArgs: ['--model', 'opus'] });
    expect(args).toContain('--model');
    expect(args).toContain('opus');
  });

  // -- supportsStreamJson --------------------------------------------------

  it('supportsStreamJson returns true', () => {
    expect(provider.supportsStreamJson()).toBe(true);
  });

  // -- filterEnv -----------------------------------------------------------

  it('filterEnv strips CLAUDE* env vars', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
      CLAUDE_API_KEY: 'sk-123',
      CLAUDECODE: 'true',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).toHaveProperty('PATH', '/usr/bin');
    expect(filtered).toHaveProperty('HOME', '/home/user');
    expect(filtered).not.toHaveProperty('CLAUDE_CODE_ENTRYPOINT');
    expect(filtered).not.toHaveProperty('CLAUDE_API_KEY');
    expect(filtered).not.toHaveProperty('CLAUDECODE');
  });

  it('filterEnv returns a copy, does not mutate input', () => {
    const env = { PATH: '/usr/bin', CLAUDE_KEY: 'secret' };
    const filtered = provider.filterEnv(env);
    expect(env).toHaveProperty('CLAUDE_KEY', 'secret');
    expect(filtered).not.toBe(env);
  });

  // -- isRateLimited -------------------------------------------------------

  it('isRateLimited detects rate limit patterns', () => {
    expect(provider.isRateLimited('error: rate limit exceeded')).toBe(true);
    expect(provider.isRateLimited('HTTP 429 too many requests')).toBe(true);
    expect(provider.isRateLimited('server overloaded')).toBe(true);
    expect(provider.isRateLimited('temporarily unavailable')).toBe(true);
    expect(provider.isRateLimited('out of extra usage')).toBe(true);
    expect(provider.isRateLimited('usage limit')).toBe(true);
  });

  it('isRateLimited returns false for normal errors', () => {
    expect(provider.isRateLimited('syntax error in file.ts')).toBe(false);
    expect(provider.isRateLimited('connection refused')).toBe(false);
    expect(provider.isRateLimited('')).toBe(false);
  });

  // -- parseRetryAfter -----------------------------------------------------

  it('parseRetryAfter parses "retry-after: 30" header', () => {
    const ms = provider.parseRetryAfter('retry-after: 30');
    expect(ms).toBe(30_000);
  });

  it('parseRetryAfter parses "retry after 25s" message', () => {
    const ms = provider.parseRetryAfter('Please retry after 25s');
    expect(ms).toBe(25_000);
  });

  it('parseRetryAfter parses "try again in 5 minutes"', () => {
    const ms = provider.parseRetryAfter('try again in 5 minutes');
    expect(ms).toBe(300_000);
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
    expect(provider.normalizeOutput('plain text output')).toBe('plain text output');
  });

  // -- hook output filtering ------------------------------------------------

  it('normalizeOutput skips multi-line hook output mixed with real content', () => {
    // Hook output is formatted JSON spanning multiple lines
    const raw = [
      '{',
      '  "hookSpecificOutput": {',
      '    "hookEventName": "SessionStart",',
      '    "additionalContext": "<EXTREMELY_IMPORTANT>Use superpowers</EXTREMELY_IMPORTANT>"',
      '  }',
      '}',
      JSON.stringify({ delta: { text: 'actual LLM response' } }),
    ].join('\n');

    const result = provider.normalizeOutput(raw);

    expect(result).toContain('actual LLM response');
    expect(result).not.toContain('hookSpecificOutput');
    expect(result).not.toContain('EXTREMELY_IMPORTANT');
    expect(result).not.toContain('SessionStart');
  });

  it('normalizeOutput handles response that is only hook output', () => {
    const raw = [
      '{',
      '  "hookSpecificOutput": {',
      '    "hookEventName": "SessionStart",',
      '    "additionalContext": "huge plugin prompt"',
      '  }',
      '}',
    ].join('\n');

    const result = provider.normalizeOutput(raw);

    expect(result).toBe('');
  });
});
