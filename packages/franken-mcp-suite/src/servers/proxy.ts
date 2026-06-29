#!/usr/bin/env node
import { auditMcpToolExecution, createMcpServer, validateToolArguments, type FbeastMcpServer, type ToolDef, type ToolResult } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { searchTools, TOOL_REGISTRY, createAdapterSet, type AdapterSet } from '../shared/tool-registry.js';
import { parseArgs } from 'node:util';

export function createProxyServer(deps: { dbPath: string }): FbeastMcpServer {
  const { dbPath } = deps;
  let cachedAdapters: AdapterSet | undefined;

  function getAdapters(): AdapterSet {
    if (!cachedAdapters) {
      cachedAdapters = createAdapterSet(dbPath);
    }
    return cachedAdapters;
  }

  const getCachedObserver = () => cachedAdapters?.observer;

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
        const entry = TOOL_REGISTRY.get(toolName);
        if (!entry) {
          await auditMcpToolExecution({ getObserver: getCachedObserver, serverName: 'fbeast-proxy-target' }, 'mcp_tool_validation_failure', toolName, toolArgs, {
            reason: 'unknown_tool',
            message: `Unknown tool: ${toolName}`,
            via: 'proxy.execute_tool',
          });
          return {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}. Call search_tools to list available tools.` }],
            isError: true,
          };
        }
        const validated = validateToolArguments(entry, toolArgs);
        if (!validated.ok) {
          await auditMcpToolExecution({ getObserver: getCachedObserver, serverName: 'fbeast-proxy-target' }, 'mcp_tool_validation_failure', toolName, toolArgs, {
            reason: 'invalid_arguments',
            message: validated.message,
            via: 'proxy.execute_tool',
          });
          return { content: [{ type: 'text', text: `Error: ${validated.message}` }], isError: true };
        }
        const adapters = getAdapters();
        await auditMcpToolExecution({ observer: adapters.observer, serverName: 'fbeast-proxy-target' }, 'mcp_tool_call', toolName, validated.value, {
          decision: 'validated',
          via: 'proxy.execute_tool',
        });
        const handler = entry.makeHandler(adapters);
        try {
          const result = await handler(validated.value) as ToolResult;
          await auditMcpToolExecution({ observer: adapters.observer, serverName: 'fbeast-proxy-target' }, 'mcp_tool_result', toolName, validated.value, {
            ok: !result.isError,
            via: 'proxy.execute_tool',
          });
          return result;
        } catch (err) {
          await auditMcpToolExecution({ observer: adapters.observer, serverName: 'fbeast-proxy-target' }, 'mcp_tool_result', toolName, validated.value, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            via: 'proxy.execute_tool',
          });
          throw err;
        }
      },
    },
  ];

  return createMcpServer('fbeast-proxy', '0.1.0', tools, { getObserver: () => getAdapters().observer });
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
