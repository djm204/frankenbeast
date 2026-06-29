import type { IMcpModule, McpToolCallResult, McpToolInfo } from '../deps.js';

/**
 * Adapts MCP SDK clients to the IMcpModule port.
 * Direct SDK-based MCP calls are not wired here yet; this adapter intentionally
 * fails closed instead of reporting synthetic success.
 */
export class McpSdkAdapter implements IMcpModule {
  private readonly tools: McpToolInfo[];

  constructor(tools: McpToolInfo[] = []) {
    this.tools = tools;
  }

  async callTool(name: string, args: unknown, serverId?: string | undefined): Promise<McpToolCallResult> {
    void args;
    void serverId;
    throw new Error(
      `MCP tool '${name}' is not reachable through McpSdkAdapter: no MCP SDK client/server transport is configured. ` +
        'Configure an IMcpModule implementation with a live MCP client, or route this skill through a CLI/provider path that supports MCP.',
    );
  }

  getAvailableTools(): readonly McpToolInfo[] {
    return this.tools;
  }
}
