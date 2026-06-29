import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
import type { ObserverAdapter } from '../adapters/observer-adapter.js';

export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; enum?: readonly unknown[] }>;
  required?: string[];
}

export interface ToolSchemaDef {
  name: string;
  inputSchema: ToolInputSchema;
}

export interface ToolDef extends ToolSchemaDef {
  description: string;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface FbeastMcpServer {
  name: string;
  tools: ToolDef[];
  /** Invoke a tool through the same validation gate the MCP CallTool path uses. */
  callTool(name: string, args: unknown): Promise<ToolResult>;
  start(): Promise<void>;
}

export interface AuditOptions {
  observer?: ObserverAdapter | undefined;
  getObserver?: (() => ObserverAdapter | undefined) | undefined;
  sessionId?: string;
}

export function validateToolArguments(
  tool: ToolSchemaDef,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, message: `Tool ${tool.name} expects an object argument` };
  }
  const obj = args as Record<string, unknown>;
  const schema = tool.inputSchema;
  for (const req of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(obj, req) || obj[req] === undefined) {
      return { ok: false, message: `Tool ${tool.name} missing required property: ${req}` };
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      return { ok: false, message: `Tool ${tool.name} received unknown property: ${key}` };
    }
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (prop.type === 'integer' ? !Number.isInteger(value) : actual !== prop.type) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be ${prop.type}` };
    }
    if (prop.type === 'number' && !Number.isFinite(value)) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be a finite number` };
    }
    if (prop.enum && !prop.enum.includes(value)) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be one of: ${prop.enum.join(', ')}` };
    }
  }
  return { ok: true, value: obj };
}

async function dispatchTool(
  toolMap: Map<string, ToolDef>,
  toolName: string,
  args: unknown,
  audit?: AuditOptions & { serverName: string },
): Promise<ToolResult> {
  const startedAt = Date.now();
  const tool = toolMap.get(toolName);
  if (!tool) {
    await auditToolEvent(audit, 'mcp_tool_validation_failure', toolName, args, {
      reason: 'unknown_tool',
      message: `Unknown tool: ${toolName}`,
    });
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }], isError: true };
  }
  // Only an *absent* argument object defaults to {}; an explicit `null` (or any
  // non-object) on the wire must reach the validator and be rejected.
  const validated = validateToolArguments(tool, args === undefined ? {} : args);
  if (!validated.ok) {
    await auditToolEvent(audit, 'mcp_tool_validation_failure', toolName, args, {
      reason: 'invalid_arguments',
      message: validated.message,
    });
    return { content: [{ type: 'text' as const, text: `Error: ${validated.message}` }], isError: true };
  }
  await auditToolEvent(audit, 'mcp_tool_call', toolName, validated.value, {
    decision: 'validated',
  });
  try {
    const result = await tool.handler(validated.value);
    try {
      await auditToolEvent(audit, 'mcp_tool_result', toolName, validated.value, {
        ok: !result.isError,
        durationMs: Date.now() - startedAt,
        outputSummary: summarizeResult(result),
        outputHash: hashJson(result),
      });
    } catch {
      // Audit persistence must not turn an otherwise successful tool call into an error.
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await auditToolEvent(audit, 'mcp_tool_result', toolName, validated.value, {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    } catch {
      // Preserve the tool handler failure instead of replacing it with an audit failure.
    }
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
}

export function createMcpServer(
  name: string,
  version: string,
  tools: ToolDef[],
  audit?: AuditOptions,
): FbeastMcpServer {
  const server = new Server({ name, version }, { capabilities: { tools: {} } });
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<Record<string, unknown>> => {
    const { name: toolName, arguments: args } = request.params;
    return { ...(await dispatchTool(toolMap, toolName, args, { ...audit, serverName: name })) };
  });

  return {
    name,
    tools,
    callTool: (toolName, args) => dispatchTool(toolMap, toolName, args, { ...audit, serverName: name }),
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}

export async function auditMcpToolExecution(
  audit: (AuditOptions & { serverName: string }) | undefined,
  event: string,
  toolName: string,
  args: unknown,
  extra: Record<string, unknown>,
): Promise<void> {
  const observer = audit?.observer ?? audit?.getObserver?.();
  const serverName = audit?.serverName;
  if (!observer || !serverName) return;
  const auditedArgs = args === undefined ? {} : args;

  await observer.log({
    event,
    sessionId: audit?.sessionId ?? `mcp:${serverName}`,
    metadata: JSON.stringify({
      server: serverName,
      tool: toolName,
      inputHash: hashJson(auditedArgs),
      inputSummary: summarizeInput(auditedArgs),
      ...extra,
    }),
  });
}

async function auditToolEvent(
  audit: (AuditOptions & { serverName: string }) | undefined,
  event: string,
  toolName: string,
  args: unknown,
  extra: Record<string, unknown>,
): Promise<void> {
  await auditMcpToolExecution(audit, event, toolName, args, extra);
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(',')}}`;
}

function summarizeInput(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: Array.isArray(value) ? 'array' : typeof value };
  }
  return { kind: 'object', keys: Object.keys(value as Record<string, unknown>).sort() };
}

function summarizeResult(result: ToolResult): Record<string, unknown> {
  return {
    contentItems: result.content.length,
    textBytes: result.content.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0),
    isError: result.isError === true,
  };
}
