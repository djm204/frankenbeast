import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../shared/tool-registry.js', () => ({
  searchTools: vi.fn(),
  TOOL_REGISTRY: new Map([
    [
      'test_tool',
      {
        name: 'test_tool',
        server: 'memory',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
        makeHandler: vi.fn(),
      },
    ],
    [
      'another_tool',
      {
        name: 'another_tool',
        server: 'observer',
        description: 'Another test tool for filtering',
        inputSchema: { type: 'object', properties: {} },
        makeHandler: vi.fn(),
      },
    ],
  ]),
  createAdapterSet: vi.fn(() => ({})),
}));

import { createProxyServer } from './proxy.js';
import * as registry from '../shared/tool-registry.js';

const mockSearchTools = vi.mocked(registry.searchTools);
const mockCreateAdapterSet = vi.mocked(registry.createAdapterSet);
const mockRegistry = registry.TOOL_REGISTRY;

const FAKE_STUBS = [
  { name: 'test_tool', server: 'memory' as const, description: 'A test tool' },
  { name: 'another_tool', server: 'observer' as const, description: 'Another test tool for filtering' },
  { name: 'third_tool', server: 'planner' as const, description: 'Third tool' },
];

describe('proxy server', () => {
  let server: ReturnType<typeof createProxyServer>;
  let searchToolsDef: { handler: (args: Record<string, unknown>) => Promise<unknown> };
  let executeToolDef: { handler: (args: Record<string, unknown>) => Promise<unknown> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchTools.mockReturnValue(FAKE_STUBS);
    mockCreateAdapterSet.mockReturnValue({} as ReturnType<typeof registry.createAdapterSet>);

    server = createProxyServer({ dbPath: ':memory:' });
    searchToolsDef = server.tools.find((t) => t.name === 'search_tools')!;
    executeToolDef = server.tools.find((t) => t.name === 'execute_tool')!;
  });

  describe('search_tools', () => {
    it('returns all tools when no query provided', async () => {
      mockSearchTools.mockReturnValue(FAKE_STUBS);
      const result = await searchToolsDef.handler({}) as { content: Array<{ type: string; text: string }> };
      expect(mockSearchTools).toHaveBeenCalledWith(undefined);
      expect(result.content[0].text).toContain('test_tool');
      expect(result.content[0].text).toContain('another_tool');
      expect(result.content[0].text).toContain('third_tool');
    });

    it('filters by query substring when query provided', async () => {
      const filtered = [FAKE_STUBS[0]];
      mockSearchTools.mockReturnValue(filtered);
      const result = await searchToolsDef.handler({ query: 'test' }) as { content: Array<{ type: string; text: string }> };
      expect(mockSearchTools).toHaveBeenCalledWith('test');
      expect(result.content[0].text).toContain('test_tool');
      expect(result.content[0].text).not.toContain('another_tool');
    });
  });

  describe('execute_tool', () => {
    it('calls through to handler and returns its result', async () => {
      const fakeResult = { content: [{ type: 'text', text: 'tool executed' }] };
      const fakeHandler = vi.fn().mockResolvedValue(fakeResult);
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'val' } });
      expect(result).toEqual(fakeResult);
    });

    it('returns isError response for unknown tool', async () => {
      const result = await executeToolDef.handler({ tool: 'nonexistent_tool', args: {} }) as { content: Array<{ type: string; text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: nonexistent_tool');
      expect(result.content[0].text).toContain('search_tools');
    });

    it('passes args to handler correctly', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const toolArgs = { foo: 'bar', count: 42 };
      await executeToolDef.handler({ tool: 'test_tool', args: toolArgs });
      expect(fakeHandler).toHaveBeenCalledWith(toolArgs);
    });
  });
});
