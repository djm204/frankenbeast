# franken-mcp Ramp-Up

MCP (Model Context Protocol) client module for the Frankenbeast framework. Manages stdio-based MCP server connections, tool discovery, tool invocation, and applies Frankenbeast-specific safety constraints to every tool.

## Directory Structure

```
src/
  index.ts              # Public barrel exports
  types/
    mcp-tool-constraints.ts
    mcp-tool-definition.ts
    mcp-tool-result.ts
    mcp-server-info.ts
    mcp-registry-error.ts
    index.ts             # Internal barrel
    mcp-types.test.ts
  client/
    json-rpc.ts          # JSON-RPC 2.0 message builders/parser/serializer
    mcp-client.ts        # Core client: connect, listTools, callTool, disconnect
    json-rpc.test.ts
    mcp-client.test.ts
  config/
    config-schema.ts     # Zod schema for MCP config JSON
    load-config.ts       # Reads + validates config file
    resolve-constraints.ts  # 3-layer constraint merge
    load-config.test.ts
    resolve-constraints.test.ts
  transport/
    i-mcp-transport.ts   # Transport interface
    stdio-transport.ts   # Stdio implementation (spawn child process)
    stdio-transport.test.ts
```

## Public API (from src/index.ts)

**Type exports:** `McpToolConstraints`, `McpToolDefinition`, `McpToolResult`, `McpContent`, `McpServerInfo`, `McpRegistryErrorCode`

**Class export:** `McpRegistryError`

Not yet re-exported (internal use): `McpClient`, `StdioTransport`, `loadConfig`, `resolveConstraints`, JSON-RPC utilities.

## Key Types

**McpToolConstraints** -- safety flags applied to every tool:
- `is_destructive: boolean` -- can cause irreversible changes
- `requires_hitl: boolean` -- needs human approval
- `sandbox_type: "DOCKER" | "WASM" | "LOCAL"`

**McpToolDefinition** -- tool discovered from an MCP server:
- `name`, `serverId`, `description: string`
- `inputSchema: Record<string, unknown>` (JSON Schema)
- `constraints: McpToolConstraints`

**McpToolResult** -- result of `tools/call`:
- `content: McpContent[]` -- union of `{type:"text",text}`, `{type:"image",data,mimeType}`, `{type:"resource_link",uri}`
- `isError: boolean`

**McpServerInfo** -- server connection metadata:
- `id`, `status: "connected"|"disconnected"|"error"`, `toolCount`
- `serverInfo?: {name, version}`

## McpRegistryError

Extends `Error`. Fields: `code: McpRegistryErrorCode`, `serverId?: string`, `toolName?: string`.

Error codes: `CONFIG_INVALID`, `CONFIG_NOT_FOUND`, `SERVER_SPAWN_FAILED`, `INIT_FAILED`, `TOOL_NOT_FOUND`, `CALL_FAILED`, `SERVER_DISCONNECTED`, `DUPLICATE_TOOL`.

## How It Works

1. **Config** -- `loadConfig(path)` reads a JSON file validated by Zod. Schema: `{ servers: Record<string, ServerConfig> }`. Each `ServerConfig` has `command`, `args`, optional `env`, `initTimeoutMs`, `callTimeoutMs`, `constraints`, `toolOverrides`.

2. **Transport** -- `StdioTransport` implements `IMcpTransport`. Spawns a child process, communicates via newline-delimited JSON-RPC 2.0 over stdin/stdout. Graceful shutdown: SIGTERM then SIGKILL after 5s.

3. **Client** -- `McpClient(serverId, transport, config)`:
   - `connect()` -- spawns transport, sends `initialize` request (protocol `2024-11-05`), waits for response, sends `notifications/initialized`.
   - `listTools()` -- sends `tools/list`, maps response to `McpToolDefinition[]` with merged constraints.
   - `callTool(name, args)` -- sends `tools/call`, returns `McpToolResult`.
   - `disconnect()` -- rejects pending requests, closes transport.

4. **Constraint resolution** -- 3-layer merge: module defaults (`is_destructive:true, requires_hitl:true, sandbox_type:"DOCKER"`) < server-level config < per-tool override. Uses object spread.

## Build & Test

```bash
npm run build        # tsc
npm test             # vitest run
npm run test:watch   # vitest
npm run test:coverage
```

## Dependencies

- **zod** `^3.23.0` -- config schema validation
- **vitest** `^4.0.18` -- test runner (dev)
- **typescript** `^5.9.3` (dev)
- Node >= 20
