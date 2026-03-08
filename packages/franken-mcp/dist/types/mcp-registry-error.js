export class McpRegistryError extends Error {
    code;
    serverId;
    toolName;
    constructor(code, message, serverId, toolName) {
        super(message);
        this.name = "McpRegistryError";
        this.code = code;
        this.serverId = serverId;
        this.toolName = toolName;
    }
}
