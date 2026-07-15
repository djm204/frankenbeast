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
    const bearerValue = ['bearer', 'fixture', 'value'].join('-');
    const passwordValue = ['hun', 'ter2'].join('');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `curl -H 'Authorization: Bearer ${bearerValue}' https://api.example.com --password ${passwordValue}`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).not.toContain(bearerValue);
    expect(seen).not.toContain(passwordValue);
    expect(seen).toContain('[REDACTED]');
  });

  it('post-tool hook records observer events', async () => {
    const result = await runHookForTest(['post-tool', 'write_file', '{"ok":true}']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"logged":true');
  });

  it('reads post-tool payloads from the stream when argv payload is omitted and stdin opt-in is set', async () => {
    const streamedPayload = JSON.stringify({ ok: true, output: 'x'.repeat(300_000) });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'read_file'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      toolName: 'read_file',
      payload: streamedPayload,
      phase: 'post-tool',
    });
  });

  it('redacts memory review result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ id: 'memcand_1', key: 'secret', value: 'token abc123' });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'fbeast_memory_review_propose'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      toolName: 'fbeast_memory_review_propose',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('redacts proxied execute_tool result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"value":"token abc123"}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'execute_tool'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      toolName: 'execute_tool',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('redacts MCP-qualified memory review result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"value":"token abc123"}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'mcp__fbeast-memory__fbeast_memory_review_list'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      toolName: 'mcp__fbeast-memory__fbeast_memory_review_list',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('preserves empty payload behavior for legacy post-tool callers that omit stdin opt-in', async () => {
    const result = await runHookForTest(['post-tool', '--', 'read_file'], {
      streamedPayload: JSON.stringify({ shouldNotBeRead: true }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      toolName: 'read_file',
      payload: '',
      phase: 'post-tool',
    });
  });
});

async function runHookForTest(
  argv: string[],
  options: {
    governorDecision?: { decision: string; reason: string };
    context?: string;
    streamedPayload?: string;
  } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  checkCalls: Array<{ action: string; context: string }>;
  observerLogs: Array<{ event: string; metadata: string; sessionId: string }>;
}> {
  let stdout = '';
  let stderr = '';
  const checkCalls: Array<{ action: string; context: string }> = [];
  const observerLogs: Array<{ event: string; metadata: string; sessionId: string }> = [];

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
      readPostToolPayload?(): Promise<string>;
    },
  ) => Promise<void>)(argv, {
    governor: {
      check: vi.fn().mockImplementation(async (input: { action: string; context: string }) => {
        checkCalls.push({ action: input.action, context: input.context });
        return options.governorDecision ?? { decision: 'approved', reason: 'safe' };
      }),
    },
    observer: {
      log: vi.fn().mockImplementation(async (input: { event: string; metadata: string; sessionId: string }) => {
        observerLogs.push(input);
        return { id: 1, hash: 'abc123' };
      }),
    },
    sessionId: () => 'sess-test',
    readContext: () => options.context ?? '',
    readPostToolPayload: async () => options.streamedPayload ?? '',
  });

  return { exitCode: process.exitCode ?? 0, stdout, stderr, checkCalls, observerLogs };
}
