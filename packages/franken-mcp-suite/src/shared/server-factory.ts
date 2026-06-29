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

/**
 * Best-effort, server-side audit sink invoked after every dispatched tool call
 * (success or failure). Mirrors the post-tool hook's observer logging so the
 * central dispatch path produces an audit record even when client hooks are
 * absent (see ADR-035). Audit failures never fail the tool call.
 */
export interface AuditSink {
  record(input: {
    tool: string;
    ok: boolean;
    /**
     * Outcome classifier when the call did not run to a normal handler result:
     * the governance decision (`denied`/`review_recommended`) for a blocked
     * call, or `error` for a fail-closed gate error. Omitted for handler runs.
     */
    decision?: string;
    /** Validated call arguments, so the trail records *what* was attempted. */
    args?: Record<string, unknown>;
  }): Promise<void> | void;
}

export interface CreateMcpServerOptions {
  /**
   * When set, every tool call dispatched through this server is checked by the
   * gate after argument validation and before the handler runs. Any decision
   * other than `approved` short-circuits the handler (matching the hook path's
   * fail-closed enforcement); a gate error also fails closed (denied).
   */
  governance?: GovernanceGate;
  /**
   * When set, each dispatched tool call is recorded after the handler runs,
   * giving the central path a server-side audit trail independent of hooks.
   */
  audit?: AuditSink;
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
  options: CreateMcpServerOptions = {},
): Promise<ToolResult> {
  const { governance, audit } = options;
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
  // Best-effort server-side audit (never fails the tool call). Records the
  // validated args so the trail captures *what* was attempted — including
  // governance denials, the highest-risk events to reconstruct.
  const recordAudit = async (input: {
    ok: boolean;
    decision?: string;
  }): Promise<void> => {
    if (!audit) return;
    try {
      await audit.record({ tool: toolName, ok: input.ok, ...(input.decision !== undefined ? { decision: input.decision } : {}), args: validated.value });
    } catch (err) {
      process.stderr.write(`fbeast audit failed for ${toolName}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  };
  // Central governance gate: enforced server-side regardless of client hooks.
  // Fails closed — any non-`approved` decision (denied OR review_recommended)
  // or a gate error blocks the handler, matching the hook path's enforcement
  // (`cli/hook.ts` rejects every decision other than `approved`).
  if (governance) {
    let decision: GovernanceDecision;
    try {
      decision = await governance.check({ tool: toolName, args: validated.value });
    } catch (err) {
      await recordAudit({ ok: false, decision: 'error' });
      return {
        content: [{ type: 'text' as const, text: `Denied by governance (fail-closed): ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
    if (decision.decision !== 'approved') {
      await recordAudit({ ok: false, decision: decision.decision });
      return {
        content: [{ type: 'text' as const, text: `Denied by governance (${decision.decision}): ${decision.reason}` }],
        isError: true,
      };
    }
  }
  let result: ToolResult;
  try {
    result = await tool.handler(validated.value);
  } catch (err) {
    result = {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
  await recordAudit({ ok: !result.isError });
  return result;
}

export function createMcpServer(
  name: string,
  version: string,
  tools: ToolDef[],
  options: CreateMcpServerOptions = {},
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
    return { ...(await dispatchTool(toolMap, toolName, args, options)) };
  });

  return {
    name,
    tools,
    callTool: (toolName, args) => dispatchTool(toolMap, toolName, args, options),
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
