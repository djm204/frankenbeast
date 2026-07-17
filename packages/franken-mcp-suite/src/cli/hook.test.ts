import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHook, type HookDeps } from './hook.js';

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
    process.exitCode = undefined;
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
      ok: true,
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
});
