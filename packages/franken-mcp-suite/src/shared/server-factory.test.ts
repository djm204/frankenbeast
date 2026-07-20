import { describe, it, expect, vi } from 'vitest';
import { createMcpServer, sanitizeRejectedToolArgumentsForAudit, sanitizeToolArgumentsForAuditTrail, summarizeProxyToolArgumentsForAudit, validateToolArguments, type ToolDef, type GovernanceGate, type AuditSink } from './server-factory.js';

describe('createMcpServer', () => {
  it('creates server with name and version', () => {
    const server = createMcpServer('fbeast-memory', '0.1.0', []);
    expect(server).toBeDefined();
    expect(server.name).toBe('fbeast-memory');
  });

  it('summarizes proxy arguments without retaining values, oversized keys, or value fingerprints', () => {
    const first = summarizeProxyToolArgumentsForAudit({
      query: 'alpha',
      items: Array.from({ length: 100_000 }, () => 'first-private-value'),
      [`private-${'x'.repeat(100)}`]: 'hidden-first',
    });
    const second = summarizeProxyToolArgumentsForAudit({
      query: 'bravo',
      items: Array.from({ length: 100_000 }, () => 'other-private-value'),
      [`private-${'y'.repeat(100)}`]: 'hidden-other',
    });

    expect(first.sha256).toBe(second.sha256);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('alpha');
    expect(serialized).not.toContain('hidden-first');
    expect(serialized).not.toContain('x'.repeat(100));
    expect(serialized.length).toBeLessThan(1_000);
  });

  it('preserves only bounded audit selectors for proxied memory tools', () => {
    const summarized = summarizeProxyToolArgumentsForAudit({
      agentId: 'agent-7',
      profile: 'doctor',
      repo: '/srv/frankenbeast',
      query: 'private search text',
    }, 'fbeast_memory_query');
    const oversized = summarizeProxyToolArgumentsForAudit({ agentId: 'a'.repeat(257) }, 'fbeast_memory_query');
    const unknownTool = summarizeProxyToolArgumentsForAudit({ agentId: 'attacker-value' }, 'fbeast_memory_fake');

    expect(summarized).toMatchObject({
      agentId: 'agent-7',
      profile: 'doctor',
      repo: '/srv/frankenbeast',
      redacted: true,
    });
    expect(JSON.stringify(summarized)).not.toContain('private search text');
    expect(oversized.agentId).toBe('[redacted-selector]');
    expect(unknownTool).not.toHaveProperty('agentId');
    expect(JSON.stringify(unknownTool)).not.toContain('attacker-value');
  });

  it('finds execute_tool discriminators without depending on property order', () => {
    const args: Record<string, unknown> = { args: { password: 'private-value' } };
    for (let index = 0; index < 60; index += 1) args[`filler${index}`] = index;
    args.tool = 'test_tool';

    const sanitized = sanitizeToolArgumentsForAuditTrail('execute_tool', args);
    expect(sanitized).toMatchObject({
      tool: 'test_tool',
      args: { redacted: true, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      envelope: {
        redacted: true,
        summary: {
          type: 'object',
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'args' }),
            expect.objectContaining({ name: 'filler0' }),
          ]),
          truncated: true,
        },
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('private-value');
  });

  it('keeps bounded malformed execute_tool envelope fields in audit summaries', () => {
    const sanitized = sanitizeToolArgumentsForAuditTrail('execute_tool', {
      tool: 'test_tool',
      args: { query: 'private-value' },
      unexpected: 'attacker-value',
    });

    expect(sanitized.envelope).toMatchObject({
      redacted: true,
      summary: {
        type: 'object',
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'tool' }),
          expect.objectContaining({ name: 'args' }),
          expect.objectContaining({ name: 'unexpected' }),
        ]),
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('attacker-value');
    expect(JSON.stringify(sanitized)).not.toContain('private-value');
  });

  it('runs close lifecycle callbacks exactly once', async () => {
    const onClose = vi.fn();
    const auditClose = vi.fn();
    const server = createMcpServer('fbeast-memory', '0.1.0', [], {
      onClose,
      audit: { record: vi.fn(), close: auditClose },
    });

    await server.close();
    await server.close();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auditClose).toHaveBeenCalledTimes(1);
  });

  it('registers tools from definitions', () => {
    const tools: ToolDef[] = [
      {
        name: 'fbeast_memory_query',
        description: 'Query memory entries',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
        handler: async (args: Record<string, unknown>) => ({
          content: [{ type: 'text' as const, text: `results for ${args['query']}` }],
        }),
      },
    ];

    const server = createMcpServer('fbeast-memory', '0.1.0', tools);
    expect(server.tools).toHaveLength(1);
    expect(server.tools[0]!.name).toBe('fbeast_memory_query');
  });

  function makeServerWithSpy() {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'echo',
      description: 'echo',
      inputSchema: { type: 'object', properties: { msg: { type: 'string', description: 'm' } }, required: ['msg'] },
      handler: async (args) => { calls.push(args); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    const callTool = (name: string, args: unknown) => srv.callTool(name, args);
    return { srv, calls, tool, callTool };
  }

  it('rejects missing required property without calling the handler', async () => {
    const { calls, callTool } = makeServerWithSpy();
    const res = await callTool('echo', {});
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects wrong property type', async () => {
    const { calls, callTool } = makeServerWithSpy();
    const res = await callTool('echo', { msg: 123 });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown extra property', async () => {
    const { calls, callTool } = makeServerWithSpy();
    const res = await callTool('echo', { msg: 'hi', extra: 1 });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('passes a valid argument object through to the handler', async () => {
    const { calls, callTool } = makeServerWithSpy();
    const res = await callTool('echo', { msg: 'hi' });
    expect(res.isError).toBeFalsy();
    expect(calls).toEqual([{ msg: 'hi' }]);
  });

  it('returns a stable public error without leaking thrown handler details', async () => {
    const sensitiveDetail = '/srv/private/config.json?token=' + 'example-secret-value';
    const tool: ToolDef = {
      name: 'failing_tool',
      description: 'fails internally',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => { throw new Error(`provider failed while reading ${sensitiveDetail}`); },
    };
    const server = createMcpServer('t', '1', [tool]);

    const result = await server.callTool('failing_tool', {});

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: Tool execution failed [MCP_TOOL_HANDLER_ERROR]' }],
      isError: true,
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveDetail);
  });

  it('bounds hanging handlers with a structured timeout and abort signal', async () => {
    let receivedSignal: AbortSignal | undefined;
    const auditEvents: Parameters<AuditSink['record']>[0][] = [];
    const tool: ToolDef = {
      name: 'hanging_tool',
      description: 'hangs until cancelled',
      inputSchema: { type: 'object', properties: {} },
      handler: async (_args, context) => {
        receivedSignal = context!.signal;
        await new Promise<void>(() => undefined);
        return { content: [{ type: 'text' as const, text: 'unreachable' }] };
      },
    };
    const server = createMcpServer('t', '1', [tool], {
      defaultToolTimeoutMs: 10,
      audit: { record: async (event) => { auditEvents.push(event); } },
    });

    const result = await server.callTool('hanging_tool', {});

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: Tool execution timed out after 10ms [MCP_TOOL_TIMEOUT]' }],
      isError: true,
    });
    expect(receivedSignal?.aborted).toBe(true);
    expect(auditEvents).toEqual([
      expect.objectContaining({ tool: 'hanging_tool', ok: false, decision: 'timeout' }),
    ]);
  });

  it('reports synchronous work that finishes after its deadline as timed out', async () => {
    let receivedSignal: AbortSignal | undefined;
    const server = createMcpServer('test', '1.0.0', [
      {
        name: 'blocking',
        description: 'Blocks before resolving',
        timeoutMs: 5,
        inputSchema: { type: 'object', properties: {} },
        async handler(_args, context) {
          receivedSignal = context!.signal;
          const stopAt = Date.now() + 15;
          while (Date.now() < stopAt) {
            // Model an existing synchronous filesystem/CPU handler.
          }
          return { content: [{ type: 'text', text: 'late success' }] };
        },
      },
    ]);

    const result = await server.callTool('blocking', {});

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: Tool execution timed out after 5ms [MCP_TOOL_TIMEOUT]' }],
      isError: true,
    });
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('honors a per-tool timeout override while preserving nominal results', async () => {
    const tool: ToolDef = {
      name: 'slow_tool',
      description: 'finishes within its override',
      inputSchema: { type: 'object', properties: {} },
      timeoutMs: 100,
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { content: [{ type: 'text' as const, text: 'ok' }] };
      },
    };
    const server = createMcpServer('t', '1', [tool], { defaultToolTimeoutMs: 5 });

    await expect(server.callTool('slow_tool', {})).resolves.toEqual({
      content: [{ type: 'text', text: 'ok' }],
    });
  });

  it('rejects invalid timeout configuration before serving requests', () => {
    expect(() => createMcpServer('t', '1', [], { defaultToolTimeoutMs: 0 })).toThrow(/defaultToolTimeoutMs/);
    expect(() => createMcpServer('t', '1', [{
      name: 'bad_timeout',
      description: 'invalid timeout',
      inputSchema: { type: 'object', properties: {} },
      timeoutMs: Number.POSITIVE_INFINITY,
      handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
    }])).toThrow(/timeoutMs/);
  });

  it('requires an OWN required property (rejects prototype-chain keys)', async () => {
    const { calls, callTool } = makeServerWithSpy();
    const res = await callTool('echo', Object.create({ msg: 'x' }));
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects explicit null wire arguments but defaults absent args to {}', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'noargs',
      description: 'noargs',
      inputSchema: { type: 'object', properties: {} },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    const nullRes = await srv.callTool('noargs', null);
    expect(nullRes.isError).toBe(true);
    expect(calls).toHaveLength(0);
    const absentRes = await srv.callTool('noargs', undefined);
    expect(absentRes.isError).toBeFalsy();
    expect(calls).toEqual([{}]);
  });

  it('rejects null for an object-typed property (typeof null === "object")', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'cfg',
      description: 'cfg',
      inputSchema: { type: 'object', properties: { args: { type: 'object', description: 'a' } }, required: ['args'] },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    const res = await srv.callTool('cfg', { args: null });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects denied argument-shape keys before invoking handlers', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'cfg',
      description: 'cfg',
      inputSchema: { type: 'object', properties: { args: { type: 'object', description: 'a' } }, required: ['args'] },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);

    const res = await srv.callTool('cfg', { args: { safe: 'ok', constructor: { prototype: { polluted: true } } } });

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('rejected unsafe argument shape');
    expect(res.content[0]!.text).toContain('denied property name: constructor');
    expect(res.content[0]!.text).not.toContain('polluted');
    expect(calls).toHaveLength(0);
  });

  it('rejects accessor, array, and non-plain object argument shapes without reading attacker-controlled values', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'cfg',
      description: 'cfg',
      inputSchema: { type: 'object', properties: { args: { type: 'object', description: 'a' } }, required: ['args'] },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    const accessorPayload: Record<string, unknown> = {};
    Object.defineProperty(accessorPayload, 'secret', {
      enumerable: true,
      get() {
        throw new Error('getter should not run');
      },
    });
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, '0', {
      enumerable: true,
      get() {
        throw new Error('array getter should not run');
      },
    });
    Object.defineProperty(accessorArray, 'constructor', { enumerable: true, value: {} });
    const taggedObject = Object.create(Date.prototype) as Record<PropertyKey, unknown>;
    Object.defineProperty(taggedObject, Symbol.toStringTag, {
      get() {
        throw new Error('toStringTag should not run');
      },
    });

    const accessorRes = await srv.callTool('cfg', { args: accessorPayload });
    const arrayRes = await srv.callTool('cfg', { args: { nested: accessorArray } });
    const dateRes = await srv.callTool('cfg', { args: new Date('2026-07-12T00:00:00Z') });
    const taggedRes = await srv.callTool('cfg', { args: taggedObject });

    expect(accessorRes.isError).toBe(true);
    expect(accessorRes.content[0]!.text).toContain('must be a data property');
    expect(arrayRes.isError).toBe(true);
    expect(arrayRes.content[0]!.text).toContain('must be a data property');
    expect(dateRes.isError).toBe(true);
    expect(dateRes.content[0]!.text).toContain('must be a plain JSON object');
    expect(taggedRes.isError).toBe(true);
    expect(taggedRes.content[0]!.text).toContain('must be a plain JSON object');
    expect(calls).toHaveLength(0);
  });

  it('depth-limits unsafe shape validation before primitive schema checks can overflow the stack', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'scan',
      description: 'scan',
      inputSchema: { type: 'object', properties: { input: { type: 'string', description: 'input' } }, required: ['input'] },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    let nested: Record<string, unknown> = { leaf: 'x' };
    for (let i = 0; i < 80; i += 1) nested = { child: nested };

    const res = await srv.callTool('scan', { input: nested });

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('exceeds maximum nesting depth');
    expect(calls).toHaveLength(0);
  });

  it('sanitizes unsafe rejected payloads before audit sinks serialize them', async () => {
    const recorded: Array<{ tool: string; ok: boolean; decision?: string; args?: unknown }> = [];
    const audit: AuditSink = { record: async (e) => { recorded.push(e); JSON.stringify(e.args); } };
    const tool: ToolDef = {
      name: 'cfg',
      description: 'cfg',
      inputSchema: { type: 'object', properties: { args: { type: 'object', description: 'a' } }, required: ['args'] },
      handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
    };
    const srv = createMcpServer('t', '1', [tool], { audit });
    const accessorPayload: Record<string, unknown> = {};
    Object.defineProperty(accessorPayload, 'secret', {
      enumerable: true,
      get() {
        throw new Error('getter should not run');
      },
    });
    const nonJsonPayload = { toJSON: () => { throw new Error('toJSON should not run'); } };

    const accessorRes = await srv.callTool('cfg', { args: accessorPayload });
    const nonJsonRes = await srv.callTool('cfg', { args: nonJsonPayload });

    expect(accessorRes.isError).toBe(true);
    expect(nonJsonRes.isError).toBe(true);
    expect(recorded).toEqual([
      { tool: 'cfg', ok: false, decision: 'validation_error', args: { args: { secret: '[accessor]' } } },
      { tool: 'cfg', ok: false, decision: 'validation_error', args: { args: { toJSON: '[non-json-value]' } } },
    ]);
  });

  it('redacts memory store values from direct and proxy audit records', () => {
    expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_store', {
      key: 'OPENAI_API_KEY',
      value: 'example value that must not be echoed',
      type: 'working',
      agentId: 'worker-alpha',
    })).toEqual({
      key: 'OPENAI_API_KEY',
      value: '[memory-store-value-redacted]',
      type: 'working',
      agentId: 'worker-alpha',
    });

    expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
      tool: 'fbeast_memory_store',
      args: {
        key: 'OPENAI_API_KEY',
        value: 'example value that must not be echoed',
        type: 'working',
      },
      context: 'contains value',
    })).toEqual({
      tool: 'fbeast_memory_store',
      args: {
        key: 'OPENAI_API_KEY',
        value: '[memory-store-value-redacted]',
        type: 'working',
      },
      context: '[memory-store-value-redacted]',
    });
  });

  it('redacts observer metadata from direct and proxy audit records', () => {
    expect(sanitizeToolArgumentsForAuditTrail('fbeast_observer_log', {
      event: 'tool_call',
      metadata: 'x'.repeat(1_000_001),
      sessionId: 'session-1',
    })).toEqual({
      event: 'tool_call',
      metadata: '[observer-metadata-redacted]',
      sessionId: 'session-1',
    });

    expect(sanitizeToolArgumentsForAuditTrail('fbeast_observer_log', {
      event: 'tool_call',
      metadata: 'x'.repeat(1_000_001),
      sessionId: 'session-1',
      tool: 'untrusted-payload-name',
    })).toEqual({
      event: 'tool_call',
      metadata: '[observer-metadata-redacted]',
      sessionId: 'session-1',
      tool: '[observer-metadata-redacted]',
    });

    const observerTool: ToolDef = {
      name: 'fbeast_observer_log',
      description: 'observer log',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [] }),
    };
    expect(sanitizeRejectedToolArgumentsForAudit(
      observerTool,
      'SECRET_OBSERVER_METADATA',
    )).toEqual({ invalid: '[observer-metadata-redacted]' });

    expect(sanitizeToolArgumentsForAuditTrail('fbeast_observer_log', {
      invalid: 'SECRET_OBSERVER_METADATA',
      sessionId: 'secret-session-id',
    })).toEqual({
      invalid: '[observer-metadata-redacted]',
      sessionId: '[observer-metadata-redacted]',
    });

    expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
      tool: 'fbeast_observer_log',
      args: {
        event: 'tool_call',
        metadata: 'x'.repeat(1_000_001),
        sessionId: 'session-1',
      },
    })).toEqual({
      tool: 'fbeast_observer_log',
      args: {
        event: 'tool_call',
        metadata: '[observer-metadata-redacted]',
        sessionId: 'session-1',
      },
    });

    expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
      tool: 'fbeast_observer_log',
      args: 'invalid envelope',
      metadata: 'x'.repeat(1_000_001),
    })).toEqual({
      tool: 'fbeast_observer_log',
      args: '[observer-metadata-redacted]',
      metadata: '[observer-metadata-redacted]',
    });

    expect(sanitizeToolArgumentsForAuditTrail('fbeast_governor_check', {
      action: 'fbeast_observer_log',
      context: {
        event: 'tool_call',
        metadata: 'x'.repeat(1_000_001),
      },
    })).toEqual({
      action: 'fbeast_observer_log',
      context: {
        event: 'tool_call',
        metadata: '[observer-metadata-redacted]',
      },
    });
  });

  it('redacts memory access audit report rejected selectors from direct and proxy audit records', () => {
    expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_access_audit_report', {
      operation: 'delete',
      tool: 'fbeast_memory_store',
      agentId: { token: 'SECRET_TOKEN_SHOULD_NOT_LEAK' },
      decision: { secret: 'SECRET_DECISION_SHOULD_NOT_LEAK' },
      key: 'OPENAI_API_KEY',
      query: 'alice@example.test',
      value: 'example value that must not be echoed',
      limit: 25,
    })).toEqual({
      operation: 'delete',
      tool: 'fbeast_memory_store',
      agentId: '[memory-access-audit-report-args-redacted]',
      decision: '[memory-access-audit-report-args-redacted]',
      key: '[memory-access-audit-report-args-redacted]',
      query: '[memory-access-audit-report-args-redacted]',
      value: '[memory-access-audit-report-args-redacted]',
      limit: 25,
    });

    expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
      tool: 'fbeast_memory_access_audit_report',
      args: {
        operation: 'delete',
        tool: 'fbeast_memory_store',
        key: 'OPENAI_API_KEY',
        query: 'alice@example.test',
        value: 'example value that must not be echoed',
      },
      context: 'contains selectors',
    })).toEqual({
      tool: 'fbeast_memory_access_audit_report',
      args: {
        operation: 'delete',
        tool: 'fbeast_memory_store',
        key: '[memory-access-audit-report-args-redacted]',
        query: '[memory-access-audit-report-args-redacted]',
        value: '[memory-access-audit-report-args-redacted]',
      },
      context: '[memory-access-audit-report-args-redacted]',
    });
  });

  it('redacts memory access audit report siblings when invalid is caller-supplied', () => {
    expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_access_audit_report', {
      invalid: 'caller supplied marker',
      query: 'alice@example.test',
      key: 'OPENAI_API_KEY',
      value: 'example value that must not be echoed',
      limit: 25,
    })).toEqual({
      invalid: '[memory-access-audit-report-args-redacted]',
      query: '[memory-access-audit-report-args-redacted]',
      key: '[memory-access-audit-report-args-redacted]',
      value: '[memory-access-audit-report-args-redacted]',
      limit: 25,
    });
  });

  it('normalizes memory access audit timestamp filters before audit logging', () => {
    expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_access_audit_report', {
      since: '2026-07-17 00:00:00',
      until: 'Fri, 17 Jul 2026 00:00:00 GMT (operator@example.test)',
      limit: 25,
    })).toEqual({
      since: '2026-07-17T00:00:00.000Z',
      until: '[memory-access-audit-report-args-redacted]',
      limit: 25,
    });
  });

  it('rejects non-finite number arguments before invoking the handler', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'cost',
      description: 'cost',
      inputSchema: { type: 'object', properties: { costUsd: { type: 'number', description: 'cost' } }, required: ['costUsd'] },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    const res = await srv.callTool('cost', { costUsd: Infinity });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('enforces string length bounds before invoking the handler', async () => {
    const calls: unknown[] = [];
    const recorded: Array<{ decision?: string; args?: Record<string, unknown> }> = [];
    const tool: ToolDef = {
      name: 'search',
      description: 'search',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'query', minLength: 2, maxLength: 3 } },
        required: ['query'],
      },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool], { audit: { record: async (entry) => { recorded.push(entry); } } });

    expect((await srv.callTool('search', { query: 'x' })).content[0]!.text).toContain('at least 2 characters');
    expect((await srv.callTool('search', { query: 'abcd' })).content[0]!.text).toContain('at most 3 characters');
    expect(await srv.callTool('search', { query: 'abc' })).not.toHaveProperty('isError');
    expect(await srv.callTool('search', { query: '😀😀' })).not.toHaveProperty('isError');
    expect(calls).toEqual([{ query: 'abc' }, { query: '😀😀' }]);
    expect(recorded.find((entry) => entry.decision === 'validation_error' && entry.args?.['query'] === '[schema-bound-exceeded]')).toBeDefined();
  });

  it('enforces numeric bounds before invoking the handler', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'page',
      description: 'page',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'limit', minimum: 1, maximum: 100 } },
        required: ['limit'],
      },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);

    expect((await srv.callTool('page', { limit: 0 })).content[0]!.text).toContain('at least 1');
    expect((await srv.callTool('page', { limit: 101 })).content[0]!.text).toContain('at most 100');
    expect(await srv.callTool('page', { limit: 100 })).not.toHaveProperty('isError');
    expect(calls).toEqual([{ limit: 100 }]);
  });

  it('accepts only safe integers at JavaScript precision boundaries', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'identify',
      description: 'identify',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'integer', description: 'id' } },
        required: ['id'],
      },
      handler: async (args) => {
        calls.push(args);
        return { content: [{ type: 'text' as const, text: 'ok' }] };
      },
    };
    const srv = createMcpServer('t', '1', [tool]);

    expect(await srv.callTool('identify', { id: Number.MAX_SAFE_INTEGER })).not.toHaveProperty('isError');
    expect(await srv.callTool('identify', { id: Number.MIN_SAFE_INTEGER })).not.toHaveProperty('isError');
    expect((await srv.callTool('identify', { id: Number.MAX_SAFE_INTEGER + 1 })).content[0]!.text).toContain('must be integer');
    expect((await srv.callTool('identify', { id: Number.MIN_SAFE_INTEGER - 1 })).content[0]!.text).toContain('must be integer');
    expect((await srv.callTool('identify', { id: Infinity })).isError).toBe(true);
    expect((await srv.callTool('identify', { id: Number.NaN })).isError).toBe(true);
    expect(calls).toEqual([
      { id: Number.MAX_SAFE_INTEGER },
      { id: Number.MIN_SAFE_INTEGER },
    ]);
  });

  it('enforces array item bounds before invoking the handler', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'batch',
      description: 'batch',
      inputSchema: {
        type: 'object',
        properties: { items: { type: 'array', description: 'items', minItems: 1, maxItems: 2 } },
        required: ['items'],
      },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);

    expect((await srv.callTool('batch', { items: [] })).content[0]!.text).toContain('at least 1 items');
    expect((await srv.callTool('batch', { items: [1, 2, 3] })).content[0]!.text).toContain('at most 2 items');
    expect(await srv.callTool('batch', { items: [1, 2] })).not.toHaveProperty('isError');
    expect(calls).toEqual([{ items: [1, 2] }]);

    const oversizedWithAccessor = [1, 2, 3];
    Object.defineProperty(oversizedWithAccessor, '0', { get: () => { throw new Error('must not be read'); } });
    const boundedBeforeTraversal = validateToolArguments(tool, { items: oversizedWithAccessor });
    expect(boundedBeforeTraversal.ok).toBe(false);
    if (!boundedBeforeTraversal.ok) expect(boundedBeforeTraversal.message).toContain('at most 2 items');
  });

  it('accepts arguments matching any listed schema type', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'audit_report',
      description: 'audit report',
      inputSchema: { type: 'object', properties: { limit: { type: ['string', 'number'], description: 'limit' } } },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);

    const stringLimit = await srv.callTool('audit_report', { limit: '50' });
    const numericLimit = await srv.callTool('audit_report', { limit: 50 });
    const bad = await srv.callTool('audit_report', { limit: true });

    expect(stringLimit).not.toHaveProperty('isError');
    expect(numericLimit).not.toHaveProperty('isError');

    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toContain('string or number');
    expect(calls).toEqual([{ limit: '50' }, { limit: 50 }]);
  });

  it('rejects enum values not advertised by the input schema', async () => {
    const calls: unknown[] = [];
    const tool: ToolDef = {
      name: 'store',
      description: 'store',
      inputSchema: {
        type: 'object',
        properties: { type: { type: 'string', description: 'memory type', enum: ['working', 'episodic', 'recovery'] } },
        required: ['type'],
      },
      handler: async (a) => { calls.push(a); return { content: [{ type: 'text' as const, text: 'ok' }] }; },
    };
    const srv = createMcpServer('t', '1', [tool]);
    const res = await srv.callTool('store', { type: 'bogus' });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);

    expect(validateToolArguments(tool, { type: 'working' }).ok).toBe(true);
  });

  describe('central governance enforcement', () => {
    function makeGovernedServer(gate: GovernanceGate) {
      const calls: unknown[] = [];
      const tool: ToolDef = {
        name: 'delete_database',
        description: 'destructive op',
        inputSchema: { type: 'object', properties: { target: { type: 'string', description: 't' } }, required: ['target'] },
        handler: async (args) => { calls.push(args); return { content: [{ type: 'text' as const, text: 'deleted' }] }; },
      };
      const srv = createMcpServer('t', '1', [tool], { governance: gate });
      return { srv, calls };
    }

    it('denies a dangerous tool call at dispatch without running the handler (hooks disabled)', async () => {
      const gate: GovernanceGate = {
        check: async () => ({ decision: 'denied', reason: 'destructive action blocked' }),
      };
      const { srv, calls } = makeGovernedServer(gate);
      const res = await srv.callTool('delete_database', { target: 'prod' });
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('destructive action blocked');
      expect(calls).toHaveLength(0);
    });

    it('forwards the tool name and validated args to the gate', async () => {
      const seen: Array<{ tool: string; args: Record<string, unknown> }> = [];
      const gate: GovernanceGate = {
        check: async (input) => { seen.push(input); return { decision: 'approved', reason: 'ok' }; },
      };
      const { srv } = makeGovernedServer(gate);
      await srv.callTool('delete_database', { target: 'staging' });
      expect(seen).toEqual([{ tool: 'delete_database', args: { target: 'staging' } }]);
    });

    it('fails closed when the gate throws (denies, handler not run)', async () => {
      const gate: GovernanceGate = {
        check: async () => { throw new Error('governor unavailable'); },
      };
      const { srv, calls } = makeGovernedServer(gate);
      const res = await srv.callTool('delete_database', { target: 'prod' });
      expect(res.isError).toBe(true);
      expect(calls).toHaveLength(0);
    });

    it('allows only approved decisions through to the handler', async () => {
      const gate: GovernanceGate = { check: async () => ({ decision: 'approved', reason: 'r' }) };
      const { srv, calls } = makeGovernedServer(gate);
      const res = await srv.callTool('delete_database', { target: 'x' });
      expect(res.isError).toBeFalsy();
      expect(calls).toEqual([{ target: 'x' }]);
    });

    it('fails closed on review_recommended (parity with hook path, never runs handler)', async () => {
      const gate: GovernanceGate = {
        check: async () => ({ decision: 'review_recommended', reason: 'needs human review' }),
      };
      const { srv, calls } = makeGovernedServer(gate);
      const res = await srv.callTool('delete_database', { target: 'prod' });
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('review_recommended');
      expect(res.content[0]!.text).toContain('needs human review');
      expect(calls).toHaveLength(0);
    });

    it('records the dispatched tool, result status, and args in the audit sink', async () => {
      const recorded: Array<{ tool: string; ok: boolean; args?: unknown }> = [];
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const tool: ToolDef = {
        name: 'echo',
        description: 'echo',
        inputSchema: { type: 'object', properties: { msg: { type: 'string', description: 'm' } }, required: ['msg'] },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      };
      const srv = createMcpServer('t', '1', [tool], { audit });
      await srv.callTool('echo', { msg: 'hi' });
      expect(recorded).toEqual([{ tool: 'echo', ok: true, args: { msg: 'hi' } }]);
    });

    it('redacts right-to-forget selectors before recording audit args', async () => {
      const recorded: Array<{ tool: string; ok: boolean; args?: unknown }> = [];
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const tool: ToolDef = {
        name: 'fbeast_memory_right_to_forget',
        description: 'forget',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'q' },
            category: { type: 'string', description: 'c' },
            dryRun: { type: 'boolean', description: 'd' },
          },
          required: ['query'],
        },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      };
      const srv = createMcpServer('t', '1', [tool], { audit });
      await srv.callTool('fbeast_memory_right_to_forget', { query: 'alice@example.test', category: 'pii', dryRun: true });
      expect(recorded).toEqual([
        {
          tool: 'fbeast_memory_right_to_forget',
          ok: true,
          args: {
            query: '[right-to-forget-selector-redacted]',
            category: '[right-to-forget-selector-redacted]',
            dryRun: true,
          },
        },
      ]);
      expect(JSON.stringify(recorded)).not.toContain('alice@example.test');
    });

    it('redacts right-to-forget selectors in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_right_to_forget', {
        key: 'pii:email',
        sourceScope: 'import-1',
        query: 'alice@example.test',
        dryRun: true,
      })).toEqual({
        key: '[right-to-forget-selector-redacted]',
        sourceScope: '[right-to-forget-selector-redacted]',
        query: '[right-to-forget-selector-redacted]',
        dryRun: true,
      });
    });

    it('redacts memory export agent identifiers before recording audit args', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_export', {
        readScope: 'agent',
        agentId: 'alice@example.test',
        redaction: 'safe',
        limit: 10,
        extra: 'sensitive detail',
      })).toEqual({
        readScope: 'agent',
        agentId: '[memory-export-args-redacted]',
        redaction: 'safe',
        limit: 10,
        extra: '[memory-export-args-redacted]',
      });
    });

    it('redacts proxied memory export envelopes before recording audit args', () => {
      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_export',
        args: { readScope: 'agent', agentId: 'alice@example.test', redaction: 'safe' },
      })).toEqual({
        tool: 'fbeast_memory_export',
        args: {
          readScope: 'agent',
          agentId: '[memory-export-args-redacted]',
          redaction: 'safe',
        },
      });
    });

    it('redacts malformed memory export project ids before audit', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_export', {
        projectId: { token: 'SECRET_TOKEN_SHOULD_NOT_LEAK' },
        readScope: 'shared',
        redaction: 'safe',
      })).toEqual({
        projectId: '[memory-export-args-redacted]',
        readScope: 'shared',
        redaction: 'safe',
      });
    });

    it('redacts retention-report agent identifiers before recording audit args', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_retention_report', {
        readScope: 'agent',
        agentId: 'alice@example.test',
        now: '2026-07-16T00:00:00.000Z',
        expiryHorizonMs: 1000,
        maxEntries: 10,
        extra: 'sensitive detail',
      })).toEqual({
        readScope: 'agent',
        agentId: '[memory-retention-report-args-redacted]',
        now: '2026-07-16T00:00:00.000Z',
        expiryHorizonMs: 1000,
        maxEntries: 10,
        extra: '[memory-retention-report-args-redacted]',
      });
    });

    it('redacts invalid retention-report timestamps before recording audit args', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_retention_report', {
        readScope: 'agent',
        agentId: 'alice@example.test',
        now: 'alice@example.test invalid date payload',
        expiryHorizonMs: 1000,
      })).toEqual({
        readScope: 'agent',
        agentId: '[memory-retention-report-args-redacted]',
        now: '[memory-retention-report-args-redacted]',
        expiryHorizonMs: 1000,
      });
    });

    it('normalizes retention-report audit timestamps before recording audit args', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_retention_report', {
        readScope: 'shared',
        now: 'Fri, 17 Jul 2026 00:00:00 GMT (alice@example.test)',
      })).toEqual({
        readScope: 'shared',
        now: '2026-07-17T00:00:00.000Z',
      });
    });

    it('redacts proxied retention-report envelopes before recording audit args', () => {
      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_retention_report',
        args: { readScope: 'agent', agentId: 'alice@example.test', maxEntries: 10 },
        context: 'agent alice@example.test requested scoped report',
      })).toEqual({
        tool: 'fbeast_memory_retention_report',
        args: {
          readScope: 'agent',
          agentId: '[memory-retention-report-args-redacted]',
          maxEntries: 10,
        },
        context: '[memory-retention-report-args-redacted]',
      });
    });

    it('redacts caller-controlled envelopes on direct retention-report validation errors', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_retention_report', {
        tool: 'not_the_memory_tool',
        agentId: 'alice@example.test',
        password: 'secret-value-that-must-not-leak',
        maxEntries: 'not-a-number',
      })).toEqual({
        tool: '[memory-retention-report-args-redacted]',
        agentId: '[memory-retention-report-args-redacted]',
        password: '[memory-retention-report-args-redacted]',
        maxEntries: '[memory-retention-report-args-redacted]',
      });
    });

    it('redacts caller-controlled tool envelopes on direct memory export validation errors', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_export', {
        tool: 'not_the_memory_tool',
        agentId: 'alice@example.test',
        password: 'secret-value-that-must-not-leak',
        redaction: 'safe',
      })).toEqual({
        tool: '[memory-export-args-redacted]',
        agentId: '[memory-export-args-redacted]',
        password: '[memory-export-args-redacted]',
        redaction: 'safe',
      });
    });

    it('redacts direct right-to-forget selectors even when malformed args include envelope-like properties', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_right_to_forget', {
        tool: 'not_the_memory_tool',
        action: 'alice@example.test',
        query: 'alice@example.test',
        extra: 'secret detail',
      })).toEqual({
        tool: '[right-to-forget-args-redacted]',
        action: '[right-to-forget-args-redacted]',
        query: '[right-to-forget-selector-redacted]',
        extra: '[right-to-forget-args-redacted]',
      });
    });

    it('redacts proxied right-to-forget envelope args in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_right_to_forget',
        args: 'alice@example.test',
      })).toEqual({
        tool: 'fbeast_memory_right_to_forget',
        args: '[right-to-forget-args-redacted]',
      });
    });

    it('redacts proposed memory candidates in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_review_propose', {
        key: 'secret-api-key',
        value: 'store token abc123',
        type: 'working',
        source: 'operator pasted secret',
        reason: 'contains DROP TABLE text for review',
        confidence: 0.8,
      })).toEqual({
        key: '[memory-review-proposal-redacted]',
        value: '[memory-review-proposal-redacted]',
        type: 'working',
        source: '[memory-review-proposal-redacted]',
        reason: '[memory-review-proposal-redacted]',
        confidence: 0.8,
      });

      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_review_propose',
        args: { key: 'secret-api-key', value: 'token abc123', type: 'working' },
        value: 'token abc123 outside args',
      })).toEqual({
        tool: 'fbeast_memory_review_propose',
        args: '[memory-review-proposal-redacted]',
        value: '[memory-review-proposal-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('mcp__fbeast-proxy__execute_tool', {
        tool: 'mcp__fbeast-memory__fbeast_memory_review_propose',
        args: { key: 'secret-api-key', value: 'token abc123', type: 'working' },
      })).toEqual({
        tool: 'mcp__fbeast-memory__fbeast_memory_review_propose',
        args: '[memory-review-proposal-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_review_propose',
        action: 'token abc123 outside args',
        key: 'secret-api-key',
        value: 'token abc123 outside args',
        source: 'malformed wrapper',
      })).toEqual({
        tool: 'fbeast_memory_review_propose',
        action: '[memory-review-proposal-redacted]',
        key: '[memory-review-proposal-redacted]',
        value: '[memory-review-proposal-redacted]',
        source: '[memory-review-proposal-redacted]',
        args: '[memory-review-proposal-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_governor_check', {
        action: 'mcp__fbeast-memory__fbeast_memory_review_propose',
        context: '{"value":"token abc123"}',
      })).toEqual({
        action: 'mcp__fbeast-memory__fbeast_memory_review_propose',
        context: '[memory-review-proposal-redacted]',
      });
    });

    it('redacts memory export agent identifiers in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_export', {
        readScope: 'agent',
        agentId: 'alice@example.test',
        redaction: 'safe',
        limit: 5,
      })).toEqual({
        readScope: 'agent',
        agentId: '[memory-export-args-redacted]',
        redaction: 'safe',
        limit: 5,
      });

      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_export',
        args: { readScope: 'agent', agentId: 'alice@example.test', redaction: 'safe' },
        value: 'outside envelope',
      })).toEqual({
        tool: 'fbeast_memory_export',
        args: {
          readScope: 'agent',
          agentId: '[memory-export-args-redacted]',
          redaction: 'safe',
        },
        value: '[memory-export-args-redacted]',
      });
    });

    it('redacts malformed memory export project identifiers in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_export', {
        readScope: 'shared',
        redaction: 'safe',
        projectId: { token: 'SECRET_TOKEN_SHOULD_NOT_LEAK' },
      })).toEqual({
        readScope: 'shared',
        redaction: 'safe',
        projectId: '[memory-export-args-redacted]',
      });
    });

    it('redacts memory review decision metadata in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_review_decide', {
        id: 'memcand_123',
        action: 'reject',
        reviewer: 'alice@example.test',
        note: 'Looks like token abc123',
      })).toEqual({
        id: '[memory-review-decision-metadata-redacted]',
        action: 'reject',
        reviewer: '[memory-review-decision-metadata-redacted]',
        note: '[memory-review-decision-metadata-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_review_decide', {
        id: 'memcand_123',
        action: 'resolve_conflict',
        resolution: 'replace_existing',
        reviewer: 'alice@example.test',
        note: 'Looks like token abc123',
      })).toEqual({
        id: '[memory-review-decision-metadata-redacted]',
        action: 'resolve_conflict',
        resolution: 'replace_existing',
        reviewer: '[memory-review-decision-metadata-redacted]',
        note: '[memory-review-decision-metadata-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_review_decide', {
        id: 'memcand_123',
        action: 'resolve_conflict',
        resolution: 'keep_both_scoped',
        scopedKey: 'user.preference.secret.scope.docs',
        reviewer: 'alice@example.test',
        note: 'Looks like token abc123',
      })).toEqual({
        id: '[memory-review-decision-metadata-redacted]',
        action: 'resolve_conflict',
        resolution: 'keep_both_scoped',
        scopedKey: '[memory-review-decision-metadata-redacted]',
        reviewer: '[memory-review-decision-metadata-redacted]',
        note: '[memory-review-decision-metadata-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_review_decide', {
        id: 'memcand_123',
        action: 'token abc123',
        note: 'Looks like token abc123',
      })).toEqual({
        id: '[memory-review-decision-metadata-redacted]',
        action: '[memory-review-decision-metadata-redacted]',
        note: '[memory-review-decision-metadata-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_review_decide',
        args: {
          id: 'memcand_1',
          action: 'reject',
          reviewer: 'alice',
          note: 'Rejected because candidate contains token abc123 and rm -rf /',
        },
      })).toEqual({
        tool: 'fbeast_memory_review_decide',
        args: {
          id: '[memory-review-decision-metadata-redacted]',
          action: 'reject',
          reviewer: '[memory-review-decision-metadata-redacted]',
          note: '[memory-review-decision-metadata-redacted]',
        },
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_review_decide', {
        id: 'memcand_1',
        action: 'candidate text token abc123',
        note: 'Rejected because candidate contains token abc123 and rm -rf /',
      })).toEqual({
        id: '[memory-review-decision-metadata-redacted]',
        action: '[memory-review-decision-metadata-redacted]',
        note: '[memory-review-decision-metadata-redacted]',
      });
    });

    it('redacts memory source attribution filters in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_source_attribution', {
        key: 'user.private.email',
        source: 'chat:turn-42',
        limit: '5',
      })).toEqual({
        key: '[memory-source-attribution-args-redacted]',
        source: '[memory-source-attribution-args-redacted]',
        limit: '5',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_source_attribution', {
        key: 'user.private.email',
        source: 'chat:turn-42',
        limit: 'chat:turn-42 secret',
      })).toEqual({
        key: '[memory-source-attribution-args-redacted]',
        source: '[memory-source-attribution-args-redacted]',
        limit: '[memory-source-attribution-args-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_source_attribution', {
        key: 'user.private.email',
        limit: 1001,
      })).toEqual({
        key: '[memory-source-attribution-args-redacted]',
        limit: '[memory-source-attribution-args-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_source_attribution',
        args: { key: 'user.private.email', source: 'chat:turn-42', limit: '5' },
      })).toEqual({
        tool: 'fbeast_memory_source_attribution',
        args: {
          key: '[memory-source-attribution-args-redacted]',
          source: '[memory-source-attribution-args-redacted]',
          limit: '5',
        },
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_source_attribution', {
        tool: 'not_the_memory_tool',
        key: 'user.private.email',
        source: 'chat:turn-42',
      })).toEqual({
        tool: '[memory-source-attribution-args-redacted]',
        key: '[memory-source-attribution-args-redacted]',
        source: '[memory-source-attribution-args-redacted]',
      });
    });


    it('redacts invalid and unknown right-to-forget audit payloads wholesale', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_right_to_forget', 'alice@example.test')).toEqual({
        invalid: '[right-to-forget-args-redacted]',
      });
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_right_to_forget', {
        queri: 'alice@example.test',
        dryRun: true,
      })).toEqual({
        queri: '[right-to-forget-args-redacted]',
        dryRun: true,
      });
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_right_to_forget', {
        type: 'alice@example.test',
        dryRun: 'alice@example.test',
        query: 'secret-selector',
      })).toEqual({
        type: '[right-to-forget-args-redacted]',
        dryRun: '[right-to-forget-args-redacted]',
        query: '[right-to-forget-selector-redacted]',
      });
    });


    it('redacts right-to-forget governor preflight context in the audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('fbeast_governor_check', {
        action: 'fbeast_memory_right_to_forget',
        context: '{"query":"alice@example.test"}',
      })).toEqual({
        action: 'fbeast_memory_right_to_forget',
        context: '[right-to-forget-args-redacted]',
      });

      expect(sanitizeToolArgumentsForAuditTrail('fbeast_memory_right_to_forget', {
        context: 'alice@example.test',
        args: { query: 'alice@example.test' },
        dryRun: true,
      })).toEqual({
        context: '[right-to-forget-args-redacted]',
        args: '[right-to-forget-args-redacted]',
        dryRun: true,
      });
    });

    it('audits failed handler results as ok=false with args', async () => {
      const recorded: Array<{ tool: string; ok: boolean; args?: unknown }> = [];
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const tool: ToolDef = {
        name: 'boom',
        description: 'boom',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => { throw new Error('kaboom'); },
      };
      const srv = createMcpServer('t', '1', [tool], { audit });
      const res = await srv.callTool('boom', {});
      expect(res.isError).toBe(true);
      expect(recorded).toEqual([{ tool: 'boom', ok: false, args: {} }]);
    });

    it('audits a governance denial as ok=false with the decision and args (handler never ran)', async () => {
      const recorded: Array<{ tool: string; ok: boolean; decision?: string; args?: unknown }> = [];
      let handlerRan = false;
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const gate: GovernanceGate = { check: async () => ({ decision: 'denied', reason: 'no' }) };
      const tool: ToolDef = {
        name: 'delete_database',
        description: 'd',
        inputSchema: { type: 'object', properties: { target: { type: 'string', description: 't' } }, required: ['target'] },
        handler: async () => { handlerRan = true; return { content: [{ type: 'text' as const, text: 'deleted' }] }; },
      };
      const srv = createMcpServer('t', '1', [tool], { governance: gate, audit });
      await srv.callTool('delete_database', { target: 'prod-secret' });
      expect(handlerRan).toBe(false);
      expect(recorded).toEqual([{ tool: 'delete_database', ok: false, decision: 'denied', args: { target: 'prod-secret' } }]);
    });

    it('audits a fail-closed gate error as ok=false with decision="error"', async () => {
      const recorded: Array<{ tool: string; ok: boolean; decision?: string }> = [];
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const gate: GovernanceGate = { check: async () => { throw new Error('governor down'); } };
      const tool: ToolDef = {
        name: 'delete_database',
        description: 'd',
        inputSchema: { type: 'object', properties: { target: { type: 'string', description: 't' } }, required: ['target'] },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'deleted' }] }),
      };
      const srv = createMcpServer('t', '1', [tool], { governance: gate, audit });
      await srv.callTool('delete_database', { target: 'x' });
      expect(recorded).toEqual([{ tool: 'delete_database', ok: false, decision: 'error', args: { target: 'x' } }]);
    });

    it('audits a validation failure as ok=false with the raw args (handler never ran)', async () => {
      const recorded: Array<{ tool: string; ok: boolean; decision?: string; args?: unknown }> = [];
      let handlerRan = false;
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const tool: ToolDef = {
        name: 'delete_database',
        description: 'd',
        inputSchema: { type: 'object', properties: { target: { type: 'string', description: 't' } }, required: ['target'] },
        handler: async () => { handlerRan = true; return { content: [{ type: 'text' as const, text: 'ok' }] }; },
      };
      const srv = createMcpServer('t', '1', [tool], { audit });
      // Missing required `target` + unknown property `evil`.
      const res = await srv.callTool('delete_database', { evil: 'rm -rf /' });
      expect(res.isError).toBe(true);
      expect(handlerRan).toBe(false);
      expect(recorded).toEqual([{ tool: 'delete_database', ok: false, decision: 'validation_error', args: { evil: 'rm -rf /' } }]);
    });

    it('audits a non-object payload probe (wraps the raw value)', async () => {
      const recorded: Array<{ tool: string; ok: boolean; decision?: string; args?: unknown }> = [];
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const tool: ToolDef = {
        name: 'cfg',
        description: 'cfg',
        inputSchema: { type: 'object', properties: { args: { type: 'object', description: 'a' } }, required: ['args'] },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      };
      const srv = createMcpServer('t', '1', [tool], { audit });
      const res = await srv.callTool('cfg', null);
      expect(res.isError).toBe(true);
      expect(recorded).toEqual([{ tool: 'cfg', ok: false, decision: 'validation_error', args: { invalid: null } }]);
    });

    it('audits an unknown-tool probe as ok=false', async () => {
      const recorded: Array<{ tool: string; ok: boolean; decision?: string; args?: unknown }> = [];
      const audit: AuditSink = { record: async (e) => { recorded.push(e); } };
      const srv = createMcpServer('t', '1', [], { audit });
      const res = await srv.callTool('ghost_tool', { probe: 1 });
      expect(res.isError).toBe(true);
      expect(recorded).toEqual([{ tool: 'ghost_tool', ok: false, decision: 'unknown_tool', args: { probe: 1 } }]);
    });

    it('audit failures never fail the tool call', async () => {
      const audit: AuditSink = { record: async () => { throw new Error('audit down'); } };
      const tool: ToolDef = {
        name: 'echo',
        description: 'echo',
        inputSchema: { type: 'object', properties: { msg: { type: 'string', description: 'm' } }, required: ['msg'] },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      };
      const srv = createMcpServer('t', '1', [tool], { audit });
      const res = await srv.callTool('echo', { msg: 'hi' });
      expect(res.isError).toBeFalsy();
      expect(res.content[0]!.text).toBe('ok');
    });

    it('runs the gate before argument validation rejects nothing it should not', async () => {
      // invalid args must still be rejected by validation, gate not consulted
      let gateCalled = false;
      const gate: GovernanceGate = { check: async () => { gateCalled = true; return { decision: 'approved', reason: 'ok' }; } };
      const { srv } = makeGovernedServer(gate);
      const res = await srv.callTool('delete_database', {});
      expect(res.isError).toBe(true);
      expect(gateCalled).toBe(false);
    });
  });

  it('handler returns correct format', async () => {
    const tools: ToolDef[] = [
      {
        name: 'fbeast_test_echo',
        description: 'Echo input',
        inputSchema: {
          type: 'object' as const,
          properties: { msg: { type: 'string', description: 'Message' } },
          required: ['msg'],
        },
        handler: async (args: Record<string, unknown>) => ({
          content: [{ type: 'text' as const, text: String(args['msg']) }],
        }),
      },
    ];

    const server = createMcpServer('fbeast-test', '0.1.0', tools);
    const result = await server.tools[0]!.handler({ msg: 'hello' });
    expect(result.content[0]!.text).toBe('hello');
  });
});
