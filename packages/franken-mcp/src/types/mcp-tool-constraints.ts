/** Frankenbeast-specific constraints applied to MCP tools. */
export interface McpToolConstraints {
  /** Whether invoking this tool can cause irreversible changes. */
  is_destructive: boolean;
  /** Whether human-in-the-loop approval is required before invocation. */
  requires_hitl: boolean;
  /** Sandbox environment for execution. */
  sandbox_type: "DOCKER" | "WASM" | "LOCAL";
}
