# franken-mcp Design Document

**Date:** 2026-03-04
**Module:** `franken-mcp` (`@franken/mcp`)
**Status:** Approved

## Purpose

franken-mcp is a standalone MCP (Model Context Protocol) server registry for Frankenbeast. It manages persistent connections to MCP servers via stdio transport, discovers their tools, and exposes a clean interface for calling those tools. It is infrastructure — designed to be consumed by workflows, skills, and other modules that need to interact with external tools (VSCode, filesystem, databases, etc.).

MCP servers are **not** skills. They are the execution substrate that skills and workflows leverage for deterministic interaction with the environment.

## Integration with Existing Ecosystem

Frankenbeast is a mature project with 10 modules, 1,572 tests, and 7 completed phases. franken-mcp is the 11th module. It follows established patterns:

- **Separate git repository** — like all other modules (franken-brain, franken-skills, etc.)
- **Port/adapter architecture** — `IMcpRegistry` is the public port; internals are not exported
- **Shared types** — imports from `@franken/types` where applicable (branded IDs, Result monad)
- **Dependency injection** — all config via constructor args, fully testable with mocks
- **Strict TypeScript** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022 target, NodeNext modules
- **Vitest ^4.0.18** — matching root project versions
- **Zod validation** at config boundaries

The module is consumed by the orchestrator (`franken-orchestrator`) during Phase 3 (Execution) and by future workflow managers. It does **not** depend on any other Frankenbeast module — it is a leaf dependency.

## Architecture Overview

```mermaid
graph TB
    subgraph "franken-mcp"
        direction TB

        CFG["Config Loader<br/>Zod-validated mcp-servers.json"]

        subgraph "Registry Layer"
            REG["McpRegistry<br/>IMcpRegistry implementation<br/>Tool → Client routing map"]
        end

        subgraph "Client Layer"
            C1["McpClient<br/>Server: vscode"]
            C2["McpClient<br/>Server: filesystem"]
            CN["McpClient<br/>Server: ..."]
        end

        subgraph "Transport Layer"
            T1["StdioTransport<br/>child_process.spawn"]
            T2["StdioTransport<br/>child_process.spawn"]
            TN["StdioTransport<br/>child_process.spawn"]
        end

        JSONRPC["JSON-RPC 2.0<br/>Message Builder + Parser"]

        CFG --> REG
        REG --> C1
        REG --> C2
        REG --> CN
        C1 --> T1
        C2 --> T2
        CN --> TN
        C1 --> JSONRPC
        C2 --> JSONRPC
        CN --> JSONRPC
    end

    subgraph "External Processes"
        VS["VSCode MCP Server"]
        FS["Filesystem MCP Server"]
        OT["Other MCP Server"]
    end

    T1 -- "stdin/stdout" --> VS
    T2 -- "stdin/stdout" --> FS
    TN -- "stdin/stdout" --> OT

    WF["Workflows / Skills / Orchestrator"]
    WF --> REG

    classDef registry fill:#54a0ff,stroke:#2e86de,color:#fff
    classDef client fill:#ff9f43,stroke:#ee5a24,color:#fff
    classDef transport fill:#10ac84,stroke:#0a3d62,color:#fff
    classDef external fill:#dfe6e9,stroke:#636e72,color:#333
    classDef config fill:#f368e0,stroke:#c44569,color:#fff
    classDef consumer fill:#feca57,stroke:#f6b93b,color:#333

    class REG registry
    class C1,C2,CN client
    class T1,T2,TN transport
    class VS,FS,OT external
    class CFG config
    class WF consumer
```

## Data Flow

### sync() — Startup Sequence

```mermaid
sequenceDiagram
    participant Consumer
    participant Registry as McpRegistry
    participant Config as ConfigLoader
    participant Client as McpClient (per server)
    participant Transport as StdioTransport
    participant Server as MCP Server Process

    Consumer->>Registry: sync()
    Registry->>Config: loadConfig("mcp-servers.json")
    Config-->>Registry: validated config

    par For each configured server
        Registry->>Client: connect()
        Client->>Transport: spawn(command, args, env)
        Transport->>Server: child_process.spawn()

        Client->>Server: initialize request (JSON-RPC)
        Server-->>Client: initialize response (capabilities, serverInfo)
        Client->>Server: notifications/initialized

        Client->>Server: tools/list request
        Server-->>Client: tools list response
        Client-->>Registry: McpToolDefinition[] (with merged constraints)
    end

    Registry->>Registry: Build tool→client routing map
    Registry-->>Consumer: sync() resolved
```

### callTool() — Execution Flow

```mermaid
sequenceDiagram
    participant Consumer
    participant Registry as McpRegistry
    participant Client as McpClient
    participant Transport as StdioTransport
    participant Server as MCP Server Process

    Consumer->>Registry: callTool("read_file", { path: "/foo" })
    Registry->>Registry: Lookup tool → find owning client
    Registry->>Client: callTool("read_file", { path: "/foo" })
    Client->>Transport: write JSON-RPC tools/call request
    Transport->>Server: stdin write
    Server-->>Transport: stdout response
    Transport-->>Client: parsed JSON-RPC response
    Client-->>Registry: McpToolResult
    Registry-->>Consumer: McpToolResult
```

### shutdown() — Cleanup Flow

```mermaid
sequenceDiagram
    participant Consumer
    participant Registry as McpRegistry
    participant Client as McpClient (each)
    participant Transport as StdioTransport
    participant Server as MCP Server Process

    Consumer->>Registry: shutdown()

    par For each connected server
        Registry->>Client: disconnect()
        Client->>Transport: close()
        Transport->>Server: SIGTERM

        alt Server exits within 5s
            Server-->>Transport: exit event
        else Server doesn't exit
            Transport->>Server: SIGKILL
        end

        Transport-->>Client: closed
        Client-->>Registry: disconnected
    end

    Registry-->>Consumer: shutdown() resolved
```

## Entity Relationship Diagram

```mermaid
erDiagram
    McpConfig ||--o{ ServerConfig : contains
    ServerConfig ||--o{ ToolOverride : "may have"
    ServerConfig ||--|| ServerConstraints : "has defaults"
    ToolOverride ||--|| ToolConstraints : overrides

    McpRegistry ||--o{ McpClient : manages
    McpClient ||--|| StdioTransport : uses
    McpClient ||--o{ McpToolDefinition : discovers

    McpToolDefinition ||--|| McpToolConstraints : "has merged"
    McpRegistry ||--o{ McpToolDefinition : "routes to"

    McpConfig {
        object servers "Server definitions keyed by ID"
    }

    ServerConfig {
        string command "Executable path"
        string[] args "Command arguments"
        object env "Environment variables"
        number initTimeoutMs "Handshake timeout (default 10000)"
        number callTimeoutMs "Tool call timeout (default 30000)"
        object constraints "Default constraints for all tools"
        object toolOverrides "Per-tool constraint overrides"
    }

    ServerConstraints {
        boolean is_destructive "Default true"
        boolean requires_hitl "Default true"
        string sandbox_type "Default DOCKER"
    }

    ToolOverride {
        string toolName "MCP tool name"
        object constraints "Override constraints"
    }

    ToolConstraints {
        boolean is_destructive "Optional override"
        boolean requires_hitl "Optional override"
        string sandbox_type "Optional override"
    }

    McpRegistry {
        Map toolMap "toolName → client+tool"
        boolean synced "Whether sync() completed"
    }

    McpClient {
        string serverId "Config key"
        string status "connected|disconnected|error"
        object serverInfo "name + version from init"
    }

    StdioTransport {
        ChildProcess process "Spawned MCP server"
        number pid "Process ID"
    }

    McpToolDefinition {
        string name "Tool name from MCP"
        string serverId "Owning server"
        string description "Tool description"
        object inputSchema "JSON Schema for params"
        object constraints "Merged constraints"
    }

    McpToolConstraints {
        boolean is_destructive "Merged value"
        boolean requires_hitl "Merged value"
        string sandbox_type "Merged value"
    }
```

## Configuration

### mcp-servers.json

Located at project root. Validated with Zod on load.

```json
{
  "servers": {
    "vscode": {
      "command": "node",
      "args": ["./vscode-mcp-server/index.js"],
      "env": { "VSCODE_PORT": "3000" },
      "initTimeoutMs": 10000,
      "callTimeoutMs": 30000,
      "constraints": {
        "is_destructive": true,
        "requires_hitl": true,
        "sandbox_type": "LOCAL"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/home/user/project"],
      "constraints": {
        "is_destructive": false,
        "requires_hitl": false,
        "sandbox_type": "LOCAL"
      },
      "toolOverrides": {
        "write_file": {
          "constraints": { "is_destructive": true, "requires_hitl": true }
        }
      }
    }
  }
}
```

### Constraint Resolution Order

1. Per-tool override in `toolOverrides` (highest priority)
2. Server-level `constraints` defaults
3. Module defaults: `{ is_destructive: true, requires_hitl: true, sandbox_type: "DOCKER" }` (most conservative)

## Public API

### Interfaces

```typescript
interface IMcpRegistry {
  sync(): Promise<void>;
  isSynced(): boolean;
  getServers(): McpServerInfo[];
  getTools(): McpToolDefinition[];
  getToolsForServer(serverId: string): McpToolDefinition[];
  hasTool(toolName: string): boolean;
  callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult>;
  shutdown(): Promise<void>;
}

interface McpToolDefinition {
  name: string;
  serverId: string;
  description: string;
  inputSchema: Record<string, unknown>;
  constraints: McpToolConstraints;
}

interface McpToolConstraints {
  is_destructive: boolean;
  requires_hitl: boolean;
  sandbox_type: "DOCKER" | "WASM" | "LOCAL";
}

interface McpToolResult {
  content: McpContent[];
  isError: boolean;
}

type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string };

interface McpServerInfo {
  id: string;
  status: "connected" | "disconnected" | "error";
  toolCount: number;
  serverInfo?: { name: string; version: string };
}
```

### Factory Function

```typescript
interface McpRegistryConfig {
  configPath?: string;  // Default: process.cwd() + "/mcp-servers.json"
}

function createMcpRegistry(config?: McpRegistryConfig): IMcpRegistry;
```

### Exports

```typescript
// Types
export type { IMcpRegistry } from "./registry/i-mcp-registry.js";
export type { McpToolDefinition } from "./types/mcp-tool-definition.js";
export type { McpToolResult, McpContent } from "./types/mcp-tool-result.js";
export type { McpToolConstraints } from "./types/mcp-tool-constraints.js";
export type { McpServerInfo } from "./types/mcp-server-info.js";
export type { McpRegistryConfig } from "./registry/create-mcp-registry.js";

// Classes
export { McpRegistryError } from "./types/mcp-registry-error.js";

// Functions
export { createMcpRegistry } from "./registry/create-mcp-registry.js";
```

## Internal Components

### Transport Layer — StdioTransport

Port interface:

```typescript
interface IMcpTransport {
  spawn(command: string, args: string[], env?: Record<string, string>): void;
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: (code: number | null) => void): void;
  close(): Promise<void>;
  isAlive(): boolean;
}
```

Implementation uses `child_process.spawn` with `{ stdio: ['pipe', 'pipe', 'pipe'] }`. Reads stdout line-by-line, parses each line as JSON-RPC. Writes to stdin as newline-delimited JSON.

### Client Layer — McpClient

Manages one MCP server connection:

```typescript
class McpClient {
  constructor(serverId: string, transport: IMcpTransport, config: ServerConfig);

  async connect(): Promise<void>;        // spawn + initialize handshake
  async listTools(): Promise<McpToolDefinition[]>;  // tools/list
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  async disconnect(): Promise<void>;     // close transport

  getStatus(): "connected" | "disconnected" | "error";
  getServerInfo(): { name: string; version: string } | undefined;
}
```

Handles:
- JSON-RPC request ID generation and response correlation
- Initialize handshake (send `initialize`, wait for response, send `notifications/initialized`)
- `notifications/tools/list_changed` → automatic re-list
- Timeout enforcement per config

### JSON-RPC Layer

```typescript
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

function buildRequest(id: number, method: string, params?: Record<string, unknown>): JsonRpcRequest;
function buildNotification(method: string, params?: Record<string, unknown>): JsonRpcNotification;
function parseMessage(raw: string): JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
```

## Error Handling

| Code | When | Behavior |
|------|------|----------|
| `CONFIG_INVALID` | Zod validation fails on mcp-servers.json | Fatal — sync() throws |
| `CONFIG_NOT_FOUND` | mcp-servers.json doesn't exist | Non-fatal — sync() succeeds with 0 servers, logs warning |
| `SERVER_SPAWN_FAILED` | Child process fails to start | Non-fatal — skip server, log error, continue others |
| `INIT_FAILED` | MCP handshake fails or times out | Non-fatal — kill process, skip server, log error |
| `TOOL_NOT_FOUND` | callTool() for unknown tool name | Thrown — caller must handle |
| `CALL_FAILED` | tools/call returns isError or transport error | Thrown — includes original error content |
| `SERVER_DISCONNECTED` | Process exits unexpectedly | Marks server disconnected, subsequent calls throw |
| `DUPLICATE_TOOL` | Two servers expose same tool name | Non-fatal — first wins, log warning |

### Resilience

- **Partial startup**: If 3 servers configured and 1 fails, other 2 still work.
- **Timeouts**: `initTimeoutMs` (default 10s) and `callTimeoutMs` (default 30s), configurable per-server.
- **No auto-reconnect (v1)**: Dead server marked `"disconnected"`. Call `sync()` again to restart all.
- **Graceful shutdown**: SIGTERM → 5s wait → SIGKILL. Idempotent.

## Module Structure

```
franken-mcp/
├── src/
│   ├── config/
│   │   ├── config-schema.ts           # Zod schema for mcp-servers.json
│   │   ├── load-config.ts             # Read + validate config file
│   │   └── load-config.test.ts
│   ├── transport/
│   │   ├── i-mcp-transport.ts         # Port interface
│   │   ├── stdio-transport.ts         # child_process.spawn implementation
│   │   └── stdio-transport.test.ts
│   ├── client/
│   │   ├── mcp-client.ts             # Single server connection lifecycle
│   │   ├── json-rpc.ts               # Message builder + parser
│   │   ├── json-rpc.test.ts
│   │   └── mcp-client.test.ts
│   ├── registry/
│   │   ├── i-mcp-registry.ts         # Public interface
│   │   ├── mcp-registry.ts           # Connection pool + tool routing
│   │   ├── create-mcp-registry.ts    # Factory function
│   │   └── mcp-registry.test.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── mcp-tool-definition.ts
│   │   ├── mcp-tool-result.ts
│   │   ├── mcp-tool-constraints.ts
│   │   ├── mcp-server-info.ts
│   │   └── mcp-registry-error.ts
│   └── index.ts                      # Public exports
├── tests/
│   ├── fixtures/
│   │   ├── echo-server.ts            # Minimal MCP server for integration tests
│   │   ├── valid-config.json
│   │   └── invalid-config.json
│   └── integration/
│       └── mcp-registry.integration.test.ts
├── docs/adr/
│   ├── 0001-persistent-connection-pool.md
│   ├── 0002-stdio-transport-only-v1.md
│   ├── 0003-conservative-constraint-defaults.md
│   └── 0004-partial-startup-resilience.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Testing Strategy

### Unit Tests (mocked — no real processes)

| Area | Key Cases |
|------|-----------|
| Config | Valid JSON, invalid JSON, missing file, Zod failures, constraint merging, toolOverrides resolution |
| Transport | Mock child_process.spawn, verify stdin writes, stdout parsing, process exit/error events, timeout |
| JSON-RPC | Build requests/notifications, parse responses/errors, malformed messages, id correlation |
| Client | Mock transport, initialize handshake, tools/list parsing, tools/call routing, notification handling, timeout enforcement |
| Registry | Mock clients, tool routing map, duplicate tool names, partial server failure, shutdown lifecycle, sync guards |

### Integration Tests (real processes)

- **Echo MCP server fixture**: ~30 lines of Node.js that speaks JSON-RPC over stdio. Responds to `initialize`, `tools/list` (returns 2 test tools), `tools/call` (echoes args back).
- **Full flow**: spawn → initialize → list tools → call tool → verify result → shutdown
- **Process cleanup**: verify no orphan child processes after shutdown
- **Partial failure**: configure one real server + one bad command, verify partial startup

### Test Patterns

- Vitest with globals enabled
- `vi.fn()` mocks for all DI boundaries
- Mock factories: `makeTransport()`, `makeClient()`, `makeConfig()`
- Console spy pattern for log assertions
- No real I/O in unit tests
- Performance baseline: sync with 5 mock servers < 500ms

## Project Integration Checklist

When complete, franken-mcp must be wired into the existing project:

1. **Root `tsconfig.json`** — add `"@franken/mcp": ["./franken-mcp/src/index.ts"]` to paths
2. **Root `package.json`** — add `franken-mcp` to the build and test:all scripts
3. **`docs/ARCHITECTURE.md`** — add franken-mcp block to the Mermaid diagram, add to package table, add `IMcpRegistry` to port interfaces table
4. **`docs/CONTRACT_MATRIX.md`** — add `IMcpRegistry` port entry

## Future Considerations (Not In Scope)

- HTTP/SSE transport (v2)
- Auto-reconnect on server crash (v2)
- MCP resources and prompts support (v2)
- Tool change notification propagation to consumers (v2)
- Dashboard UI for config management (future workflow manager)
- Workflow manager — top-level lifecycle orchestration consuming MCP tools, skills, and LLMs
