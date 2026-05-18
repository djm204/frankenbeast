import { describe, it, expect } from 'vitest';
import { createMcpServer, type ToolDef } from './server-factory.js';

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
