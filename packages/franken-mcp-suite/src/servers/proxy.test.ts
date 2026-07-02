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
        inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Key' } }, required: ['key'] },
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
  let observerLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    observerLog = vi.fn().mockResolvedValue({ id: 1, hash: 'h' });
    mockSearchTools.mockReturnValue(FAKE_STUBS);
    mockCreateAdapterSet.mockReturnValue({ observer: { log: observerLog } } as ReturnType<typeof registry.createAdapterSet>);

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

    it('includes target tool input schemas for client-side proxy validation', async () => {
      mockSearchTools.mockReturnValue([FAKE_STUBS[0]]);
      const result = await searchToolsDef.handler({}) as { content: Array<{ type: string; text: string }> };

      expect(result.content[0].text).toContain('inputSchema:');
      expect(result.content[0].text).toContain('"required":["key"]');
      expect(result.content[0].text).toContain('"key":{"type":"string"');
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

    it('does not load adapters just to report unknown tool validation errors', async () => {
      const result = await executeToolDef.handler({ tool: 'nonexistent_tool', args: {} }) as { isError: boolean };

      expect(result.isError).toBe(true);
      expect(mockCreateAdapterSet).not.toHaveBeenCalled();
    });

    it('does not load adapters when proxy meta-tool validation rejects arguments', async () => {
      const result = await server.callTool('execute_tool', { tool: 'test_tool', args: { key: 'bar' }, extra: true });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('unknown property: extra');
      expect(mockCreateAdapterSet).not.toHaveBeenCalled();
      expect(observerLog).not.toHaveBeenCalled();
    });

    it('passes args to handler correctly', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const toolArgs = { key: 'bar' };
      await executeToolDef.handler({ tool: 'test_tool', args: toolArgs });
      expect(fakeHandler).toHaveBeenCalledWith(toolArgs);
    });

    it('validates proxied target tool args before calling the target handler', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 42 } }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('property key must be string');
      expect(fakeHandler).not.toHaveBeenCalled();
      expect(mockCreateAdapterSet).not.toHaveBeenCalled();
      expect(observerLog).not.toHaveBeenCalled();
    });

    it('audits proxied target tool success', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'bar' } });

      expect(observerLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'mcp_tool_call' }));
      expect(observerLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'mcp_tool_result' }));
    });

    it('preserves proxied results when result audit logging fails', async () => {
      const fakeResult = { content: [{ type: 'text', text: 'ok' }] };
      const fakeHandler = vi.fn().mockResolvedValue(fakeResult);
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);
      observerLog
        .mockResolvedValueOnce({ id: 1, hash: 'h1' })
        .mockRejectedValueOnce(new Error('audit write failed'));

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'bar' } });

      expect(result).toEqual(fakeResult);
      expect(fakeHandler).toHaveBeenCalledOnce();
      expect(observerLog).toHaveBeenCalledTimes(2);
    });

    it('executes proxied target tools when pre-call audit logging fails', async () => {
      const fakeResult = { content: [{ type: 'text', text: 'ok' }] };
      const fakeHandler = vi.fn().mockResolvedValue(fakeResult);
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);
      observerLog
        .mockRejectedValueOnce(new Error('audit write failed'))
        .mockResolvedValueOnce({ id: 2, hash: 'h2' });

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'bar' } });

      expect(result).toEqual(fakeResult);
      expect(fakeHandler).toHaveBeenCalledWith({ key: 'bar' });
      expect(observerLog).toHaveBeenCalledTimes(2);
    });

    it('rejects proxied calls with missing target required fields', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const result = await server.callTool('execute_tool', { tool: 'test_tool', args: {} }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('missing required property: key');
      expect(fakeHandler).not.toHaveBeenCalled();
    });

    it('rejects proxied calls with target unknown properties', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const result = await server.callTool('execute_tool', { tool: 'test_tool', args: { key: 'val', extra: true } }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('received unknown property: extra');
      expect(fakeHandler).not.toHaveBeenCalled();
    });

    it('rejects proxied calls with invalid target primitive types', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const result = await server.callTool('execute_tool', { tool: 'test_tool', args: { key: 42 } }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('property key must be string');
      expect(fakeHandler).not.toHaveBeenCalled();
    });
  });
});
