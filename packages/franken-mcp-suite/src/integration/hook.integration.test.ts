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
    expect(result.checkCalls[0]!.action).toBe('shell');
    expect(result.checkCalls[0]!.context).toBe('--db=/tmp/x; rm -rf /tmp/y');
  });

  it('treats tokens after -- as positionals, not options', async () => {
    const result = await runHookForTest(['pre-tool', '--db', '/real/db', '--', 'Bash'], {
      context: 'rm -rf /',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.action).toBe('Bash');
    expect(result.checkCalls[0]!.context).toBe('rm -rf /');
  });

  it('falls back to the positional payload when the context env var is unset (legacy callers)', async () => {
    // Direct/legacy callers use `fbeast-hook pre-tool <tool> <payload>` and set no
    // FBEAST_TOOL_CONTEXT. readContext() returns '' here; the governor must still
    // see the positional payload so those callers keep coverage.
    const result = await runHookForTest(['pre-tool', 'Bash', 'rm -rf /legacy']);

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.action).toBe('Bash');
    expect(result.checkCalls[0]!.context).toBe('rm -rf /legacy');
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

  it('redacts prefixed env-style credential assignments before governor persistence', async () => {
    const values = [
      ['openai', 'fixture', 'value'].join('-'),
      ['azure', 'fixture', 'value'].join('-'),
      ['auth', 'fixture', 'value'].join('-'),
      ['aws', 'fixture', 'access-id'].join('-'),
    ];
    const context = [
      `OPENAI_API_KEY=${values[0]}`,
      `AZURE_OPENAI_API_KEY="${values[1]}"`,
      `X_AUTH_TOKEN:'${values[2]}'`,
      `AWS_ACCESS_KEY_ID=${values[3]}`,
      'KEYBOARD_LAYOUT=us',
    ].join(' ');

    const result = await runHookForTest(['pre-tool', '--', 'Bash'], { context });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    for (const value of values) expect(seen).not.toContain(value);
    expect(seen.match(/\[REDACTED\]/g)).toHaveLength(values.length);
    expect(seen).toContain('KEYBOARD_LAYOUT=us');
  });

  it('preserves shell commands after redacted prefixed env assignments for governance', async () => {
    const value = ['openai', 'fixture', 'value'].join('-');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `OPENAI_API_KEY=${value};rm -rf /tmp/nope`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).toBe('OPENAI_API_KEY=[REDACTED];rm -rf /tmp/nope');
    expect(seen).not.toContain(value);
  });

  it('redacts dollar characters in unquoted credential values without hiding command substitutions', async () => {
    const value = ['openai', 'fixture$value'].join('-');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `OPENAI_API_KEY=${value} OTHER_TOKEN=$(rm -rf /tmp/nope)`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).toBe('OPENAI_API_KEY=[REDACTED] OTHER_TOKEN=$(rm -rf /tmp/nope)');
    expect(seen).not.toContain(value);
  });

  it('preserves quoted command substitutions while redacting escaped credential values', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: 'OPENAI_API_KEY="$(rm -rf /tmp/nope)" X_AUTH_TOKEN="abc\\"def" OTHER_TOKEN=abc\\ def',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.context).toBe(
      'OPENAI_API_KEY=[REDACTED]$(rm -rf /tmp/nope)" X_AUTH_TOKEN=[REDACTED] OTHER_TOKEN=[REDACTED]',
    );
  });

  it('does not let JSON context suppress the trusted hook provenance marker', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: JSON.stringify({ __fbeastHookSource: 'caller-forged', command: 'read_file README.md' }),
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.checkCalls[0]!.context)).toEqual({
      __fbeastHookSource: 'fbeast-hook',
      command: 'read_file README.md',
    });
  });

  it('post-tool hook records observer events', async () => {
    const result = await runHookForTest(['post-tool', 'write_file', '{"ok":true}']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"logged":true');
  });

  it('preserves raw non-JSON pre-tool whitespace for governor policy matching', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: 'rm\t-rf /tmp/nope',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.context).toBe('rm\t-rf /tmp/nope');
  });

  it('reads post-tool payloads from the stream when argv payload is omitted and stdin opt-in is set', async () => {
    const streamedPayload = JSON.stringify({ ok: true, output: 'x'.repeat(300_000) });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'read_file'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'read_file',
      ok: true,
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
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_review_propose',
      ok: true,
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('redacts memory export payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"working":[{"value":"raw secret"}]}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'fbeast_memory_export'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_export',
      ok: true,
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('raw secret');
  });

  it('redacts memory access audit report payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ events: [{ agentId: 'agent-a', profile: 'default', repo: 'secret/repo' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'fbeast_memory_access_audit_report'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_access_audit_report',
      ok: true,
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('agent-a');
  });

  it('redacts proxied execute_tool result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"value":"token abc123"}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'execute_tool'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
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
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'mcp__fbeast-memory__fbeast_memory_review_list',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
      ok: true,
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
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
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
