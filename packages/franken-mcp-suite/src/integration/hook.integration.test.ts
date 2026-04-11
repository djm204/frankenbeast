import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHook } from '../cli/hook.js';

describe('fbeast-hook runtime', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('pre-tool hook blocks denied actions', async () => {
    const result = await runHookForTest(['pre-tool', 'rm -rf /tmp/nope'], {
      governorDecision: { decision: 'denied', reason: 'destructive' },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('destructive');
  });

  it('post-tool hook records observer events', async () => {
    const result = await runHookForTest(['post-tool', 'write_file', '{"ok":true}']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"logged":true');
  });
});

async function runHookForTest(
  argv: string[],
  options: {
    governorDecision?: { decision: string; reason: string };
  } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';

  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write);

  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write);

  process.exitCode = 0;

  await (runHook as unknown as (
    args: string[],
    deps: {
      governor: {
        check(input: { action: string; context: string }): Promise<{ decision: string; reason: string }>;
      };
      observer: {
        log(input: { event: string; metadata: string; sessionId: string }): Promise<unknown>;
      };
      sessionId(): string;
    },
  ) => Promise<void>)(argv, {
    governor: {
      check: vi.fn().mockResolvedValue(
        options.governorDecision ?? { decision: 'approved', reason: 'safe' },
      ),
    },
    observer: {
      log: vi.fn().mockResolvedValue({ id: 1, hash: 'abc123' }),
    },
    sessionId: () => 'sess-test',
  });

  return { exitCode: process.exitCode ?? 0, stdout, stderr };
}
