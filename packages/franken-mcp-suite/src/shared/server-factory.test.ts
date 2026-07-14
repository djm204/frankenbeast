import { describe, it, expect } from 'vitest';
import { createMcpServer, sanitizeToolArgumentsForAuditTrail, validateToolArguments, type ToolDef, type GovernanceGate, type AuditSink } from './server-factory.js';

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

    it('redacts proxied right-to-forget envelope args in the exported audit sanitizer', () => {
      expect(sanitizeToolArgumentsForAuditTrail('execute_tool', {
        tool: 'fbeast_memory_right_to_forget',
        args: 'alice@example.test',
      })).toEqual({
        tool: 'fbeast_memory_right_to_forget',
        args: '[right-to-forget-args-redacted]',
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
