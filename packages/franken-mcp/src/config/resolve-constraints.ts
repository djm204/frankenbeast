import type { McpToolConstraints } from "../types/mcp-tool-constraints.js";

const MODULE_DEFAULTS: McpToolConstraints = {
  is_destructive: true,
  requires_hitl: true,
  sandbox_type: "DOCKER",
};

export function resolveConstraints(
  serverConstraints?: Partial<McpToolConstraints>,
  toolOverrideConstraints?: Partial<McpToolConstraints>,
): McpToolConstraints {
  return {
    ...MODULE_DEFAULTS,
    ...serverConstraints,
    ...toolOverrideConstraints,
  };
}
