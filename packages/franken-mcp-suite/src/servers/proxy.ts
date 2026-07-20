#!/usr/bin/env node
import { createMcpServer, DEFAULT_TOOL_TIMEOUT_MS, executeToolWithDeadline, sanitizeRejectedToolArgumentsForAudit, summarizeProxyToolArgumentsForAudit, validateToolArguments, type AuditSink, type FbeastMcpServer, type GovernanceGate, type ToolDef } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { handleStartupFailure } from '../shared/shutdown.js';
import { searchTools, TOOL_REGISTRY, createAdapterSet, type AdapterSet } from '../shared/tool-registry.js';
import { createGovernanceGate } from '../shared/governance-gate.js';
import { createAuditSink } from '../shared/central-enforcement.js';
import { parseArgs } from 'node:util';
import { isAbsolute, resolve } from 'node:path';
import { deriveProjectRootFromDbPath, resolveProjectDbPath } from '../shared/resolve-db-path.js';

const PROJECT_ROOT_PLACEHOLDER = /^\$(?:\{(?:CLAUDE_PROJECT_DIR|GEMINI_PROJECT_ROOT|FBEAST_ROOT)\}|(?:CLAUDE_PROJECT_DIR|GEMINI_PROJECT_ROOT|FBEAST_ROOT))(?:[\\/]|$)/;

export function deriveProxyRoot(dbPath: string, explicitRoot?: string | undefined): string | undefined {
  return deriveProjectRootFromDbPath(dbPath, explicitRoot);
}

function resolveProxyConfigPath(configPath: string, root: string | undefined): string {
  if (root !== undefined && PROJECT_ROOT_PLACEHOLDER.test(configPath)) {
    return resolve(root, configPath.replace(PROJECT_ROOT_PLACEHOLDER, ''));
  }
  if (isAbsolute(configPath)) return configPath;
  return resolve(root ?? process.cwd(), configPath);
}

const WORKSPACE_ROOT_REQUIRED_TOOLS = new Set(['fbeast_firewall_scan_file']);

function protectedModeMessage(toolName: string): string {
  return [
    `Protected mode: refusing ${toolName} because the workspace root is unknown.`,
    'Start fbeast-proxy with --root /absolute/project/root or use a database path under <project>/.fbeast/beast.db so file-backed tools can be constrained to that project.',
  ].join(' ');
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
  const configPath = deps.configPath === undefined
    ? undefined
    : resolveProxyConfigPath(deps.configPath, root);
  const protectedMode = root === undefined;
  let cachedAdapters: AdapterSet | undefined;
  // Govern/audit the *resolved* target tool, not the `execute_tool` wrapper, so
  // policy and audit are keyed by the real high-risk action (ADR-035, finding
  // round-1). This is the Tool wrapper confusion control in
  // docs/agent-tool-execution-threat-model.md. The gate/observer are created
  // lazily, preserving lazy-DB behavior.
  const governance = deps.governance ?? createGovernanceGate(dbPath, configPath);
  const audit = deps.audit ?? createAuditSink(dbPath);
  // The proxy wrapper must outlive the longest registered target deadline; the
  // resolved target is independently bounded below by executeToolWithDeadline.
  const longestTargetTimeoutMs = [...TOOL_REGISTRY.values()].reduce(
    (longest, tool) => Math.max(longest, tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS),
    DEFAULT_TOOL_TIMEOUT_MS,
  );
  // Reserve a bounded 30-second budget for target validation, governance,
  // adapter setup, and audit so those proxy phases cannot consume a target's
  // own advertised execution deadline.
  const proxyExecutionTimeoutMs = longestTargetTimeoutMs + DEFAULT_TOOL_TIMEOUT_MS;

  function getAdapters(): AdapterSet {
    if (!cachedAdapters) {
      cachedAdapters = createAdapterSet(dbPath, { root, configPath });
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
      timeoutMs: proxyExecutionTimeoutMs,
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
        const recordAudit = async (
          input: { ok: boolean; decision?: string },
          argsForAudit: Record<string, unknown> = toolArgs,
        ): Promise<void> => {
          try {
            await audit.record({ tool: toolName, ok: input.ok, ...(input.decision !== undefined ? { decision: input.decision } : {}), args: summarizeProxyToolArgumentsForAudit(argsForAudit) });
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
        if (protectedMode && WORKSPACE_ROOT_REQUIRED_TOOLS.has(toolName)) {
          await recordAudit({ ok: false, decision: 'protected_mode' });
          return {
            content: [{ type: 'text', text: protectedModeMessage(toolName) }],
            isError: true,
          };
        }
        // Validate the resolved target's args before governing/running it.
        const validated = validateToolArguments(entry, toolArgs);
        if (!validated.ok) {
          await recordAudit(
            { ok: false, decision: 'validation_error' },
            sanitizeRejectedToolArgumentsForAudit(entry, toolArgs),
          );
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
        const targetTool: ToolDef = {
          name: entry.name,
          description: entry.description,
          inputSchema: entry.inputSchema,
          ...(entry.timeoutMs !== undefined ? { timeoutMs: entry.timeoutMs } : {}),
          handler: entry.makeHandler(adapters),
        };
        const execution = await executeToolWithDeadline(targetTool, validated.value);
        const result = execution.result;
        await recordAudit({
          ok: !result.isError,
          ...(execution.timedOut ? { decision: 'timeout' } : {}),
        });
        return result;
      },
    },
  ];

  // Governance/audit run inside the `execute_tool` handler against the resolved
  // target tool, so wrapper-level governance is intentionally omitted. But the
  // factory rejects malformed `execute_tool`/`search_tools` calls (missing or
  // non-object `args`, non-string `tool`, unknown tool) *before* the handler
  // runs, so those probes never reach the target-level audit. Wire a wrapper
  // audit that forwards pre-handler rejections and wrapper timeouts — keyed by
  // their `decision` — so malformed or stalled proxy attempts are recorded
  // without double-auditing successful calls (the handler already audits the
  // resolved target) or auditing read-only `search_tools` listings.
  const wrapperAudit: AuditSink = {
    record(event) {
      if (event.decision === 'validation_error' || event.decision === 'unknown_tool' || event.decision === 'timeout') {
        return audit.record(event);
      }
    },
    close() {
      audit.close?.();
    },
  };
  return createMcpServer('fbeast-proxy', '0.1.0', tools, {
    audit: wrapperAudit,
    onClose() {
      cachedAdapters?.observer.close?.();
    },
  });
}

// CLI entry point
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' }, root: { type: 'string' }, config: { type: 'string' } },
  });
  const server = createProxyServer({ dbPath: values['db']!, root: values['root'], configPath: values['config'] });
  server.start().catch((err) => {
    handleStartupFailure('fbeast-proxy', err);
  });
}
