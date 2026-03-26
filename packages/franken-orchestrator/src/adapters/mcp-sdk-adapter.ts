import type { IMcpModule, McpToolCallResult, McpToolInfo } from '../deps.js';

/**
 * Adapts MCP SDK clients to the IMcpModule port.
 * v1: placeholder that delegates to provider-native MCP support.
 * Real MCP SDK integration deferred until @modelcontextprotocol/sdk
 * is used directly.
 */
export class McpSdkAdapter implements IMcpModule {
  private readonly tools: McpToolInfo[];

  constructor(tools: McpToolInfo[] = []) {
    this.tools = tools;
  }

  async callTool(name: string, args: unknown): Promise<McpToolCallResult> {
    // In v1, MCP tool calls go through the CLI provider's native MCP support
    // (--mcp-config for Claude, codex mcp add for Codex, settings.json for Gemini).
    // Direct SDK-based MCP calls are a future enhancement.
    return {
      content: `MCP tool ${name} called with args: ${JSON.stringify(args)}`,
      isError: false,
    };
  }

  getAvailableTools(): readonly McpToolInfo[] {
    return this.tools;
  }
}
