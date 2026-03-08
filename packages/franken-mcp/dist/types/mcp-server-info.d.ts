/** Status and metadata for a connected MCP server. */
export interface McpServerInfo {
    /** Server ID from the config file key. */
    id: string;
    /** Current connection status. */
    status: "connected" | "disconnected" | "error";
    /** Number of tools discovered from this server. */
    toolCount: number;
    /** Server-reported identity from the initialize response. */
    serverInfo?: {
        name: string;
        version: string;
    };
}
