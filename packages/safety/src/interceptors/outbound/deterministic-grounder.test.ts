import { describe, it, expect } from "vitest";
import { groundToolCalls } from "./deterministic-grounder.js";
import type { SkillRegistryClient } from "./deterministic-grounder.js";
import type { UnifiedResponse } from "../../types/index.js";

const BASE_RESPONSE: UnifiedResponse = {
  schema_version: 1,
  id: "msg-001",
  model_used: "claude-sonnet-4-6",
  content: null,
  tool_calls: [],
  finish_reason: "stop",
  usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 },
};

const WEATHER_TOOL_CALL = {
  id: "tc_01",
  function_name: "get_weather",
  arguments: JSON.stringify({ location: "NYC" }),
};

const knownRegistry: SkillRegistryClient = {
  hasSkill: (name) => name === "get_weather",
};

describe("DeterministicGrounder", () => {
  it("PASS — response with no tool_calls is unaffected", () => {
    const result = groundToolCalls(BASE_RESPONSE, knownRegistry);
    expect(result.passed).toBe(true);
    if (result.passed) expect(result.value).toBe(BASE_RESPONSE);
  });

  it("PASS — all tool call function_names exist in Skill Registry", () => {
    const response = { ...BASE_RESPONSE, tool_calls: [WEATHER_TOOL_CALL], finish_reason: "tool_use" as const };
    const result = groundToolCalls(response, knownRegistry);
    expect(result.passed).toBe(true);
  });

  it("BLOCK — function_name absent from Skill Registry", () => {
    const response = {
      ...BASE_RESPONSE,
      tool_calls: [{ id: "tc_02", function_name: "execute_shell", arguments: "{}" }],
      finish_reason: "tool_use" as const,
    };
    const result = groundToolCalls(response, knownRegistry);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations[0]?.code).toBe("TOOL_NOT_GROUNDED");
      expect(result.violations[0]?.interceptor).toBe("DeterministicGrounder");
    }
  });

  it("BLOCK — arguments fail schema validation when validateArguments provided", () => {
    const strictRegistry: SkillRegistryClient = {
      hasSkill: () => true,
      validateArguments: () => false,
    };
    const response = { ...BASE_RESPONSE, tool_calls: [WEATHER_TOOL_CALL], finish_reason: "tool_use" as const };
    const result = groundToolCalls(response, strictRegistry);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.message.includes("schema validation"))).toBe(true);
    }
  });

  it("BLOCK — arguments are not valid JSON", () => {
    const strictRegistry: SkillRegistryClient = {
      hasSkill: () => true,
      validateArguments: () => true,
    };
    const response = {
      ...BASE_RESPONSE,
      tool_calls: [{ id: "tc_03", function_name: "get_weather", arguments: "not json {" }],
      finish_reason: "tool_use" as const,
    };
    const result = groundToolCalls(response, strictRegistry);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.message.includes("not valid JSON"))).toBe(true);
    }
  });

  it("PASS — no registry provided, tool calls pass through (grounding skipped)", () => {
    const response = { ...BASE_RESPONSE, tool_calls: [WEATHER_TOOL_CALL], finish_reason: "tool_use" as const };
    const result = groundToolCalls(response);
    expect(result.passed).toBe(true);
  });
});
