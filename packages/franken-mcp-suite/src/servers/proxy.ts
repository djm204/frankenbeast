#!/usr/bin/env node
import { createMcpServer, validateToolArguments, type AuditSink, type FbeastMcpServer, type GovernanceGate, type ToolDef, type ToolResult } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { searchTools, TOOL_REGISTRY, createAdapterSet, type AdapterSet } from '../shared/tool-registry.js';
import { createGovernanceGate } from '../shared/governance-gate.js';
import { createAuditSink } from '../shared/central-enforcement.js';
import { parseArgs } from 'node:util';

export interface ProxyServerDeps {
  dbPath: string;
  /** Governance gate applied to the *resolved* target tool (defaults to the dbPath-backed gate). */
  governance?: GovernanceGate;
  /** Server-side audit sink for resolved tool calls (defaults to the dbPath-backed observer). */
  audit?: AuditSink;
}

export function createProxyServer(deps: ProxyServerDeps): FbeastMcpServer {
  const { dbPath } = deps;
  let cachedAdapters: AdapterSet | undefined;
  // Govern/audit the *resolved* target tool, not the `execute_tool` wrapper, so
  // policy and audit are keyed by the real high-risk action (ADR-035, finding
  // round-1). The gate/observer are created lazily, preserving lazy-DB behavior.
  const governance = deps.governance ?? createGovernanceGate(dbPath);
  const audit = deps.audit ?? createAuditSink(dbPath);

  function getAdapters(): AdapterSet {
    if (!cachedAdapters) {
      cachedAdapters = createAdapterSet(dbPath);
    }
    return cachedAdapters;
  }

  const tools: ToolDef[] = [
    {
      name: 'search_tools',
      description: 'List available fbeast tools. Pass a query to filter by name or capability.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional keyword filter' },
        },
      },
      async handler(args) {
        const results = searchTools(args['query'] ? String(args['query']) : undefined);
        const lines = results.map((t) => `${t.name.padEnd(32)} ${t.description}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },
    {
      name: 'execute_tool',
      description: 'Execute any fbeast tool by name with args object.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Tool name from search_tools' },
          args: { type: 'object', description: 'Tool arguments as JSON object' },
        },
        required: ['tool', 'args'],
      },
      async handler(args) {
        const toolName = String(args['tool']);
        const toolArgs = (args['args'] ?? {}) as Record<string, unknown>;
        // Best-effort audit of the resolved target, including its args and any
        // governance denial or rejected probe (mirrors dispatchTool); never
        // fails the call.
        const recordAudit = async (input: { ok: boolean; decision?: string }): Promise<void> => {
          try {
            await audit.record({ tool: toolName, ok: input.ok, ...(input.decision !== undefined ? { decision: input.decision } : {}), args: toolArgs });
          } catch (err) {
            process.stderr.write(`fbeast audit failed for ${toolName}: ${err instanceof Error ? err.message : String(err)}\n`);
          }
        };
        const entry = TOOL_REGISTRY.get(toolName);
        if (!entry) {
          await recordAudit({ ok: false, decision: 'unknown_tool' });
          return {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}. Call search_tools to list available tools.` }],
            isError: true,
          };
        }
        // Validate the resolved target's args before governing/running it.
        const validated = validateToolArguments(entry, toolArgs);
        if (!validated.ok) {
          await recordAudit({ ok: false, decision: 'validation_error' });
          return { content: [{ type: 'text', text: `Error: ${validated.message}` }], isError: true };
        }
        // Central governance on the resolved target — fails closed on any
        // non-`approved` decision or gate error (mirrors dispatchTool).
        let decision;
        try {
          decision = await governance.check({ tool: toolName, args: validated.value });
        } catch (err) {
          await recordAudit({ ok: false, decision: 'error' });
          return {
            content: [{ type: 'text', text: `Denied by governance (fail-closed): ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
        if (decision.decision !== 'approved') {
          await recordAudit({ ok: false, decision: decision.decision });
          return {
            content: [{ type: 'text', text: `Denied by governance (${decision.decision}): ${decision.reason}` }],
            isError: true,
          };
        }
        const adapters = getAdapters();
        const handler = entry.makeHandler(adapters);
        let result: ToolResult;
        try {
          result = (await handler(validated.value)) as ToolResult;
        } catch (err) {
          result = {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
        await recordAudit({ ok: !result.isError });
        return result;
      },
    },
  ];

  // Governance/audit are applied inside the `execute_tool` handler against the
  // resolved target tool (not the `execute_tool` wrapper), so the wrapper-level
  // gate is intentionally omitted here. `search_tools` is a read-only listing
  // and needs no gate.
  return createMcpServer('fbeast-proxy', '0.1.0', tools);
}

// CLI entry point
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const server = createProxyServer({ dbPath: values['db']! });
  server.start().catch((err) => {
    console.error('fbeast-proxy failed to start:', err);
    process.exit(1);
  });
}
