import { describe, it, expect } from 'vitest';
import {
  classifyCommandFailure,
  commandFailureFromExecError,
  isCommandFailure,
  MAX_RATE_LIMIT_SLEEP_MS,
  parseResetTimeText,
} from '../../../src/errors/command-failure.js';

describe('classifyCommandFailure', () => {
  it('marks stdout-only provider throttling as rate-limited', () => {
    const failure = classifyCommandFailure({
      tool: 'llm',
      provider: 'claude',
      command: 'claude --print',
      exitCode: 1,
      stdout: 'Error: rate limit exceeded\nretry-after: 7',
      stderr: '',
      normalizedOutput: 'Error: rate limit exceeded\nretry-after: 7',
      detectRateLimit: (text) => /rate limit/i.test(text),
      parseRetryAfterMs: (text) => {
        const match = text.match(/retry-after:\s*(\d+)/i);
        return match?.[1] ? Number(match[1]) * 1000 : undefined;
      },
    });

    expect(failure.kind).toBe('rate_limit');
    expect(failure.rateLimited).toBe(true);
    expect(failure.retryable).toBe(true);
    expect(failure.retryAfterMs).toBe(7_000);
    expect(failure.summary).toContain('claude');
  });

  it('keeps timeout distinct from rate limits even when output mentions rate limiting', () => {
    const failure = classifyCommandFailure({
      tool: 'llm',
      provider: 'claude',
      command: 'claude --print',
      exitCode: 124,
      timedOut: true,
      stdout: 'implementing rate limit handling for 429 responses',
      stderr: '[MartinLoop] iteration timed out after 1000ms',
      detectRateLimit: (text) => /rate limit/i.test(text),
      parseRetryAfterMs: () => 5_000,
    });

    expect(failure.kind).toBe('timeout');
    expect(failure.rateLimited).toBe(false);
    expect(failure.retryable).toBe(false);
    expect(failure.retryAfterMs).toBeUndefined();
  });

  it('classifies generic non-zero exits without retry metadata', () => {
    const failure = classifyCommandFailure({
      tool: 'git',
      command: 'git checkout main',
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: pathspec did not match any files',
    });

    expect(failure.kind).toBe('command_failed');
    expect(failure.rateLimited).toBe(false);
    expect(failure.retryable).toBe(false);
    expect(failure.summary).toContain('git checkout main');
  });

  it('summarizes normalized stdout before redacted stderr diagnostics', () => {
    const failure = classifyCommandFailure({
      tool: 'llm',
      provider: 'codex',
      command: 'codex',
      exitCode: 1,
      stdout: '{"type":"error"}',
      normalizedOutput: 'workspace is not trusted',
      stderr: 'warning: deprecated option; API_KEY=super-secret-value',
    });

    expect(failure.summary).toContain('workspace is not trusted');
    expect(failure.summary).toContain('warning: deprecated option; API_KEY=<redacted>');
    expect(failure.summary).not.toContain('super-secret-value');
  });

  it('clamps finite provider retry hints and rejects non-finite values', () => {
    const base = {
      tool: 'llm',
      provider: 'custom',
      command: 'custom',
      exitCode: 1,
      stderr: 'rate limit exceeded',
      detectRateLimit: () => true,
    } as const;

    const clamped = classifyCommandFailure({
      ...base,
      parseRetryAfterMs: () => MAX_RATE_LIMIT_SLEEP_MS * 100,
    });
    const rejected = classifyCommandFailure({
      ...base,
      parseRetryAfterMs: () => Number.POSITIVE_INFINITY,
    });

    expect(clamped.retryAfterMs).toBe(MAX_RATE_LIMIT_SLEEP_MS);
    expect(clamped.retryAfterClamped).toBe(true);
    expect(rejected.retryAfterMs).toBeUndefined();
    expect(rejected.retryAfterClamped).toBeUndefined();
  });

  it('preserves clamp state when the generic reset parser already bounded the hint', () => {
    const failure = classifyCommandFailure({
      tool: 'llm',
      provider: 'custom',
      command: 'custom',
      exitCode: 1,
      stderr: 'rate limit exceeded; resets at 2999-01-01T00:00:00Z',
      detectRateLimit: () => true,
      parseRetryAfterMs: (text) => {
        const parsed = parseResetTimeText(text);
        return parsed.sleepSeconds >= 0 ? parsed.sleepSeconds * 1000 : undefined;
      },
    });

    expect(failure.retryAfterMs).toBe(MAX_RATE_LIMIT_SLEEP_MS);
    expect(failure.retryAfterClamped).toBe(true);
  });
});

describe('parseResetTimeText', () => {
  it.each([
    ['retry-after: 999999', 'retry-after header'],
    ['x-ratelimit-reset: 9999999999', 'x-ratelimit-reset epoch'],
    ['resets at 2999-01-01T00:00:00Z', 'reset-at timestamp'],
  ])('clamps far-future provider reset hints from %s', (text, source) => {
    expect(parseResetTimeText(text)).toEqual({
      sleepSeconds: MAX_RATE_LIMIT_SLEEP_MS / 1000,
      source: `${source} (clamped to 120s)`,
    });
  });

  it('preserves legitimate short retry hints', () => {
    expect(parseResetTimeText('retry-after: 7')).toEqual({
      sleepSeconds: 7,
      source: 'retry-after header',
    });
  });

  it('rejects overflowing retry hints', () => {
    expect(parseResetTimeText(`retry-after: ${'9'.repeat(400)}`)).toEqual({
      sleepSeconds: -1,
      source: 'unknown',
    });
  });
});

describe('commandFailureFromExecError', () => {
  it('extracts stdout, stderr, and exit code from exec errors', () => {
    const error = Object.assign(new Error('Command failed'), {
      status: 128,
      stdout: Buffer.from(''),
      stderr: Buffer.from('fatal: not a git repository'),
    });

    const failure = commandFailureFromExecError({
      tool: 'git',
      command: 'git branch --show-current',
      error,
    });

    expect(failure.exitCode).toBe(128);
    expect(failure.stderr).toContain('fatal: not a git repository');
    expect(isCommandFailure(failure)).toBe(true);
  });

  it('classifies spawn-style errors distinctly', () => {
    const error = Object.assign(new Error('spawnSync git EPERM'), {
      code: 'EPERM',
    });

    const failure = commandFailureFromExecError({
      tool: 'git',
      command: 'git branch --show-current',
      error,
    });

    expect(failure.kind).toBe('spawn_error');
    expect(failure.details).toEqual(expect.objectContaining({ code: 'EPERM' }));
    expect(failure.summary).toContain('spawn');
  });

  it('preserves timeout classification for ETIMEDOUT exec-style errors', () => {
    const error = Object.assign(new Error('CLI timeout after 1000ms'), {
      code: 'ETIMEDOUT',
      stderr: 'model output mentioned rate limit handling',
    });

    const failure = commandFailureFromExecError({
      tool: 'llm',
      provider: 'claude',
      command: 'claude',
      error,
      detectRateLimit: (text) => /rate limit/i.test(text),
      parseRetryAfterMs: () => 5_000,
    });

    expect(failure.kind).toBe('timeout');
    expect(failure.timedOut).toBe(true);
    expect(failure.rateLimited).toBe(false);
    expect(failure.retryAfterMs).toBeUndefined();
    expect(failure.details).toEqual(expect.objectContaining({ code: 'ETIMEDOUT' }));
  });
});
