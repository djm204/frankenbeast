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
