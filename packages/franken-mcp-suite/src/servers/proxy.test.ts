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
        timeoutMs: 10,
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
    [
      'fbeast_memory_query',
      {
        name: 'fbeast_memory_query',
        server: 'memory',
        description: 'Query memory',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Query' },
            agentId: { type: 'string', description: 'Agent id' },
            profile: { type: 'string', description: 'Profile' },
            repo: { type: 'string', description: 'Repository' },
          },
          required: ['query'],
        },
        makeHandler: vi.fn(),
      },
    ],
  ]),
  createAdapterSet: vi.fn(() => ({})),
}));

vi.mock('../shared/governance-gate.js', () => ({
  createGovernanceGate: vi.fn(() => ({ check: vi.fn() })),
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

function expectValueFreeAuditArgs(value: unknown, fieldNames: string[]): void {
  expect(value).toEqual(expect.objectContaining({
    redacted: true,
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    summary: expect.objectContaining({
      type: 'object',
      fields: expect.arrayContaining(fieldNames.map((name) => expect.objectContaining({ name }))),
    }),
  }));
}

describe('proxy server', () => {
  let server: ReturnType<typeof createProxyServer>;
  let searchToolsDef: { handler: (args: Record<string, unknown>) => Promise<unknown> };
  let executeToolDef: { timeoutMs?: number; handler: (args: Record<string, unknown>) => Promise<unknown> };
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
    it('keeps the proxy wrapper deadline longer than every target deadline', () => {
      expect(executeToolDef.timeoutMs).toBe(60_000);
    });

    it('resolves a relative active config path against the proxy project root', async () => {
      const server = createProxyServer({
        dbPath: '/tmp/configured-project/.fbeast/beast.db',
        root: '/tmp/configured-project',
        configPath: '.fbeast/config.json',
        governance: { check: gateCheck },
        audit: { record: auditRecord },
      });

      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      await server.tools.find((tool) => tool.name === 'execute_tool')!
        .handler({ tool: 'test_tool', args: { key: 'val' } });

      expect(mockCreateAdapterSet).toHaveBeenCalledWith(
        '/tmp/configured-project/.fbeast/beast.db',
        {
          root: '/tmp/configured-project',
          configPath: '/tmp/configured-project/.fbeast/config.json',
        },
      );
    });

    it('resolves project-root placeholders in active config paths', async () => {
      const placeholderServer = createProxyServer({
        dbPath: '$FBEAST_ROOT/.fbeast/beast.db',
        root: '/tmp/placeholder-project',
        configPath: '$FBEAST_ROOT/configs/fbeast.json',
        governance: { check: gateCheck },
        audit: { record: auditRecord },
      });
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await placeholderServer.tools.find((tool) => tool.name === 'execute_tool')!
        .handler({ tool: 'test_tool', args: { key: 'val' } });

      expect(mockCreateAdapterSet).toHaveBeenCalledWith(
        '/tmp/placeholder-project/.fbeast/beast.db',
        {
          root: '/tmp/placeholder-project',
          configPath: '/tmp/placeholder-project/configs/fbeast.json',
        },
      );
    });

    it('resolves non-.fbeast relative config paths against the proxy root', async () => {
      const relativeConfigServer = createProxyServer({
        dbPath: '/tmp/relative-config-project/.fbeast/beast.db',
        root: '/tmp/relative-config-project',
        configPath: 'configs/fbeast.json',
        governance: { check: gateCheck },
        audit: { record: auditRecord },
      });
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await relativeConfigServer.tools.find((tool) => tool.name === 'execute_tool')!
        .handler({ tool: 'test_tool', args: { key: 'val' } });

      expect(mockCreateAdapterSet).toHaveBeenCalledWith(
        '/tmp/relative-config-project/.fbeast/beast.db',
        {
          root: '/tmp/relative-config-project',
          configPath: '/tmp/relative-config-project/configs/fbeast.json',
        },
      );
    });

    it('preserves nested .fbeast segments in relative active config paths', async () => {
      const server = createProxyServer({
        dbPath: '/tmp/nested-config-project/.fbeast/beast.db',
        root: '/tmp/nested-config-project',
        configPath: 'nested/.fbeast/config.json',
        governance: { check: gateCheck },
        audit: { record: auditRecord },
      });
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await server.tools.find((tool) => tool.name === 'execute_tool')!
        .handler({ tool: 'test_tool', args: { key: 'val' } });

      expect(mockCreateAdapterSet).toHaveBeenCalledWith(
        '/tmp/nested-config-project/.fbeast/beast.db',
        {
          root: '/tmp/nested-config-project',
          configPath: '/tmp/nested-config-project/nested/.fbeast/config.json',
        },
      );
    });

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

    it('walks up from nested cwd to derive root for relative proxy registrations', async () => {
      const originalCwd = process.cwd();
      const projectRoot = await import('node:fs').then(({ mkdtempSync, mkdirSync, writeFileSync }) => {
        const root = mkdtempSync('/tmp/fbeast-proxy-relative-');
        mkdirSync(`${root}/.fbeast`, { recursive: true });
        mkdirSync(`${root}/packages/app`, { recursive: true });
        writeFileSync(`${root}/.fbeast/beast.db`, '');
        return root;
      });
      try {
        process.chdir(`${projectRoot}/packages/app`);
        const relativeServer = createProxyServer({
          dbPath: '.fbeast/beast.db',
          governance: { check: gateCheck },
          audit: { record: auditRecord },
        });
        const relativeExecuteTool = relativeServer.tools.find((t) => t.name === 'execute_tool')!;
        const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
        vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

        await relativeExecuteTool.handler({ tool: 'test_tool', args: { key: 'val' } });

        expect(mockCreateAdapterSet).toHaveBeenCalledWith(`${projectRoot}/.fbeast/beast.db`, { root: projectRoot });
      } finally {
        process.chdir(originalCwd);
        await import('node:fs').then(({ rmSync }) => rmSync(projectRoot, { recursive: true, force: true }));
      }
    });

    it('returns isError response for unknown tool', async () => {
      const result = await executeToolDef.handler({ tool: 'nonexistent_tool', args: {} }) as { content: Array<{ type: string; text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: nonexistent_tool');
      expect(result.content[0].text).toContain('search_tools');
    });

    it('audits an unknown-target probe as ok=false', async () => {
      await executeToolDef.handler({ tool: 'nonexistent_tool', args: { probe: 1 } });
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'nonexistent_tool', ok: false, decision: 'unknown_tool' });
      expectValueFreeAuditArgs(event.args, ['probe']);
    });

    it('passes args to handler correctly', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);

      const toolArgs = { key: 'bar' };
      await executeToolDef.handler({ tool: 'test_tool', args: toolArgs });
      expect(fakeHandler).toHaveBeenCalledWith(toolArgs, expect.objectContaining({
        signal: expect.any(AbortSignal),
        timeoutMs: 10,
      }));
    });

    it('times out proxied registry handlers and audits the timeout', async () => {
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(vi.fn(async () => {
        await new Promise<void>(() => undefined);
        return { content: [{ type: 'text', text: 'unreachable' }] };
      }));

      const result = await executeToolDef.handler({ tool: 'test_tool', args: { key: 'value' } }) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: Tool execution timed out after 10ms [MCP_TOOL_TIMEOUT]' }],
        isError: true,
      });
      expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({
        tool: 'test_tool',
        ok: false,
        decision: 'timeout',
      }));
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
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'test_tool', ok: true });
      expectValueFreeAuditArgs(event.args, ['key']);
      expect(JSON.stringify(event.args)).not.toContain(':"val"');
    });

    it('retains bounded selector attribution in value-free memory proxy audits', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('fbeast_memory_query')!.makeHandler).mockReturnValue(fakeHandler);

      await executeToolDef.handler({
        tool: 'fbeast_memory_query',
        args: {
          query: 'private search text',
          agentId: 'agent-7',
          profile: 'doctor',
          repo: '/srv/frankenbeast',
        },
      });

      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({
        tool: 'fbeast_memory_query',
        args: {
          agentId: 'agent-7',
          profile: 'doctor',
          repo: '/srv/frankenbeast',
          redacted: true,
        },
      });
      expect(JSON.stringify(event.args)).not.toContain('private search text');
    });

    it('preserves safe memory classifiers without leaking export selectors in resolved-target audits', async () => {
      const makeEntry = (name: string, properties: Record<string, { type: string; description: string }>) => ({
        name,
        server: 'memory' as const,
        description: name,
        inputSchema: { type: 'object' as const, properties },
        makeHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })),
      });
      mockRegistry.set('fbeast_memory_store', makeEntry('fbeast_memory_store', {
        type: { type: 'string', description: 'Memory type' },
        value: { type: 'string', description: 'Private value' },
      }));
      mockRegistry.set('fbeast_memory_export', makeEntry('fbeast_memory_export', {
        agentId: { type: 'string', description: 'Agent id' },
        redaction: { type: 'string', description: 'Redaction mode' },
      }));

      try {
        await executeToolDef.handler({
          tool: 'fbeast_memory_store',
          args: { type: 'working', value: 'private-memory-value' },
        });
        await executeToolDef.handler({
          tool: 'fbeast_memory_export',
          args: { agentId: 'alice@example.test', redaction: 'none' },
        });

        const storeEvent = auditRecord.mock.calls[0]![0];
        const exportEvent = auditRecord.mock.calls[1]![0];
        expect(storeEvent.args).toMatchObject({ type: 'working', redacted: true });
        expect(exportEvent.args).toMatchObject({ redaction: 'none', redacted: true });
        expect(exportEvent.args).not.toHaveProperty('agentId');
        expect(JSON.stringify(storeEvent.args)).not.toContain('private-memory-value');
        expect(JSON.stringify(exportEvent.args)).not.toContain('alice@example.test');
      } finally {
        mockRegistry.delete('fbeast_memory_store');
        mockRegistry.delete('fbeast_memory_export');
      }
    });

    it('audits a governance denial of the target (ok=false, decision, args)', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockResolvedValue({ decision: 'denied', reason: 'destructive' });

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'credential' } });
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'test_tool', ok: false, decision: 'denied' });
      expectValueFreeAuditArgs(event.args, ['key']);
      expect(JSON.stringify(event.args)).not.toContain('credential');
    });

    it('audits a fail-closed gate error of the target (decision="error")', async () => {
      const fakeHandler = vi.fn();
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);
      gateCheck.mockRejectedValue(new Error('governor down'));

      await executeToolDef.handler({ tool: 'test_tool', args: { key: 'x' } });
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'test_tool', ok: false, decision: 'error' });
      expectValueFreeAuditArgs(event.args, ['key']);
    });
  });

  // Malformed execute_tool probes are rejected by the factory's argument
  // validation BEFORE the custom handler runs, so they must be exercised via
  // server.callTool (the full dispatch path), not the handler directly.
  describe('wrapper-level audit of malformed proxy probes', () => {
    it('audits a validation failure on execute_tool (missing required args)', async () => {
      const res = await server.callTool('execute_tool', {
        tool: 'test_tool',
        password: 'sk-private-value',
      }) as { isError?: boolean };
      expect(res.isError).toBe(true);
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({
        tool: 'execute_tool',
        ok: false,
        decision: 'validation_error',
        args: {
          tool: 'test_tool',
          args: { redacted: true },
          envelope: { redacted: true },
        },
      });
      expect(JSON.stringify(event)).not.toContain('sk-private-value');
    });

    it('value-redacts a non-object payload probe', async () => {
      const res = await server.callTool('execute_tool', null) as { isError?: boolean };
      expect(res.isError).toBe(true);
      expect(auditRecord).toHaveBeenCalledWith({
        tool: 'execute_tool',
        ok: false,
        decision: 'validation_error',
        args: {
          tool: '[redacted-tool]',
          args: expect.objectContaining({ redacted: true }),
          envelope: expect.objectContaining({ redacted: true }),
        },
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

    it('audits an execute_tool wrapper timeout with its sanitized target envelope', async () => {
      executeToolDef.timeoutMs = 10;
      gateCheck.mockImplementationOnce(() => new Promise(() => {}));
      const envelope = { tool: 'test_tool', args: { key: 'v' } };

      const res = await server.callTool('execute_tool', envelope) as { isError?: boolean };

      expect(res.isError).toBe(true);
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'execute_tool', ok: false, decision: 'timeout', args: { tool: 'test_tool' } });
      expectValueFreeAuditArgs(event.args.args, ['key']);
    });

    it('does NOT double-audit a successful execute_tool call at the wrapper level', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      vi.mocked(mockRegistry.get('test_tool')!.makeHandler).mockReturnValue(fakeHandler);

      await server.callTool('execute_tool', { tool: 'test_tool', args: { key: 'v' } });
      // Only the resolved-target record; no generic execute_tool wrapper record.
      expect(auditRecord).toHaveBeenCalledTimes(1);
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'test_tool', ok: true });
      expectValueFreeAuditArgs(event.args, ['key']);
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

    it('redacts over-bound target arguments from proxy validation-error audits', async () => {
      mockRegistry.set('bounded_tool', {
        name: 'bounded_tool',
        server: 'memory',
        description: 'Bounded test tool',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Query', maxLength: 3 } }, required: ['query'] },
        makeHandler: vi.fn(),
      });

      const result = await executeToolDef.handler({ tool: 'bounded_tool', args: { query: 'oversized' } }) as { isError: boolean };

      expect(result.isError).toBe(true);
      const event = auditRecord.mock.calls[0]![0];
      expect(event).toMatchObject({ tool: 'bounded_tool', ok: false, decision: 'validation_error' });
      expectValueFreeAuditArgs(event.args, ['query']);
      expect(JSON.stringify(event.args)).not.toContain('oversized');
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

    it('rejects unsafe proxied target argument shapes before governance or handler dispatch', async () => {
      const fakeHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const entry = mockRegistry.get('test_tool')!;
      vi.mocked(entry.makeHandler).mockReturnValue(fakeHandler);
      mockRegistry.set('object_tool', {
        name: 'object_tool',
        server: 'memory',
        description: 'Object accepting test tool',
        inputSchema: { type: 'object', properties: { payload: { type: 'object', description: 'Payload' } }, required: ['payload'] },
        makeHandler: vi.fn().mockReturnValue(fakeHandler),
      });

      const unsafePayload: Record<string, unknown> = { ok: true };
      Object.defineProperty(unsafePayload, '__proto__', {
        enumerable: true,
        value: { polluted: true },
      });

      try {
        const result = await server.callTool('execute_tool', {
          tool: 'object_tool',
          args: { payload: unsafePayload },
        }) as { isError: boolean; content: Array<{ text: string }> };

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('rejected unsafe argument shape');
        expect(result.content[0].text).toContain('denied property name: __proto__');
        expect(auditRecord).toHaveBeenCalledTimes(1);
        const auditedArgs = auditRecord.mock.calls[0]![0].args;
        expectValueFreeAuditArgs(auditedArgs, ['payload']);
        expect(JSON.stringify(auditedArgs)).not.toContain('polluted');
        expect(gateCheck).not.toHaveBeenCalledWith(expect.objectContaining({ tool: 'object_tool' }));
        expect(fakeHandler).not.toHaveBeenCalled();
      } finally {
        mockRegistry.delete('object_tool');
      }
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
