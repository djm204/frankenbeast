#!/usr/bin/env node
import { createMcpServer, sanitizeToolArgumentsForAudit, validateToolArguments, type AuditSink, type FbeastMcpServer, type GovernanceGate, type ToolDef, type ToolResult } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { searchTools, TOOL_REGISTRY, createAdapterSet, type AdapterSet } from '../shared/tool-registry.js';
import { createGovernanceGate } from '../shared/governance-gate.js';
import { createAuditSink } from '../shared/central-enforcement.js';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { deriveProjectRootFromDbPath, resolveProjectDbPath } from '../shared/resolve-db-path.js';

export function deriveProxyRoot(dbPath: string, explicitRoot?: string | undefined): string | undefined {
  return deriveProjectRootFromDbPath(dbPath, explicitRoot);
}

export interface ProxyServerDeps {
  dbPath: string;
  /** Project root used to constrain filesystem-backed proxy tools. */
  root?: string | undefined;
  /** Active fbeast config path used by config-backed tools such as firewall scans. */
  configPath?: string | undefined;
  /** Governance gate applied to the *resolved* target tool (defaults to the dbPath-backed gate). */
  governance?: GovernanceGate;
  /** Server-side audit sink for resolved tool calls (defaults to the dbPath-backed observer). */
  audit?: AuditSink;
}

export function createProxyServer(deps: ProxyServerDeps): FbeastMcpServer {
  const root = deriveProxyRoot(deps.dbPath, deps.root);
  const dbPath = resolveProjectDbPath(deps.dbPath, root);
  let cachedAdapters: AdapterSet | undefined;
  // Govern/audit the *resolved* target tool, not the `execute_tool` wrapper, so
  // policy and audit are keyed by the real high-risk action (ADR-035, finding
  // round-1). The gate/observer are created lazily, preserving lazy-DB behavior.
  const governance = deps.governance ?? createGovernanceGate(dbPath);
  const audit = deps.audit ?? createAuditSink(dbPath);

  function getAdapters(): AdapterSet {
    if (!cachedAdapters) {
      cachedAdapters = createAdapterSet(dbPath, { root, configPath: deps.configPath });
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
        const lines = results.map((t) => {
          const schema = TOOL_REGISTRY.get(t.name)?.inputSchema;
          const schemaText = schema ? `\n  inputSchema: ${JSON.stringify(schema)}` : '';
          return `${t.name.padEnd(32)} ${t.description}${schemaText}`;
        });
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
            await audit.record({ tool: toolName, ok: input.ok, ...(input.decision !== undefined ? { decision: input.decision } : {}), args: sanitizeToolArgumentsForAudit(toolArgs) });
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

  // Governance/audit run inside the `execute_tool` handler against the resolved
  // target tool, so wrapper-level governance is intentionally omitted. But the
  // factory rejects malformed `execute_tool`/`search_tools` calls (missing or
  // non-object `args`, non-string `tool`, unknown tool) *before* the handler
  // runs, so those probes never reach the target-level audit. Wire a wrapper
  // audit that forwards ONLY those pre-handler rejections — keyed by their
  // `decision` (`validation_error`/`unknown_tool`) — so malformed proxy probes
  // are recorded without double-auditing successful calls (the handler already
  // audits the resolved target) or auditing read-only `search_tools` listings.
  const wrapperAudit: AuditSink = {
    record(event) {
      if (event.decision === 'validation_error' || event.decision === 'unknown_tool') {
        return audit.record(event);
      }
    },
  };
  return createMcpServer('fbeast-proxy', '0.1.0', tools, { audit: wrapperAudit });
}

// CLI entry point
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' }, root: { type: 'string' }, config: { type: 'string' } },
  });
  const server = createProxyServer({ dbPath: values['db']!, root: values['root'], configPath: values['config'] });
  server.start().catch((err) => {
    console.error('fbeast-proxy failed to start:', err);
    process.exit(1);
  });
}
