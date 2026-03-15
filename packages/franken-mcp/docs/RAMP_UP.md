# franken-mcp Ramp-Up

**Status**: **GHOST (Modular)** — This module provides the MCP (Model Context Protocol) client for Frankenbeast. It is fully implemented and tested but not yet wired into the main CLI execution loop.

## Module Overview
`franken-mcp` allows the agent to connect to external tool servers using the MCP standard. It handles JSON-RPC 2.0 communication over stdio and maps discovered tools into the Frankenbeast safety constraint system.

## Current Functionality
- **Stdio Transport**: Spawns and communicates with MCP servers as child processes.
- **Tool Discovery**: Automatically lists and validates capabilities from connected servers.
- **Constraint Resolution**: Applies a 3-layer safety merge (Global Default < Server Config < Tool Override).
- **JSON-RPC Client**: Full implementation of the MCP 2024-11-05 protocol.

## Integration Status
Currently used as a standalone library or in specialized test suites. **Next Steps**: Wire this into the `BeastLoop` via the `franken-skills` registry to allow the agent to use external tools (like filesystem access, web search, or database queries) securely.

## Key API
- `McpClient`: Manages the connection and tool calls for a single server.
- `StdioTransport`: The default transport implementation.
- `McpToolConstraints`: The safety schema (`is_destructive`, `requires_hitl`, `sandbox_type`).

## Build & Test
```bash
npm run build        # tsc
npm test             # vitest run (unit)
npm run test:watch   # vitest (watch mode)
```

## Dependencies
- `zod`: For config and message validation.
- Node >= 20.
