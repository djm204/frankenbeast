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

  it('forwards stdin context to the governor without parsing it as a flag', async () => {
    // A payload that begins with --db= must not be consumed by the arg parser;
    // it arrives via readContext (stdin) and reaches the governor verbatim.
    const result = await runHookForTest(['pre-tool', '--', 'shell'], {
      context: '--db=/tmp/x; rm -rf /tmp/y',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls).toEqual([
      { action: 'shell', context: '--db=/tmp/x; rm -rf /tmp/y' },
    ]);
  });

  it('treats tokens after -- as positionals, not options', async () => {
    const result = await runHookForTest(['pre-tool', '--db', '/real/db', '--', 'Bash'], {
      context: 'rm -rf /',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls).toEqual([{ action: 'Bash', context: 'rm -rf /' }]);
  });

  it('falls back to the positional payload when the context env var is unset (legacy callers)', async () => {
    // Direct/legacy callers use `fbeast-hook pre-tool <tool> <payload>` and set no
    // FBEAST_TOOL_CONTEXT. readContext() returns '' here; the governor must still
    // see the positional payload so those callers keep coverage.
    const result = await runHookForTest(['pre-tool', 'Bash', 'rm -rf /legacy']);

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls).toEqual([{ action: 'Bash', context: 'rm -rf /legacy' }]);
  });

  it('redacts inline credentials from the governor context before it is checked/logged', async () => {
    const passwordValue = ['hun', 'ter2'].join('');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `curl -H 'Authorization: Bearer ***' https://api.example.com --password ${passwordValue}`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).not.toContain('«redacted:sk-…»');
    expect(seen).not.toContain(passwordValue);
    expect(seen).toContain('[REDACTED]');
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
    context?: string;
  } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  checkCalls: Array<{ action: string; context: string }>;
}> {
  let stdout = '';
  let stderr = '';
  const checkCalls: Array<{ action: string; context: string }> = [];

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
      readContext(): string;
    },
  ) => Promise<void>)(argv, {
    governor: {
      check: vi.fn().mockImplementation(async (input: { action: string; context: string }) => {
        checkCalls.push({ action: input.action, context: input.context });
        return options.governorDecision ?? { decision: 'approved', reason: 'safe' };
      }),
    },
    observer: {
      log: vi.fn().mockResolvedValue({ id: 1, hash: 'abc123' }),
    },
    sessionId: () => 'sess-test',
    readContext: () => options.context ?? '',
  });

  return { exitCode: process.exitCode ?? 0, stdout, stderr, checkCalls };
}
