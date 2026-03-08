import { describe, it, expect } from "vitest";
import { enforceSchema } from "./schema-enforcer.js";

const VALID_RESPONSE = {
  schema_version: 1,
  id: "msg-001",
  model_used: "claude-sonnet-4-6",
  content: "Hello!",
  tool_calls: [],
  finish_reason: "stop",
  usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 },
};

describe("SchemaEnforcer", () => {
  it("PASS — valid UnifiedResponse v1 shape", () => {
    const result = enforceSchema(VALID_RESPONSE);
    expect(result.passed).toBe(true);
    if (result.passed) expect(result.value).toMatchObject(VALID_RESPONSE);
  });

  it("FAIL — missing required field id", () => {
    const { id: _omit, ...rest } = VALID_RESPONSE;
    const result = enforceSchema(rest);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.message.includes("id"))).toBe(true);
    }
  });

  it("FAIL — tool_calls entry missing function_name", () => {
    const result = enforceSchema({
      ...VALID_RESPONSE,
      tool_calls: [{ id: "tc_1", arguments: "{}" }],
    });
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.message.includes("function_name"))).toBe(true);
    }
  });

  it("FAIL — finish_reason is not a valid enum value", () => {
    const result = enforceSchema({ ...VALID_RESPONSE, finish_reason: "unknown_reason" });
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.message.includes("finish_reason"))).toBe(true);
    }
  });

  it("FAIL — schema_version mismatch", () => {
    const result = enforceSchema({ ...VALID_RESPONSE, schema_version: 2 }, 1);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => v.message.includes("schema_version"))).toBe(true);
    }
  });

  it("PASS — content can be null", () => {
    const result = enforceSchema({ ...VALID_RESPONSE, content: null });
    expect(result.passed).toBe(true);
  });

  it("FAIL — content is neither string nor null", () => {
    const result = enforceSchema({ ...VALID_RESPONSE, content: 42 });
    expect(result.passed).toBe(false);
  });

  it("all violations carry interceptor: SchemaEnforcer", () => {
    const result = enforceSchema({ ...VALID_RESPONSE, id: "", finish_reason: "bad" });
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.every((v) => v.interceptor === "SchemaEnforcer")).toBe(true);
    }
  });
});
