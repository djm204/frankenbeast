import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIAdapter } from "./openai-adapter.js";
import { ClaudeAdapter } from "../claude/claude-adapter.js";
import type { UnifiedRequest } from "../../types/index.js";
import stopFixture from "./fixtures/response-stop.json" assert { type: "json" };
import toolFixture from "./fixtures/response-tool-call.json" assert { type: "json" };
import claudeStopFixture from "../claude/fixtures/response-stop.json" assert { type: "json" };

const BASE_REQUEST: UnifiedRequest = {
  id: "req-001",
  provider: "openai",
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
};

function makeAdapter(model = "gpt-4o"): OpenAIAdapter {
  return new OpenAIAdapter({ apiKey: "test-key", model });
}

// ---------------------------------------------------------------------------
// transformRequest
// ---------------------------------------------------------------------------
describe("OpenAIAdapter.transformRequest", () => {
  it("maps system prompt to messages[0] with role: system", () => {
    const adapter = makeAdapter();
    const result = adapter.transformRequest({ ...BASE_REQUEST, system: "Be helpful." }) as { messages: Array<{ role: string; content: string }> };
    expect(result.messages[0]?.role).toBe("system");
    expect(result.messages[0]?.content).toBe("Be helpful.");
  });

  it("places user message after system message", () => {
    const adapter = makeAdapter();
    const result = adapter.transformRequest({ ...BASE_REQUEST, system: "Sys" }) as { messages: Array<{ role: string }> };
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.role).toBe("user");
  });

  it("maps tool definitions to OpenAI tools format with type: function", () => {
    const adapter = makeAdapter();
    const result = adapter.transformRequest({
      ...BASE_REQUEST,
      tools: [{ name: "get_weather", description: "Get weather", input_schema: { type: "object" } }],
    }) as { tools: Array<{ type: string; function: { name: string } }> };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.type).toBe("function");
    expect(result.tools[0]?.function.name).toBe("get_weather");
  });

  it("throws GuardrailViolation when model does not support function_calling", () => {
    const adapter = new OpenAIAdapter({ apiKey: "k", model: "unknown-model" });
    expect(() =>
      adapter.transformRequest({
        ...BASE_REQUEST,
        tools: [{ name: "x", description: "x", input_schema: {} }],
      }),
    ).toThrow(expect.objectContaining({ code: "ADAPTER_ERROR" }));
  });
});

// ---------------------------------------------------------------------------
// execute (mocked fetch)
// ---------------------------------------------------------------------------
describe("OpenAIAdapter.execute", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => stopFixture,
    }));
  });

  it("returns raw OpenAI response from fixture", async () => {
    const adapter = makeAdapter();
    const result = await adapter.execute({ model: "gpt-4o", messages: [] });
    expect(result).toMatchObject({ id: stopFixture.id, object: "chat.completion" });
  });
});

// ---------------------------------------------------------------------------
// transformResponse
// ---------------------------------------------------------------------------
describe("OpenAIAdapter.transformResponse", () => {
  const adapter = makeAdapter();

  it("maps choices[0].message.content to UnifiedResponse.content", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    expect(result.content).toBe("Hello! How can I help you today?");
  });

  it("maps tool_calls array to UnifiedResponse.tool_calls", () => {
    const result = adapter.transformResponse(toolFixture, "req-002");
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0]?.function_name).toBe("get_weather");
    expect(JSON.parse(result.tool_calls[0]?.arguments ?? "{}")).toMatchObject({
      location: "San Francisco, CA",
    });
  });

  it("maps finish_reason tool_calls to tool_use", () => {
    const result = adapter.transformResponse(toolFixture, "req-002");
    expect(result.finish_reason).toBe("tool_use");
  });

  it("maps finish_reason stop to stop", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    expect(result.finish_reason).toBe("stop");
  });

  it("includes computed cost_usd in usage", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    expect(result.usage.cost_usd).toBeGreaterThan(0);
    expect(result.usage.input_tokens).toBe(25);
    expect(result.usage.output_tokens).toBe(11);
  });

  it("sets schema_version to 1", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    expect(result.schema_version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Parity test: ClaudeAdapter and OpenAIAdapter return identical UnifiedResponse shape
// ---------------------------------------------------------------------------
describe("Cross-adapter parity", () => {
  it("ClaudeAdapter and OpenAIAdapter return identical UnifiedResponse shape for equivalent stop responses", () => {
    const claudeAdapter = new ClaudeAdapter({ apiKey: "k", model: "claude-sonnet-4-6" });
    const openaiAdapter = new OpenAIAdapter({ apiKey: "k", model: "gpt-4o" });

    const claudeResult = claudeAdapter.transformResponse(claudeStopFixture, "req-parity");
    const openaiResult = openaiAdapter.transformResponse(stopFixture, "req-parity");

    // Shape check — same keys, same types
    expect(Object.keys(claudeResult).sort()).toEqual(Object.keys(openaiResult).sort());
    expect(typeof claudeResult.content).toBe(typeof openaiResult.content);
    expect(Array.isArray(claudeResult.tool_calls)).toBe(Array.isArray(openaiResult.tool_calls));
    expect(typeof claudeResult.finish_reason).toBe(typeof openaiResult.finish_reason);
    expect(typeof claudeResult.usage.cost_usd).toBe(typeof openaiResult.usage.cost_usd);
    expect(claudeResult.schema_version).toBe(openaiResult.schema_version);
  });
});
