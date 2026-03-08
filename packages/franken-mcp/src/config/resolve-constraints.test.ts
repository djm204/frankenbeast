import { describe, it, expect } from "vitest";
import { resolveConstraints } from "./resolve-constraints.js";
import type { McpToolConstraints } from "../types/mcp-tool-constraints.js";

const MODULE_DEFAULTS: McpToolConstraints = {
  is_destructive: true,
  requires_hitl: true,
  sandbox_type: "DOCKER",
};

describe("resolveConstraints", () => {
  it("returns MODULE_DEFAULTS when no overrides are provided", () => {
    const result = resolveConstraints();
    expect(result).toEqual(MODULE_DEFAULTS);
  });

  it("returns MODULE_DEFAULTS when both arguments are undefined", () => {
    const result = resolveConstraints(undefined, undefined);
    expect(result).toEqual(MODULE_DEFAULTS);
  });

  it("applies server-level overrides over defaults", () => {
    const result = resolveConstraints({
      is_destructive: false,
      sandbox_type: "LOCAL",
    });

    expect(result).toEqual({
      is_destructive: false,
      requires_hitl: true, // default
      sandbox_type: "LOCAL",
    });
  });

  it("applies tool-level overrides over defaults", () => {
    const result = resolveConstraints(undefined, {
      requires_hitl: false,
      sandbox_type: "WASM",
    });

    expect(result).toEqual({
      is_destructive: true, // default
      requires_hitl: false,
      sandbox_type: "WASM",
    });
  });

  it("tool-level overrides win over server-level overrides", () => {
    const result = resolveConstraints(
      { is_destructive: false, requires_hitl: false, sandbox_type: "LOCAL" },
      { is_destructive: true, sandbox_type: "WASM" },
    );

    expect(result).toEqual({
      is_destructive: true, // tool wins
      requires_hitl: false, // server (no tool override)
      sandbox_type: "WASM", // tool wins
    });
  });

  it("partial override only changes specified fields, rest stay default", () => {
    const result = resolveConstraints({ sandbox_type: "WASM" });

    expect(result.is_destructive).toBe(true); // default
    expect(result.requires_hitl).toBe(true); // default
    expect(result.sandbox_type).toBe("WASM"); // overridden
  });

  it("returns a new object, not a reference to defaults", () => {
    const result1 = resolveConstraints();
    const result2 = resolveConstraints();
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });
});
