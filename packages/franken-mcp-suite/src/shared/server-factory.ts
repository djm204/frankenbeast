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
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface FbeastMcpServer {
  name: string;
  tools: ToolDef[];
  /** Invoke a tool through the same validation gate the MCP CallTool path uses. */
  callTool(name: string, args: unknown): Promise<ToolResult>;
  start(): Promise<void>;
}

export function validateToolArguments(
  tool: ToolDef,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, message: `Tool ${tool.name} expects an object argument` };
  }
  const obj = args as Record<string, unknown>;
  const schema = tool.inputSchema;
  for (const req of schema.required ?? []) {
    if (!(req in obj) || obj[req] === undefined) {
      return { ok: false, message: `Tool ${tool.name} missing required property: ${req}` };
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      return { ok: false, message: `Tool ${tool.name} received unknown property: ${key}` };
    }
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (prop.type === 'integer' ? !Number.isInteger(value) : actual !== prop.type) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be ${prop.type}` };
    }
  }
  return { ok: true, value: obj };
}

async function dispatchTool(
  toolMap: Map<string, ToolDef>,
  toolName: string,
  args: unknown,
): Promise<ToolResult> {
  const tool = toolMap.get(toolName);
  if (!tool) {
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }], isError: true };
  }
  const validated = validateToolArguments(tool, args ?? {});
  if (!validated.ok) {
    return { content: [{ type: 'text' as const, text: `Error: ${validated.message}` }], isError: true };
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
    return { ...(await dispatchTool(toolMap, toolName, args)) };
  });

  return {
    name,
    tools,
    callTool: (toolName, args) => dispatchTool(toolMap, toolName, args),
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
