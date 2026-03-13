import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type { MartinLoopConfig, IterationResult } from '../../../src/skills/cli-types.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';

const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

interface MockChildOpts {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  hang?: boolean;
}

function mockChild(opts: MockChildOpts): ChildProcess {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: null,
    kill: vi.fn(),
    pid: 12345,
  }) as unknown as ChildProcess;

  if (!opts.hang) {
    process.nextTick(() => {
      if (opts.stdout) (child.stdout as EventEmitter).emit('data', Buffer.from(opts.stdout));
      if (opts.stderr) (child.stderr as EventEmitter).emit('data', Buffer.from(opts.stderr));
      child.emit('close', opts.exitCode ?? 0);
    });
  }

  return child;
}

function queueMock(opts: MockChildOpts): void {
  mockSpawn.mockImplementationOnce(() => mockChild(opts));
}

function baseConfig(overrides?: Partial<MartinLoopConfig>): MartinLoopConfig {
  return {
    prompt: 'Implement feature X',
    promiseTag: 'IMPL_X_DONE',
    maxIterations: 3,
    maxTurns: 10,
    provider: 'claude',
    timeoutMs: 30_000,
    workingDir: '/tmp/test-project',
    ...overrides,
  };
}

describe('parseResetTime', () => {
  let parseResetTime: typeof import('../../../src/skills/martin-loop.js').parseResetTime;

  beforeEach(async () => {
    const mod = await import('../../../src/skills/martin-loop.js');
    parseResetTime = mod.parseResetTime;
  });

  it('parses retry-after header', () => {
    const result = parseResetTime('retry-after: 30', '');
    expect(result).toEqual({ sleepSeconds: 30, source: 'retry-after header' });
  });

  it('parses retry-after with hyphen variation', () => {
    const result = parseResetTime('Retry-After: 60', '');
    expect(result).toEqual({ sleepSeconds: 60, source: 'retry-after header' });
  });

  it('parses retry_after with underscore variation', () => {
    const result = parseResetTime('retry_after: 42', '');
    expect(result).toEqual({ sleepSeconds: 42, source: 'retry-after header' });
  });

  it('parses retryafter without separator', () => {
    const result = parseResetTime('retryafter: 18', '');
    expect(result).toEqual({ sleepSeconds: 18, source: 'retry-after header' });
  });

  it('parses "try again in N minutes"', () => {
    const result = parseResetTime('Please try again in 5 minutes', '');
    expect(result).toEqual({ sleepSeconds: 300, source: 'minutes pattern' });
  });

  it('parses "try again in N seconds"', () => {
    const result = parseResetTime('try again in 30 seconds', '');
    expect(result).toEqual({ sleepSeconds: 30, source: 'seconds pattern' });
  });

  it('parses ISO timestamp reset time', () => {
    const futureDate = new Date(Date.now() + 120_000).toISOString();
    const result = parseResetTime(`rate limit resets at ${futureDate}`, '');
    expect(result.source).toBe('reset-at timestamp');
    // Allow 1s variance due to timing
    expect(result.sleepSeconds).toBeGreaterThanOrEqual(118);
    expect(result.sleepSeconds).toBeLessThanOrEqual(121);
  });

  it('parses ISO timestamp from stdout', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const result = parseResetTime('', `rate limit resets at ${futureDate}`);
    expect(result.source).toBe('reset-at timestamp');
    expect(result.sleepSeconds).toBeGreaterThanOrEqual(58);
    expect(result.sleepSeconds).toBeLessThanOrEqual(61);
  });

  it('parses x-ratelimit-reset epoch (seconds)', () => {
    const futureEpochSecs = Math.floor((Date.now() + 90_000) / 1000);
    const result = parseResetTime(`x-ratelimit-reset: ${futureEpochSecs}`, '');
    expect(result.source).toBe('x-ratelimit-reset epoch');
    expect(result.sleepSeconds).toBeGreaterThanOrEqual(88);
    expect(result.sleepSeconds).toBeLessThanOrEqual(91);
  });

  it('parses x-ratelimit-reset epoch (milliseconds)', () => {
    const futureEpochMs = Date.now() + 60_000;
    const result = parseResetTime(`x-ratelimit-reset: ${futureEpochMs}`, '');
    expect(result.source).toBe('x-ratelimit-reset epoch');
    expect(result.sleepSeconds).toBeGreaterThanOrEqual(58);
    expect(result.sleepSeconds).toBeLessThanOrEqual(61);
  });

  it('parses "resets in Ns" pattern', () => {
    const result = parseResetTime('rate limit resets in 45s', '');
    expect(result).toEqual({ sleepSeconds: 45, source: 'resets-in pattern' });
  });

  it('parses "resets in Ns" from stdout', () => {
    const result = parseResetTime('', 'limit reset in 20s');
    expect(result).toEqual({ sleepSeconds: 20, source: 'resets-in pattern' });
  });

  it('parses "Please retry after Xs" pattern', () => {
    const result = parseResetTime('Please retry after 25s', '');
    expect(result).toEqual({ sleepSeconds: 25, source: 'retry-after header' });
  });

  it('returns { sleepSeconds: -1, source: "unknown" } for unparseable input', () => {
    const result = parseResetTime('some random error', 'some random output');
    expect(result).toEqual({ sleepSeconds: -1, source: 'unknown' });
  });

  it('returns unknown for empty strings', () => {
    const result = parseResetTime('', '');
    expect(result).toEqual({ sleepSeconds: -1, source: 'unknown' });
  });

  it('prefers retry-after over less specific patterns', () => {
    // retry-after appears first in matching order
    const result = parseResetTime('retry-after: 10\ntry again in 5 minutes', '');
    expect(result).toEqual({ sleepSeconds: 10, source: 'retry-after header' });
  });
});

describe('MartinLoop — Rate Limit Resilience', () => {
  let MartinLoop: typeof import('../../../src/skills/martin-loop.js').MartinLoop;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const mod = await import('../../../src/skills/martin-loop.js');
    MartinLoop = mod.MartinLoop;
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // ── Provider fallback ──

  it('switches to next provider on rate limit without counting iteration', async () => {
    // Claude rate-limited, then codex succeeds
    queueMock({ stderr: '429 Too Many Requests', exitCode: 1 });
    queueMock({ stdout: 'Codex did it!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
    // First call uses claude, second uses codex
    expect((mockSpawn.mock.calls[0] as unknown[])[0]).toBe('claude');
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');
  });

  it('treats "resets in Ns" errors as rate limits for provider fallback', async () => {
    queueMock({ stderr: 'request quota exceeded; resets in 9s', exitCode: 1 });
    queueMock({ stdout: 'Codex recovered\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');
  });

  it('treats x-ratelimit-reset header as rate limit for provider fallback', async () => {
    const futureEpochSecs = Math.floor((Date.now() + 60_000) / 1000);
    queueMock({ stderr: `x-ratelimit-reset: ${futureEpochSecs}`, exitCode: 1 });
    queueMock({ stdout: 'Codex recovered\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');
  });

  it('defaults providers to [claude, codex] when not specified', async () => {
    // Claude rate-limited, then codex succeeds
    queueMock({ stderr: 'rate limit exceeded', exitCode: 1 });
    queueMock({ stdout: 'Done!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ maxIterations: 1 }));

    expect(result.completed).toBe(true);
    // Second call should use codex (fallback)
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');
  });

  it('defaults providers to [claude, codex] when an empty providers list is passed', async () => {
    queueMock({ stderr: 'rate limit exceeded', exitCode: 1 });
    queueMock({ stdout: 'Done!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: [],
      _sleepFn: sleepFn,
    }));

    expect(result.completed).toBe(true);
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');
    expect(sleepFn).not.toHaveBeenCalled();
  });

  // ── Sleep when all providers exhausted ──

  it('sleeps when all providers are exhausted then resumes', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const onSleep = vi.fn();

    // Claude rate-limited with retry-after
    queueMock({ stderr: 'rate limit exceeded\nretry-after: 30', exitCode: 1 });
    // Codex also rate-limited with retry-after
    queueMock({ stderr: '429 Too Many Requests\nretry-after: 60', exitCode: 1 });
    // After sleep, claude succeeds
    queueMock({ stdout: 'Success!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onSleep,
      _sleepFn: sleepFn,
    }));

    expect(result.completed).toBe(true);
    // Should have slept with shortest reset time (30s from claude)
    expect(sleepFn).toHaveBeenCalledWith(30_000);
    expect(onSleep).toHaveBeenCalledWith(30_000, 'claude parseRetryAfter');
    // After sleep, resumes with original provider (claude)
    expect((mockSpawn.mock.calls[2] as unknown[])[0]).toBe('claude');
  });

  it('uses 120s fallback when no reset time is parseable', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const onSleep = vi.fn();
    const warnLogs: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnLogs.push(args.join(' ')); };

    // Both providers rate-limited with no parseable reset time
    queueMock({ stderr: 'rate limit exceeded', exitCode: 1 });
    queueMock({ stderr: '429 error', exitCode: 1 });
    // After sleep, claude succeeds
    queueMock({ stdout: 'ok!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onSleep,
      _sleepFn: sleepFn,
    }));

    // Should fallback to 120s
    expect(sleepFn).toHaveBeenCalledWith(120_000);
    expect(onSleep).toHaveBeenCalledWith(120_000, 'unknown');
    // Should have logged a warning
    expect(warnLogs.some(l => l.includes('could not be determined'))).toBe(true);

    console.warn = origWarn;
  });

  it('picks shortest sleep time when multiple providers have different reset times', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    // Claude: retry-after 120
    queueMock({ stderr: 'retry-after: 120', exitCode: 1 });
    // Codex: retry-after 30
    queueMock({ stderr: 'retry-after: 30', exitCode: 1 });
    // After sleep, claude succeeds
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      _sleepFn: sleepFn,
    }));

    // Shortest is 30s from codex
    expect(sleepFn).toHaveBeenCalledWith(30_000);
  });

  it('uses exact parsed sleep when shortest reset is 0 seconds', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const onSleep = vi.fn();

    queueMock({ stderr: 'retry-after: 0', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 5', exitCode: 1 });
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onSleep,
      _sleepFn: sleepFn,
    }));

    expect(result.completed).toBe(true);
    expect(sleepFn).toHaveBeenCalledWith(0);
    expect(onSleep).toHaveBeenCalledWith(0, 'claude parseRetryAfter');
  });

  // ── Exhausted state cleared after sleep ──

  it('clears exhausted providers after sleep and resumes with original provider', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    // First round: both rate-limited
    queueMock({ stderr: 'retry-after: 10', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 20', exitCode: 1 });
    // After sleep: claude succeeds on first iteration
    queueMock({ stdout: 'iter1 done', exitCode: 0 });
    // Second iteration: claude succeeds with promise
    queueMock({ stdout: 'done\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 2,
      providers: ['claude', 'codex'],
      _sleepFn: sleepFn,
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(2);
    // After sleep, should resume with claude (original provider = first in list)
    expect((mockSpawn.mock.calls[2] as unknown[])[0]).toBe('claude');
    expect((mockSpawn.mock.calls[3] as unknown[])[0]).toBe('claude');
  });

  // ── sleepMs in IterationResult ──

  it('reports sleepMs: 0 when no sleep occurred', async () => {
    const onIteration = vi.fn();
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({ onIteration }));

    const iterResult = (onIteration.mock.calls[0] as [number, IterationResult])[1];
    expect(iterResult.sleepMs).toBe(0);
  });

  it('reports sleepMs > 0 after a sleep event', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const onIteration = vi.fn();

    // Both rate-limited
    queueMock({ stderr: 'retry-after: 15', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 30', exitCode: 1 });
    // After sleep: success
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onIteration,
      _sleepFn: sleepFn,
    }));

    // The successful iteration after sleep should have sleepMs > 0
    const lastCall = onIteration.mock.calls[onIteration.mock.calls.length - 1] as [number, IterationResult];
    expect(lastCall[1].sleepMs).toBeGreaterThan(0);
  });

  // ── onSleep callback ──

  it('fires onSleep with duration in ms and source before sleeping', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const onSleep = vi.fn();

    queueMock({ stderr: 'retry-after: 45', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 90', exitCode: 1 });
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onSleep,
      _sleepFn: sleepFn,
    }));

    expect(onSleep).toHaveBeenCalledTimes(1);
    expect(onSleep).toHaveBeenCalledWith(45_000, 'claude parseRetryAfter');
    // onSleep must fire BEFORE sleepFn
    const onSleepOrder = onSleep.mock.invocationCallOrder[0];
    const sleepOrder = sleepFn.mock.invocationCallOrder[0];
    expect(onSleepOrder).toBeLessThan(sleepOrder);
  });

  // ── Backward compatibility ──

  it('keeps onRateLimit as notification callback (backward compat)', async () => {
    const onRateLimit = vi.fn().mockReturnValue(undefined);

    queueMock({ stderr: 'rate limit exceeded', exitCode: 1 });
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      onRateLimit,
    }));

    expect(result.completed).toBe(true);
    // onRateLimit is still called as notification
    expect(onRateLimit).toHaveBeenCalledWith('claude');
  });

  it('ignores onRateLimit return value for provider control', async () => {
    const onRateLimit = vi.fn().mockReturnValue('claude');

    queueMock({ stderr: 'rate limit exceeded', exitCode: 1 });
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onRateLimit,
    }));

    expect(result.completed).toBe(true);
    expect(onRateLimit).toHaveBeenCalledWith('claude');
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');
  });

  // ── Single-provider config ──

  it('single-provider rate limit → sleeps immediately (no fallback)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    queueMock({ stderr: 'retry-after: 20', exitCode: 1 });
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude'],
      _sleepFn: sleepFn,
    }));

    expect(result.completed).toBe(true);
    expect(sleepFn).toHaveBeenCalledWith(20_000);
  });

  // ── Failed iteration not counted ──

  it('does not count the rate-limited iteration (provider switch path)', async () => {
    queueMock({ stderr: 'rate limit', exitCode: 1 });
    queueMock({ stderr: 'rate limit', exitCode: 1 }); // codex also fails but NOT rate limited? No, this is rate limited
    // Wait... both rate-limited means sleep. Let me adjust:
    // Claude rate-limited → switch to codex → codex succeeds (no rate limit)
    // Need to re-think: first mock is claude (rate limited), second is codex (succeeds)
    // But I already queued 2 rate-limits. Let me rewrite:

    vi.resetAllMocks();
    // Claude rate-limited
    queueMock({ stderr: 'rate limit', exitCode: 1 });
    // Codex succeeds on iteration
    queueMock({ stdout: 'iter 1\nno promise', exitCode: 0 });
    // Back to claude for iteration 2 (maxIter is 2)
    queueMock({ stdout: 'iter 2\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 2,
      providers: ['claude', 'codex'],
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(mockSpawn).toHaveBeenCalledTimes(3); // 1 rate-limited + 2 real
  });

  // ── After sleep, iteration not counted ──

  it('does not count the sleep iteration (all-exhausted path)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    // Both rate-limited
    queueMock({ stderr: 'retry-after: 10', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 20', exitCode: 1 });
    // After sleep: success with promise
    queueMock({ stdout: 'done\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      _sleepFn: sleepFn,
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it('interrupts sleep when abort signal is triggered', async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();

    queueMock({ stderr: 'retry-after: 60', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 60', exitCode: 1 });

    const loop = new MartinLoop();
    const runPromise = loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      abortSignal: abortController.signal,
    }));

    await vi.advanceTimersByTimeAsync(0);
    abortController.abort();

    await expect(runPromise).rejects.toThrow(/abort/i);
    vi.useRealTimers();
  });

  it('clears pending default sleep timer when abort signal is triggered', async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();

    queueMock({ stderr: 'retry-after: 120', exitCode: 1 });
    queueMock({ stderr: 'retry-after: 120', exitCode: 1 });

    const loop = new MartinLoop();
    const runPromise = loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      abortSignal: abortController.signal,
    }));

    await vi.advanceTimersByTimeAsync(0);
    abortController.abort();

    await expect(runPromise).rejects.toThrow(/abort/i);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  // ── Timeout must NOT be confused with rate limiting ──

  it('does not treat timed-out iteration as rate-limited even when stdout contains rate-limit text', async () => {
    vi.useFakeTimers();

    // Create a child that emits rate-limit-related code output then hangs
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: null,
      kill: vi.fn(),
      pid: 12345,
    }) as unknown as ChildProcess;

    // Emit stdout with rate-limit text (simulates implementing rate limiting)
    process.nextTick(() => {
      (child.stdout as EventEmitter).emit('data', Buffer.from(
        'Adding rate_limit detection and 429 status handling\nif (status === 429) { retry(); }'
      ));
    });

    // SIGTERM triggers close with code 143
    (child.kill as ReturnType<typeof vi.fn>).mockImplementation((signal: string) => {
      if (signal === 'SIGTERM') {
        process.nextTick(() => child.emit('close', 143));
      }
      return true;
    });

    mockSpawn.mockImplementationOnce(() => child);
    // Second iteration succeeds
    queueMock({ stdout: 'done\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const onRateLimit = vi.fn();
    const onIteration = vi.fn();
    const loop = new MartinLoop();
    const runPromise = loop.run(baseConfig({
      maxIterations: 2,
      timeoutMs: 1_000,
      onRateLimit,
      onIteration,
    }));

    // Advance past timeout + close + second iteration
    await vi.advanceTimersByTimeAsync(13_100);
    const result = await runPromise;

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(2); // Both iterations counted (no retry)
    expect(onRateLimit).not.toHaveBeenCalled();

    const firstIter = (onIteration.mock.calls[0] as [number, IterationResult]);
    expect(firstIter[1].rateLimited).toBe(false);

    vi.useRealTimers();
  });

  it('falls back when the provider emits rate-limit details on stdout only', async () => {
    queueMock({
      stdout: 'rate limit exceeded\nretry-after: 6',
      stderr: '',
      exitCode: 1,
    });
    queueMock({
      stdout: 'fallback success\n<promise>IMPL_X_DONE</promise>',
      stderr: '',
      exitCode: 0,
    });

    const onRateLimit = vi.fn();
    const onIteration = vi.fn();
    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({
      maxIterations: 1,
      providers: ['claude', 'codex'],
      onRateLimit,
      onIteration,
    }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
    expect(onRateLimit).toHaveBeenCalledWith('claude');
    expect((mockSpawn.mock.calls[1] as unknown[])[0]).toBe('codex');

    const firstIter = (onIteration.mock.calls[0] as [number, IterationResult]);
    expect(firstIter[1].rateLimited).toBe(true);
  });
});
