import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type { MartinLoopConfig, IterationResult } from '../../../src/skills/cli-types.js';
import { ProviderRegistry } from '../../../src/skills/providers/index.js';
import type { ICliProvider } from '../../../src/skills/providers/index.js';

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

/** Create a mock ChildProcess that emits stdout/stderr then closes. */
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

/** Queue a lazy mock — child is created when spawn is called, not at setup time. */
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

describe('MartinLoop', () => {
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

  // ── 1. Successful promise detection ──

  it('detects promise tag in stdout and returns completed: true', async () => {
    queueMock({ stdout: 'Working on feature...\n<promise>IMPL_X_DONE</promise>\n', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig());

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.output).toContain('<promise>IMPL_X_DONE</promise>');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  // ── 2. Max iterations exhaustion ──

  it('returns completed: false when max iterations reached without promise', async () => {
    for (let i = 0; i < 3; i++) {
      queueMock({ stdout: `Iteration ${i} output without promise tag`, exitCode: 0 });
    }

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ maxIterations: 3 }));

    expect(result.completed).toBe(false);
    expect(result.iterations).toBe(3);
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  // ── 3. Timeout handling ──

  it('kills child with SIGTERM on timeout, then SIGKILL after 5s', async () => {
    vi.useFakeTimers();
    const onProviderTimeout = vi.fn();

    const hangingChild = mockChild({ hang: true });
    const killFn = hangingChild.kill as ReturnType<typeof vi.fn>;

    // Make SIGKILL trigger close so the promise resolves
    killFn.mockImplementation((signal: string) => {
      if (signal === 'SIGKILL') {
        process.nextTick(() => hangingChild.emit('close', null));
      }
      return true;
    });

    mockSpawn.mockImplementationOnce(() => hangingChild);
    // Second iteration returns promise so the loop finishes
    queueMock({ stdout: 'done\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const runPromise = loop.run(baseConfig({ maxIterations: 2, timeoutMs: 5_000, onProviderTimeout }));

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(5_001);
    expect(killFn).toHaveBeenCalledWith('SIGTERM');
    expect(onProviderTimeout).toHaveBeenCalledWith('claude', 5_000);

    // Advance past SIGKILL grace period
    await vi.advanceTimersByTimeAsync(5_001);
    expect(killFn).toHaveBeenCalledWith('SIGKILL');

    await runPromise;
    vi.useRealTimers();
  });

  it('does not hang if child never closes after SIGKILL (hard timeout fallback)', async () => {
    vi.useFakeTimers();

    const hangingChild = mockChild({ hang: true });
    mockSpawn.mockImplementationOnce(() => hangingChild);
    // Next iteration succeeds so loop can complete.
    queueMock({ stdout: 'done\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const runPromise = loop.run(baseConfig({ maxIterations: 2, timeoutMs: 1_000 }));

    // timeoutMs + 5s (SIGKILL) + 7s fallback buffer
    await vi.advanceTimersByTimeAsync(13_100);
    const result = await runPromise;

    expect(result.completed).toBe(true);
    expect((hangingChild.kill as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('SIGTERM');
    expect((hangingChild.kill as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });

  // ── 4. Provider switching — claude CLI args ──

  it('spawns correct CLI args for claude provider', async () => {
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({ provider: 'claude', command: '/usr/bin/claude' }));

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/claude',
      [
        '--print', '--dangerously-skip-permissions',
        '--output-format', 'stream-json',
        '--verbose',
        '--disable-slash-commands',
        '--no-session-persistence',
        '--plugin-dir', '/dev/null',
        '--max-turns', '10',
        '--', expect.stringContaining('Implement feature X'),
      ],
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: '/tmp/test-project',
      }),
    );
  });

  // ── 5. Provider switching — codex CLI args ──

  it('spawns correct CLI args for codex provider', async () => {
    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({ provider: 'codex', command: '/usr/bin/codex' }));

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/codex',
      ['exec', '--full-auto', '--json', '--color', 'never', expect.stringContaining('Implement feature X')],
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: '/tmp/test-project',
      }),
    );
  });

  it('normalizes codex JSON output to readable text and detects promise tag', async () => {
    queueMock({
      stdout: [
        '{"type":"event","content":[{"type":"output_text","text":"Implemented chunk 11"}]}',
        '{"type":"event","content":[{"type":"output_text","text":"<promise>IMPL_X_DONE</promise>"}]}',
      ].join('\n'),
      exitCode: 0,
    });

    const onIteration = vi.fn();
    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ provider: 'codex', onIteration }));

    expect(result.completed).toBe(true);
    expect(result.output).toContain('Implemented chunk 11');
    expect(result.output).toContain('<promise>IMPL_X_DONE</promise>');
    const firstIter = onIteration.mock.calls[0] as [number, IterationResult];
    expect(firstIter[1].stdout).toContain('Implemented chunk 11');
  });

  it('does not treat successful codex narrative text as rate limited', async () => {
    queueMock({
      stdout: [
        '{"type":"event","content":[{"type":"output_text","text":"Implementing rate limit resilience now"}]}',
        '{"type":"event","content":[{"type":"output_text","text":"<promise>IMPL_X_DONE</promise>"}]}',
      ].join('\n'),
      exitCode: 0,
    });

    const onIteration = vi.fn();
    const onRateLimit = vi.fn();
    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ provider: 'codex', onIteration, onRateLimit }));

    expect(result.completed).toBe(true);
    const firstIter = onIteration.mock.calls[0] as [number, IterationResult];
    expect(firstIter[1].rateLimited).toBe(false);
    expect(onRateLimit).not.toHaveBeenCalled();
  });

  it('preserves codex output when stdout is not JSON', async () => {
    queueMock({ stdout: 'plain codex text\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ provider: 'codex' }));

    expect(result.completed).toBe(true);
    expect(result.output).toContain('plain codex text');
  });

  // ── 6. Non-zero exit code — continues to next iteration ──

  it('continues iteration on non-zero exit code', async () => {
    queueMock({ stdout: 'Error output', exitCode: 1 });
    queueMock({ stdout: 'Success!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ maxIterations: 5 }));

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  // ── 7. Promise-without-changes rejection ──

  it('rejects promise when stdout has no meaningful content beyond the tag', async () => {
    queueMock({ stdout: '  <promise>IMPL_X_DONE</promise>  \n', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ maxIterations: 1 }));

    expect(result.completed).toBe(false);
    expect(result.iterations).toBe(1);
  });

  // ── 8. Rate-limited iterations don't count against maxIterations ──

  it('does not count rate-limited iterations against maxIterations', async () => {
    queueMock({ stderr: '429 Too Many Requests', exitCode: 1 });
    queueMock({ stdout: 'Done!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ maxIterations: 1 }));

    // maxIterations is 1, but the rate-limited iteration shouldn't count
    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(1);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  // ── 9. Provider fallback on rate limit via onRateLimit callback ──

  it('calls onRateLimit and switches provider on rate limit', async () => {
    const onRateLimit = vi.fn().mockReturnValue('codex');

    queueMock({ stderr: 'rate limit exceeded', exitCode: 1 });
    queueMock({ stdout: 'Codex did it!\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    const result = await loop.run(baseConfig({ maxIterations: 2, onRateLimit }));

    expect(onRateLimit).toHaveBeenCalledWith('claude');
    expect(result.completed).toBe(true);

    // Second call should use codex provider's command
    const secondCallArgs = mockSpawn.mock.calls[1] as unknown[];
    expect(secondCallArgs[0]).toBe('codex');
  });

  // ── 10. Strips CLAUDE* env vars for claude provider ──

  it('strips CLAUDE* env vars when spawning claude via provider filterEnv', async () => {
    process.env['CLAUDECODE'] = 'some-value';

    queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({ provider: 'claude' }));

    const spawnEnv = (mockSpawn.mock.calls[0] as unknown[])[2] as { env: Record<string, string> };
    expect(spawnEnv.env).not.toHaveProperty('CLAUDECODE');

    delete process.env['CLAUDECODE'];
  });

  // ── 11. Token estimation via provider ──

  it('estimates tokens via provider: /4 for claude, /16 for codex', async () => {
    const output = 'x'.repeat(160) + '\n<promise>IMPL_X_DONE</promise>';

    queueMock({ stdout: output, exitCode: 0 });
    const loop = new MartinLoop();
    const claudeResult = await loop.run(baseConfig({ provider: 'claude' }));
    expect(claudeResult.tokensUsed).toBe(Math.ceil(output.length / 4));

    queueMock({ stdout: output, exitCode: 0 });
    const codexResult = await loop.run(baseConfig({ provider: 'codex' }));
    expect(codexResult.tokensUsed).toBe(Math.ceil(output.length / 16));
  });

  // ── 12. onIteration callback ──

  it('calls onIteration callback for each iteration', async () => {
    const onIteration = vi.fn();

    queueMock({ stdout: 'first output', exitCode: 0 });
    queueMock({ stdout: 'second\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig({ maxIterations: 5, onIteration }));

    expect(onIteration).toHaveBeenCalledTimes(2);

    const firstCall = onIteration.mock.calls[0] as [number, IterationResult];
    expect(firstCall[0]).toBe(1);
    expect(firstCall[1].stdout).toBe('first output');
    expect(firstCall[1].promiseDetected).toBe(false);

    const secondCall = onIteration.mock.calls[1] as [number, IterationResult];
    expect(secondCall[0]).toBe(2);
    expect(secondCall[1].promiseDetected).toBe(true);
  });

  // ── 13. Rate limit pattern detection ──

  it('detects various rate limit patterns', async () => {
    const patterns = [
      '429 Too Many Requests',
      'rate limit exceeded',
      'too many requests',
      'temporarily unavailable',
      'overloaded',
    ];

    for (const pattern of patterns) {
      vi.resetAllMocks();
      queueMock({ stderr: pattern, exitCode: 1 });
      queueMock({ stdout: 'ok\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

      const loop = new MartinLoop();
      const result = await loop.run(baseConfig({ maxIterations: 1 }));
      expect(result.completed).toBe(true);
    }
  });

  // ── 14. Accepts custom provider via registry ──

  it('accepts custom provider via registry', async () => {
    const customProvider: ICliProvider = {
      name: 'custom',
      command: 'my-custom-agent',
      buildArgs: () => ['--auto'],
      normalizeOutput: (raw) => raw.trim(),
      estimateTokens: (text) => text.length,
      isRateLimited: () => false,
      parseRetryAfter: () => undefined,
      filterEnv: (env) => ({ ...env }),
      supportsStreamJson: () => false,
    };

    const registry = new ProviderRegistry();
    registry.register(customProvider);

    queueMock({ stdout: 'custom output\n<promise>IMPL_X_DONE</promise>', exitCode: 0 });

    const loop = new MartinLoop(registry);
    const result = await loop.run(baseConfig({ provider: 'custom' }));

    expect(result.completed).toBe(true);
    expect(result.output).toContain('custom output');
    expect(mockSpawn).toHaveBeenCalledWith(
      'my-custom-agent',
      ['--auto', expect.stringContaining('Implement feature X')],
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: '/tmp/test-project',
      }),
    );
    // Custom provider estimates tokens as text.length (not /4)
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  // ── No-commit constraint ──

  it('appends no-commit constraint to the prompt sent to the spawned CLI', async () => {
    queueMock({ stdout: 'Done\n<promise>IMPL_X_DONE</promise>\n', exitCode: 0 });

    const loop = new MartinLoop();
    await loop.run(baseConfig());

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const args = mockSpawn.mock.calls[0][1] as string[];
    // The prompt is the last argument (after '--' for stream-json providers)
    const promptArg = args[args.length - 1];
    expect(promptArg).toContain('Do NOT run git commit');
    expect(promptArg).toContain('git push');
    // Original prompt should still be present
    expect(promptArg).toContain('Implement feature X');
  });
});
