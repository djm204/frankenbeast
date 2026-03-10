import { describe, it, expectTypeOf } from "vitest";
import type { UnifiedResponse, FinishReason, ToolCall, UsageMetrics } from "./unified-response.js";

describe("UnifiedResponse type shape", () => {
  it("schema_version is literal 1", () => {
    expectTypeOf<UnifiedResponse["schema_version"]>().toEqualTypeOf<1>();
  });

  it("content is string or null", () => {
    expectTypeOf<UnifiedResponse["content"]>().toEqualTypeOf<string | null>();
  });

  it("tool_calls is an array of ToolCall", () => {
    expectTypeOf<UnifiedResponse["tool_calls"]>().toEqualTypeOf<ToolCall[]>();
  });

  it("finish_reason is constrained to valid enum values", () => {
    expectTypeOf<FinishReason>().toEqualTypeOf<
      "stop" | "tool_use" | "length" | "content_filter"
    >();
  });

  it("usage contains input_tokens, output_tokens, cost_usd", () => {
    expectTypeOf<UsageMetrics>().toHaveProperty("input_tokens").toBeNumber();
    expectTypeOf<UsageMetrics>().toHaveProperty("output_tokens").toBeNumber();
    expectTypeOf<UsageMetrics>().toHaveProperty("cost_usd").toBeNumber();
  });
});
