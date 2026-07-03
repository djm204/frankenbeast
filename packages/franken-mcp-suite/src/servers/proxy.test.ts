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

import { createProxyServer, deriveProxyRoot } from './proxy.js';
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
  let gateCheck: ReturnType<typeof vi.fn>;
  let auditRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchTools.mockReturnValue(FAKE_STUBS);
    mockCreateAdapterSet.mockReturnValue({} as ReturnType<typeof registry.createAdapterSet>);

    // Inject spy gate/audit so tests don't touch sqlite and can assert that the
    // *resolved* target tool (not the execute_tool wrapper) is governed/audited.
    gateCheck = vi.fn().mockResolvedValue({ decision: 'approved', reason: 'ok' });
    auditRecord = vi.fn().mockResolvedValue(undefined);
    server = createProxyServer({
      dbPath: ':memory:',
      root: '/tmp/project-root',
      governance: { check: gateCheck },
      audit: { record: auditRecord },
    });
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
      expect(mockCreateAdapterSet).toHaveBeenCalledWith(':memory:', { root: '/tmp/project-root' });
    });

    it('derives the project root from legacy proxy registrations that only pass --db', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);
      const legacyServer = createProxyServer({
        dbPath: '/tmp/legacy-project/.fbeast/beast.db',
        governance: { check: gateCheck },
        audit: { record: auditRecord },
      });
      const legacyExecuteTool = legacyServer.tools.find((t) => t.name === 'execute_tool')!;

      await legacyExecuteTool.handler({ tool: 'test_tool', args: { key: 'val' } });

      expect(mockCreateAdapterSet).toHaveBeenCalledWith('/tmp/legacy-project/.fbeast/beast.db', { root: '/tmp/legacy-project' });
    });

    it('returns isError response for unknown tool', async () => {
      const result = await executeToolDef.handler({ tool: 'nonexistent_tool', args: {} }) as { content: Array<{ type: string; text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: nonexistent_tool');
      expect(result.content[0].text).toContain('search_tools');
    });

    it('audits an unknown-target probe as ok=false', async () => {
      await executeToolDef.handler({ tool: 'nonexistent_tool', args: { probe: 1 } });
      expect(auditRecord).toHaveBeenCalledWith({ tool: 'nonexistent_tool', ok: false, decision: 'unknown_tool', args: { probe: 1 } });
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
    });

    it('governs the RESOLVED target tool, not the execute_tool wrapper (finding round-1)', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'val' } });
      expect(gateCheck).toHaveBeenCalledWith({ tool: 'test_tool', args: { key: 'val' } });
    });

    it('fails closed and skips the handler when the gate denies the target', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockResolvedValue({ decision: 'denied', reason: 'destructive' });

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'x' } }) as { isError: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('destructive');
      expect(fakeHandler).not.toHaveBeenCalled();
    });

    it('fails closed on review_recommended for the target', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockResolvedValue({ decision: 'review_recommended', reason: 'needs review' });

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'x' } }) as { isError: boolean };
      expect(result.isError).toBe(true);
      expect(fakeHandler).not.toHaveBeenCalled();
    });

    it('fails closed when the gate throws', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockRejectedValue(new Error('governor down'));

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'x' } }) as { isError: boolean };
      expect(result.isError).toBe(true);
      expect(fakeHandler).not.toHaveBeenCalled();
    });

    it('audits the resolved target tool and its args after dispatch', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'val' } });
      expect(auditRecord).toHaveBeenCalledWith({ tool: 'test_tool', ok: true, args: { key: 'val' } });
    });

    it('audits a governance denial of the target (ok=false, decision, args)', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockResolvedValue({ decision: 'denied', reason: 'destructive' });

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'secret' } });
      expect(auditRecord).toHaveBeenCalledWith({ tool: 'test_tool', ok: false, decision: 'denied', args: { key: 'secret' } });
    });

    it('audits a fail-closed gate error of the target (decision="error")', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockRejectedValue(new Error('governor down'));

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'x' } });
      expect(auditRecord).toHaveBeenCalledWith({ tool: 'test_tool', ok: false, decision: 'error', args: { key: 'x' } });
    });
  });

  // Malformed execute_tool probes are rejected by the factory's argument
  // validation BEFORE the custom handler runs, so they must be exercised via
  // server.callTool (the full dispatch path), not the handler directly.
  describe('wrapper-level audit of malformed proxy probes', () => {
    it('audits a validation failure on execute_tool (missing required args)', async () => {
      const res = await server.callTool('execute_tool', { tool: 'test_tool' }) as { isError?: boolean };
      expect(res.isError).toBe(true);
      expect(auditRecord).toHaveBeenCalledWith({
        tool: 'execute_tool',
        ok: false,
        decision: 'validation_error',
        args: { tool: 'test_tool' },
      });
    });

    it('audits a non-object payload probe (wraps the raw value)', async () => {
      const res = await server.callTool('execute_tool', null) as { isError?: boolean };
      expect(res.isError).toBe(true);
      expect(auditRecord).toHaveBeenCalledWith({
        tool: 'execute_tool',
        ok: false,
        decision: 'validation_error',
        args: { invalid: null },
      });
    });

    it('audits an unknown proxy tool probe', async () => {
      const res = await server.callTool('ghost_tool', { probe: 1 }) as { isError?: boolean };
      expect(res.isError).toBe(true);
      expect(auditRecord).toHaveBeenCalledWith({
        tool: 'ghost_tool',
        ok: false,
        decision: 'unknown_tool',
        args: { probe: 1 },
      });
    });

    it('does NOT double-audit a successful execute_tool call at the wrapper level', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await server.callTool('execute_tool', { tool: 'test_tool', args: { key: 'v' } });
      // Only the resolved-target record; no generic execute_tool wrapper record.
      expect(auditRecord).toHaveBeenCalledTimes(1);
      expect(auditRecord).toHaveBeenCalledWith({ tool: 'test_tool', ok: true, args: { key: 'v' } });
    });

    it('does NOT audit a read-only search_tools call at the wrapper level', async () => {
      await server.callTool('search_tools', {});
      expect(auditRecord).not.toHaveBeenCalled();
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

  describe('deriveProxyRoot', () => {
    it('prefers explicit root and normalizes it', () => {
      expect(deriveProxyRoot('/tmp/project/.fbeast/beast.db', '/tmp/explicit/../explicit')).toBe('/tmp/explicit');
    });

    it('returns undefined for database paths that are not inside a .fbeast directory', () => {
      expect(deriveProxyRoot('/tmp/project/beast.db')).toBeUndefined();
    });
  });
});
