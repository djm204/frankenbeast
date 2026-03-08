export type McpRegistryErrorCode = "CONFIG_INVALID" | "CONFIG_NOT_FOUND" | "SERVER_SPAWN_FAILED" | "INIT_FAILED" | "TOOL_NOT_FOUND" | "CALL_FAILED" | "SERVER_DISCONNECTED" | "DUPLICATE_TOOL";
export declare class McpRegistryError extends Error {
    readonly code: McpRegistryErrorCode;
    readonly serverId?: string | undefined;
    readonly toolName?: string | undefined;
    constructor(code: McpRegistryErrorCode, message: string, serverId?: string, toolName?: string);
}
