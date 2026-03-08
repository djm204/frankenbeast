# Issue: `franken-mcp` Public API And Registry Story Are Incomplete

Severity: high
Area: `franken-mcp`

## Summary

The architecture describes `franken-mcp` as the MCP client and registry package, but the package currently exports only types and an error class, and there is no registry implementation.

## Intended Behavior

Consumers should be able to import the MCP client surface from the package root and use a registry abstraction that matches the architecture docs.

## Current Behavior

- `src/index.ts` exports types plus `McpRegistryError` only.
- The implementation files contain a usable `McpClient`, `StdioTransport`, and config helpers, but they are not exported from the package root.
- There is no `McpRegistry` implementation in `src/`.

## Evidence

- `docs/ARCHITECTURE.md:24-25`
- `docs/RAMP_UP.md:22-23`
- `franken-mcp/src/index.ts:1-9`
- `franken-mcp/src/client/mcp-client.ts:15-182`
- `franken-mcp/src/transport/stdio-transport.ts`
- `franken-mcp/src/config/load-config.ts`

## Impact

- The package cannot be consumed as advertised without deep imports.
- The "registry" portion of the architecture is not implemented.
- Orchestrator integration has no stable MCP package surface to depend on.

## Acceptance Criteria

- Export the supported client, transport, and config API from `src/index.ts`.
- Implement and export a registry abstraction, or narrow the architecture/docs to the primitives that actually exist.
- Add package-level examples that import only from `@franken/mcp`.
