import { describe, it, expect } from "vitest";
import { checkProjectAlignment } from "./project-alignment-checker.js";
import type { GuardrailsConfig } from "../../config/index.js";
import type { UnifiedRequest } from "../../types/index.js";
import type { SkillRegistryClient } from "./project-alignment-checker.js";

const BASE_CONFIG: GuardrailsConfig = {
  project_name: "Test",
  security_tier: "STRICT",
  schema_version: 1,
  agnostic_settings: {
    redact_pii: true,
    max_token_spend_per_call: 0.05,
    allowed_providers: ["anthropic", "openai"],
  },
  safety_hooks: { pre_flight: [], post_flight: [] },
};

const BASE_REQUEST: UnifiedRequest = {
  id: "req-align",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "Hello" }],
};

describe("ProjectAlignmentChecker", () => {
  it("PASS — within budget and allowed provider", () => {
    const result = checkProjectAlignment(BASE_REQUEST, BASE_CONFIG);
    expect(result.passed).toBe(true);
  });

  it("BLOCK — provider not in allowed_providers", () => {
    const result = checkProjectAlignment(
      { ...BASE_REQUEST, provider: "local-ollama" },
      BASE_CONFIG,
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.code === "PROVIDER_NOT_ALLOWED")).toBe(true);
    }
  });

  it("BLOCK — estimated tokens exceed budget ceiling", () => {
    // Create a very long message to exceed $0.05 budget
    const longContent = "a".repeat(200_000); // ~50k tokens at $15/M = $0.75
    const result = checkProjectAlignment(
      { ...BASE_REQUEST, messages: [{ role: "user", content: longContent }] },
      BASE_CONFIG,
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.code === "BUDGET_EXCEEDED")).toBe(true);
    }
  });

  it("BLOCK — tool not in Skill Registry", () => {
    const registry: SkillRegistryClient = { hasSkill: () => false };
    const result = checkProjectAlignment(
      { ...BASE_REQUEST, tools: [{ name: "unknown_tool", description: "x", input_schema: {} }] },
      BASE_CONFIG,
      registry,
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.code === "TOOL_NOT_GROUNDED")).toBe(true);
    }
  });

  it("PASS — tool exists in Skill Registry", () => {
    const registry: SkillRegistryClient = { hasSkill: (name) => name === "get_weather" };
    const result = checkProjectAlignment(
      { ...BASE_REQUEST, tools: [{ name: "get_weather", description: "x", input_schema: {} }] },
      BASE_CONFIG,
      registry,
    );
    expect(result.passed).toBe(true);
  });

  it("collects multiple violations in a single pass", () => {
    const longContent = "a".repeat(200_000);
    const result = checkProjectAlignment(
      { ...BASE_REQUEST, provider: "local-ollama", messages: [{ role: "user", content: longContent }] },
      BASE_CONFIG,
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});
