export type McpRegistryErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_NOT_FOUND"
  | "SERVER_SPAWN_FAILED"
  | "INIT_FAILED"
  | "TOOL_NOT_FOUND"
  | "CALL_FAILED"
  | "SERVER_DISCONNECTED"
  | "DUPLICATE_TOOL";

export class McpRegistryError extends Error {
  readonly code: McpRegistryErrorCode;
  readonly serverId?: string | undefined;
  readonly toolName?: string | undefined;

  constructor(
    code: McpRegistryErrorCode,
    message: string,
    serverId?: string,
    toolName?: string,
  ) {
    super(message);
    this.name = "McpRegistryError";
    this.code = code;
    this.serverId = serverId;
    this.toolName = toolName;
  }
}
