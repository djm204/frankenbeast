import { describe, it, expect, vi } from 'vitest';
import { createMcpServer, validateToolArguments, type ToolDef } from './server-factory.js';
import type { ObserverAdapter } from '../adapters/observer-adapter.js';

describe('createMcpServer', () => {
  it('creates server with name and version', () => {
    const server = createMcpServer('fbeast-memory', '0.1.0', []);
    expect(server).toBeDefined();
    expect(server.name).toBe('fbeast-memory');
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

  it('audits direct tool success through the centralized dispatch path', async () => {
    const observer = { log: vi.fn().mockResolvedValue({ id: 1, hash: 'h' }) } as unknown as ObserverAdapter;
    const tool: ToolDef = {
      name: 'echo',
      description: 'echo',
      inputSchema: { type: 'object', properties: { msg: { type: 'string', description: 'm' } }, required: ['msg'] },
      handler: async (args) => ({ content: [{ type: 'text' as const, text: String(args['msg']) }] }),
    };
    const srv = createMcpServer('t', '1', [tool], { observer, sessionId: 's1' });

    const res = await srv.callTool('echo', { msg: 'hi' });

    expect(res.isError).toBeFalsy();
    expect(observer.log).toHaveBeenCalledTimes(2);
    expect(observer.log).toHaveBeenNthCalledWith(1, expect.objectContaining({ event: 'mcp_tool_call', sessionId: 's1' }));
    expect(observer.log).toHaveBeenNthCalledWith(2, expect.objectContaining({ event: 'mcp_tool_result', sessionId: 's1' }));
  });

  it('returns successful tool results when result audit logging fails', async () => {
    const observer = {
      log: vi.fn()
        .mockResolvedValueOnce({ id: 1, hash: 'h1' })
        .mockRejectedValueOnce(new Error('audit write failed')),
    } as unknown as ObserverAdapter;
    const tool: ToolDef = {
      name: 'echo',
      description: 'echo',
      inputSchema: { type: 'object', properties: { msg: { type: 'string', description: 'm' } }, required: ['msg'] },
      handler: async (args) => ({ content: [{ type: 'text' as const, text: String(args['msg']) }] }),
    };
    const srv = createMcpServer('t', '1', [tool], { observer, sessionId: 's1' });

    const res = await srv.callTool('echo', { msg: 'hi' });

    expect(res).toEqual({ content: [{ type: 'text', text: 'hi' }] });
    expect(observer.log).toHaveBeenCalledTimes(2);
  });

  it('audits validation failures before returning without calling the handler', async () => {
    const observer = { log: vi.fn().mockResolvedValue({ id: 1, hash: 'h' }) } as unknown as ObserverAdapter;
    const { calls, tool } = makeServerWithSpy();
    const srv = createMcpServer('t', '1', [tool], { observer, sessionId: 's2' });

    const res = await srv.callTool('echo', { msg: 123 });

    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
    expect(observer.log).toHaveBeenCalledOnce();
    expect(observer.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'mcp_tool_validation_failure', sessionId: 's2' }));
  });

  it('normalizes absent arguments before hashing validation-failure audits', async () => {
    const observer = { log: vi.fn().mockResolvedValue({ id: 1, hash: 'h' }) } as unknown as ObserverAdapter;
    const srv = createMcpServer('t', '1', [], { observer, sessionId: 's3' });

    const res = await srv.callTool('missing', undefined);

    expect(res.isError).toBe(true);
    expect(observer.log).toHaveBeenCalledOnce();
    const metadata = JSON.parse(vi.mocked(observer.log).mock.calls[0]![0].metadata) as {
      inputHash: string;
      inputSummary: { kind: string; keys: string[] };
    };
    expect(metadata.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.inputSummary).toEqual({ kind: 'object', keys: [] });
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
