import type { IMcpTransport } from "../transport/i-mcp-transport.js";
import type { ServerConfig } from "../config/config-schema.js";
import type { McpToolDefinition } from "../types/mcp-tool-definition.js";
import type { McpToolResult } from "../types/mcp-tool-result.js";
export declare class McpClient {
    readonly serverId: string;
    private transport;
    private config;
    private requestId;
    private pendingRequests;
    private status;
    private mcpServerInfo?;
    private tools;
    constructor(serverId: string, transport: IMcpTransport, config: ServerConfig);
    connect(): Promise<void>;
    listTools(): Promise<McpToolDefinition[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
    disconnect(): Promise<void>;
    getStatus(): "connected" | "disconnected" | "error";
    getServerInfo(): {
        name: string;
        version: string;
    } | undefined;
    getTools(): McpToolDefinition[];
    private sendRequest;
    private handleMessage;
    private rejectAllPending;
}
