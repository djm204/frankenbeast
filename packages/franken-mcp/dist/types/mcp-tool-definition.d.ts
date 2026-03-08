import type { McpToolConstraints } from "./mcp-tool-constraints.js";
/** A tool discovered from an MCP server, enriched with Frankenbeast constraints. */
export interface McpToolDefinition {
    /** Tool name as reported by the MCP server. */
    name: string;
    /** ID of the MCP server that owns this tool. */
    serverId: string;
    /** Human-readable description of what the tool does. */
    description: string;
    /** JSON Schema defining the tool's input parameters. */
    inputSchema: Record<string, unknown>;
    /** Merged constraints (module defaults < server config < per-tool override). */
    constraints: McpToolConstraints;
}
