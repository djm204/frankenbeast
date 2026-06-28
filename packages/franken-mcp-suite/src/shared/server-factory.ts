import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

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

export interface GovernanceDecision {
  decision: 'approved' | 'review_recommended' | 'denied';
  reason: string;
}

/**
 * Central, in-process governance gate consulted on every dispatched tool call.
 * This is the server-side enforcement point that does NOT depend on external
 * client hooks being installed (see ADR-038).
 */
export interface GovernanceGate {
  check(input: {
    tool: string;
    args: Record<string, unknown>;
  }): Promise<GovernanceDecision> | GovernanceDecision;
}

export interface CreateMcpServerOptions {
  /**
   * When set, every tool call dispatched through this server is checked by the
   * gate after argument validation and before the handler runs. A `denied`
   * decision short-circuits the handler; a gate error fails closed (denied).
   */
  governance?: GovernanceGate;
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
  governance?: GovernanceGate,
): Promise<ToolResult> {
  const tool = toolMap.get(toolName);
  if (!tool) {
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }], isError: true };
  }
  // Only an *absent* argument object defaults to {}; an explicit `null` (or any
  // non-object) on the wire must reach the validator and be rejected.
  const validated = validateToolArguments(tool, args === undefined ? {} : args);
  if (!validated.ok) {
    return { content: [{ type: 'text' as const, text: `Error: ${validated.message}` }], isError: true };
  }
  // Central governance gate: enforced server-side regardless of client hooks.
  // Fails closed — a denied decision or a gate error blocks the handler.
  if (governance) {
    let decision: GovernanceDecision;
    try {
      decision = await governance.check({ tool: toolName, args: validated.value });
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Denied by governance (fail-closed): ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
    if (decision.decision === 'denied') {
      return {
        content: [{ type: 'text' as const, text: `Denied by governance: ${decision.reason}` }],
        isError: true,
      };
    }
  }
  try {
    return await tool.handler(validated.value);
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

export function createMcpServer(
  name: string,
  version: string,
  tools: ToolDef[],
  options: CreateMcpServerOptions = {},
): FbeastMcpServer {
  const server = new Server({ name, version }, { capabilities: { tools: {} } });
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const { governance } = options;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<Record<string, unknown>> => {
    const { name: toolName, arguments: args } = request.params;
    return { ...(await dispatchTool(toolMap, toolName, args, governance)) };
  });

  return {
    name,
    tools,
    callTool: (toolName, args) => dispatchTool(toolMap, toolName, args, governance),
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
