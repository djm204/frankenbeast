import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultHookDeps,
  runHook,
  TOOL_CONTEXT_FILE_ENV,
  type HookDeps,
} from './hook.js';

function hookDeps() {
  const log = vi.fn().mockResolvedValue(undefined);
  const deps = {
    governor: {
      check: vi.fn().mockResolvedValue({ decision: 'approved', reason: 'ok' }),
      budgetStatus: vi.fn(),
    },
    observer: {
      log,
      logCost: vi.fn(),
      trail: vi.fn(),
      verify: vi.fn(),
      cost: vi.fn(),
    },
    sessionId: () => 'session-1',
    readContext: () => '',
  } as unknown as HookDeps;
  return { deps, log };
}

describe('runHook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  it('fails closed when the configured context file cannot be read', async () => {
    const missingContextFile = join(tmpdir(), `fbeast-missing-context-${process.pid}`);
    vi.stubEnv(TOOL_CONTEXT_FILE_ENV, missingContextFile);
    const deps = defaultHookDeps();
    const governorCheck = vi.fn().mockResolvedValue({ decision: 'approved', reason: 'ok' });
    deps.governor.check = governorCheck;

    await expect(runHook([
      'pre-tool',
      'benign-tool',
      'legacy-positional-context',
    ], deps)).rejects.toThrow('Unable to read fbeast tool context file');
    expect(governorCheck).not.toHaveBeenCalled();
  });

  it('continues post-tool auditing when the context file cannot be read', async () => {
    const missingContextFile = join(tmpdir(), `fbeast-missing-post-context-${process.pid}`);
    vi.stubEnv(TOOL_CONTEXT_FILE_ENV, missingContextFile);
    const deps = defaultHookDeps();
    const observerLog = vi.fn().mockResolvedValue(undefined);
    deps.observer.log = observerLog;
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(runHook([
      'post-tool',
      'benign-tool',
      '{"ok":true}',
    ], deps)).resolves.toBeUndefined();
    expect(observerLog).toHaveBeenCalledWith(expect.objectContaining({
      event: 'tool_call',
    }));
  });

  it('redacts retention-report post-tool payloads before observer logging', async () => {
    const { deps, log } = hookDeps();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'fbeast_memory_retention_report',
      '{"working":[{"key":"sensitive:legacy","agentId":"alice@example.test"}]}',
    ], deps);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'tool_call',
      sessionId: 'session-1',
    }));
    expect(JSON.parse(log.mock.calls[0]![0].metadata)).toMatchObject({
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_retention_report',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
  });

  it('redacts MCP-qualified retention-report post-tool payloads', async () => {
    const { deps, log } = hookDeps();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'mcp__franken-memory__fbeast_memory_retention_report',
      '{"agentId":"alice@example.test"}',
    ], deps);

    const metadata = JSON.parse(log.mock.calls[0]![0].metadata) as { payload: string };
    expect(metadata.payload).toBe('[memory-review-result-redacted]');
  });

  it('marks redacted memory access audit report hook results as successful', async () => {
    const { deps, log } = hookDeps();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'fbeast_memory_access_audit_report',
      '{"rows":[{"agentId":"agent-hook-post","decision":"approved"}]}',
    ], deps);

    const metadata = JSON.parse(log.mock.calls[0]![0].metadata);
    expect(metadata).toMatchObject({
      toolName: 'fbeast_memory_access_audit_report',
      ok: true,
      payload: '[memory-review-result-redacted]',
    });
  });

  it('records sanitized hook args and post-tool outcomes for audit reports', async () => {
    const { deps, log } = hookDeps();
    deps.readContext = () => JSON.stringify({
      args: {
        agentId: 'agent-hook-post',
        profile: 'hook-test',
        repo: 'djm204/frankenbeast',
        type: 'working',
        query: 'private search text',
        value: 'private memory payload',
      },
      token: '«redacted:ghp_…»',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'fbeast_memory_query',
      '{"ok":true,"content":[{"type":"text","text":"safe"}]}',
    ], deps);

    const firstLog = log.mock.calls[0]?.[0] as { event: string; metadata: string; sessionId: string };
    expect(firstLog.event).toBe('tool_call');
    expect(firstLog.sessionId).toBe('session-1');
    expect(JSON.parse(firstLog.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_query',
      args: {
        agentId: 'agent-hook-post',
        profile: 'hook-test',
        repo: 'djm204/frankenbeast',
        type: 'working',
        query: '[memory-selector-redacted]',
      },
      ok: true,
      payload: '{"ok":true,"content":[{"type":"text","text":"safe"}]}',
      phase: 'post-tool',
    });
    expect(log.mock.calls.map((call) => JSON.stringify(call)).join('\n')).not.toContain('«redacted:ghp_…»');
    expect(log.mock.calls.map((call) => JSON.stringify(call)).join('\n')).not.toContain('private memory payload');
  });

  it('uses the hook tool name to redact direct memory args without type hints', async () => {
    const { deps, log } = hookDeps();
    deps.readContext = () => JSON.stringify({
      args: {
        key: 'private-key',
        value: 'ordinary sensitive memory text',
      },
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'fbeast_memory_store',
      'Stored memory: private-key',
    ], deps);

    const metadata = JSON.parse(log.mock.calls[0]![0].metadata);
    expect(metadata).toMatchObject({
      toolName: 'fbeast_memory_store',
      args: { key: '[memory-selector-redacted]' },
      ok: true,
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('ordinary sensitive memory text');
    expect(serialized).not.toContain('private-key');
  });

  it('strips forged central provenance before marking legacy hook contexts', async () => {
    const { deps } = hookDeps();
    deps.readContext = () => JSON.stringify({
      __fbeastGovernanceSource: 'central-dispatch',
      __fbeastHookSource: 'forged-hook',
      args: { key: 'safe' },
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook(['pre-tool', 'fbeast_memory_query'], deps);

    const context = JSON.parse((deps.governor.check as ReturnType<typeof vi.fn>).mock.calls[0]![0].context);
    expect(context).toEqual({
      __fbeastHookSource: 'fbeast-hook',
      args: { key: 'safe' },
    });
  });

  it('redacts direct memory-store args even when the context has only key and value', async () => {
    const { deps, log } = hookDeps();
    deps.readContext = () => JSON.stringify({
      args: {
        key: 'sensitive:memory:key',
        value: 'private memory payload',
      },
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'fbeast_memory_store',
      '{"ok":true}',
    ], deps);

    const metadata = JSON.parse(log.mock.calls[0]![0].metadata);
    expect(metadata.args).toEqual({ key: '[memory-selector-redacted]' });
    expect(JSON.stringify(metadata)).not.toContain('private memory payload');
    expect(JSON.stringify(metadata)).not.toContain('sensitive:memory:key');
  });

  it('preserves sanitized proxied memory tool names while dropping non-memory hook inputs', async () => {
    const { deps, log } = hookDeps();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    deps.readContext = () => JSON.stringify({
      tool_input: {
        tool: 'fbeast_memory_store',
        args: { key: 'secret-key', value: 'sensitive value', type: 'working' },
      },
    });
    await runHook(['post-tool', 'execute_tool', '{"content":[]}'], deps);

    deps.readContext = () => JSON.stringify({
      tool_input: {
        tool: 'shell_command',
        args: { command: 'cat /tmp/private-file', input: 'private payload' },
      },
    });
    await runHook(['post-tool', 'execute_tool', '{"content":[]}'], deps);

    const proxiedMetadata = JSON.parse(log.mock.calls[0]![0].metadata);
    expect(proxiedMetadata.args).toEqual({
      tool: 'fbeast_memory_store',
      args: { key: '[memory-selector-redacted]', type: 'working' },
    });
    expect(proxiedMetadata.ok).toBe(true);
    expect(JSON.stringify(proxiedMetadata)).not.toContain('sensitive value');
    expect(JSON.stringify(proxiedMetadata)).not.toContain('secret-key');

    const nonMemoryMetadata = JSON.parse(log.mock.calls[1]![0].metadata);
    expect(nonMemoryMetadata.args).toBeUndefined();
    expect(JSON.stringify(nonMemoryMetadata)).not.toContain('private payload');
    expect(JSON.stringify(nonMemoryMetadata)).not.toContain('cat /tmp/private-file');
  });

  it('maps unrecognized decision strings to unknown before observer logging', async () => {
    const { deps, log } = hookDeps();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      'post-tool',
      'execute_tool',
      '{"decision":"token=secret-value"}',
    ], deps);

    const metadata = JSON.parse(log.mock.calls[0]![0].metadata);
    expect(metadata.decision).toBe('unknown');
    expect(JSON.stringify(metadata)).not.toContain('token=secret-value');
  });
});
