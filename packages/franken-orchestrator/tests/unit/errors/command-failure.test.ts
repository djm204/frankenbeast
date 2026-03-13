import { describe, it, expect } from 'vitest';
import {
  classifyCommandFailure,
  commandFailureFromExecError,
  isCommandFailure,
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
});
