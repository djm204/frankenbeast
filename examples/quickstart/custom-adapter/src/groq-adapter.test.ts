import { describe, it, expect } from "vitest";
import { GroqAdapter } from "./groq-adapter.js";
import type { UnifiedRequest } from "../../../../frankenfirewall/src/types/unified-request.js";

const GROQ_TEXT_RESPONSE = {
  id: "chatcmpl-123",
  object: "chat.completion",
  model: "llama-3.3-70b-versatile",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from Groq!", tool_calls: undefined },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
};

const SIMPLE_REQUEST: UnifiedRequest = {
  id: "req-001",
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello" }],
};

describe("GroqAdapter", () => {
  const factory = () =>
    new GroqAdapter({ apiKey: "test-key", model: "llama-3.3-70b-versatile" });

  it("transformRequest produces valid Groq request shape", () => {
    const adapter = factory();
    const transformed = adapter.transformRequest(SIMPLE_REQUEST) as unknown as Record<string, unknown>;
    expect(transformed).toHaveProperty("model", "llama-3.3-70b-versatile");
    expect(transformed).toHaveProperty("messages");
  });

  it("transformResponse returns UnifiedResponse v1 shape", () => {
    const adapter = factory();
    const unified = adapter.transformResponse(GROQ_TEXT_RESPONSE, "req-001");
    expect(unified.schema_version).toBe(1);
    expect(unified.id).toBe("req-001");
    expect(unified.model_used).toBe("llama-3.3-70b-versatile");
    expect(unified.content).toBe("Hello from Groq!");
    expect(unified.tool_calls).toEqual([]);
    expect(unified.finish_reason).toBe("stop");
    expect(unified.usage.input_tokens).toBe(20);
    expect(unified.usage.output_tokens).toBe(5);
    expect(unified.usage.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("validateCapabilities returns booleans", () => {
    const adapter = factory();
    expect(typeof adapter.validateCapabilities("function_calling")).toBe("boolean");
    expect(typeof adapter.validateCapabilities("vision")).toBe("boolean");
    expect(typeof adapter.validateCapabilities("system_prompt")).toBe("boolean");
  });

  it("reports function_calling support for llama-3.3-70b", () => {
    const adapter = factory();
    expect(adapter.validateCapabilities("function_calling")).toBe(true);
    expect(adapter.validateCapabilities("system_prompt")).toBe(true);
  });
});
