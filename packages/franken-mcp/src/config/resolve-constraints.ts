import type { McpToolConstraints } from "../types/mcp-tool-constraints.js";

/** Partial constraints where each property may be explicitly undefined (zod compat). */
type LoosePartial<T> = { [K in keyof T]?: T[K] | undefined };

const MODULE_DEFAULTS: McpToolConstraints = {
  is_destructive: true,
  requires_hitl: true,
  sandbox_type: "DOCKER",
};

export function resolveConstraints(
  serverConstraints?: LoosePartial<McpToolConstraints>,
  toolOverrideConstraints?: LoosePartial<McpToolConstraints>,
): McpToolConstraints {
  return {
    is_destructive:
      toolOverrideConstraints?.is_destructive ??
      serverConstraints?.is_destructive ??
      MODULE_DEFAULTS.is_destructive,
    requires_hitl:
      toolOverrideConstraints?.requires_hitl ??
      serverConstraints?.requires_hitl ??
      MODULE_DEFAULTS.requires_hitl,
    sandbox_type:
      toolOverrideConstraints?.sandbox_type ??
      serverConstraints?.sandbox_type ??
      MODULE_DEFAULTS.sandbox_type,
  };
}
