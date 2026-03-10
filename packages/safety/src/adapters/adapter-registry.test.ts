import { describe, it, expect } from "vitest";
import { AdapterRegistry, AdapterRegistryError } from "./adapter-registry.js";
import type { IAdapter } from "./i-adapter.js";

// Minimal stub satisfying IAdapter for registration tests
const stubAdapter: IAdapter = {
  transformRequest: () => ({}),
  execute: async () => ({}),
  transformResponse: () => ({
    schema_version: 1,
    id: "test",
    model_used: "test-model",
    content: null,
    tool_calls: [],
    finish_reason: "stop",
    usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
  }),
  validateCapabilities: () => true,
};

describe("AdapterRegistry", () => {
  it("resolves a registered provider", () => {
    const registry = new AdapterRegistry(["anthropic"]);
    registry.register("anthropic", stubAdapter);
    expect(registry.getAdapter("anthropic")).toBe(stubAdapter);
  });

  it("throws AdapterRegistryError for a provider not in allowed_providers", () => {
    const registry = new AdapterRegistry(["anthropic"]);
    registry.register("anthropic", stubAdapter);
    expect(() => registry.getAdapter("openai")).toThrow(AdapterRegistryError);
    expect(() => registry.getAdapter("openai")).toThrow(/not in the allowed_providers/);
  });

  it("throws AdapterRegistryError when provider is allowed but not registered", () => {
    const registry = new AdapterRegistry(["anthropic", "openai"]);
    registry.register("anthropic", stubAdapter);
    expect(() => registry.getAdapter("openai")).toThrow(AdapterRegistryError);
    expect(() => registry.getAdapter("openai")).toThrow(/no registered adapter/);
  });

  it("AdapterRegistryError carries GuardrailViolation fields", () => {
    const registry = new AdapterRegistry(["anthropic"]);
    try {
      registry.getAdapter("unknown-provider");
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterRegistryError);
      const violation = err as AdapterRegistryError;
      expect(violation.code).toBe("PROVIDER_NOT_ALLOWED");
      expect(violation.interceptor).toBe("Pipeline");
      expect(violation.payload).toHaveProperty("provider");
    }
  });
});
