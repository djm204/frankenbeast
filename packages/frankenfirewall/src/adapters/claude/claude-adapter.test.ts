import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeAdapter } from "./claude-adapter.js";
import type { UnifiedRequest } from "../../types/index.js";
import stopFixture from "./fixtures/response-stop.json" assert { type: "json" };
import toolFixture from "./fixtures/response-tool-use.json" assert { type: "json" };

const BASE_REQUEST: UnifiedRequest = {
  id: "req-001",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "Hello" }],
};

function makeAdapter(model = "claude-sonnet-4-6"): ClaudeAdapter {
  return new ClaudeAdapter({ apiKey: "test-key", model });
}

// ---------------------------------------------------------------------------
// transformRequest
// ---------------------------------------------------------------------------
describe("ClaudeAdapter.transformRequest", () => {
  it("maps system prompt to Anthropic top-level system field", () => {
    const adapter = makeAdapter();
    const result = adapter.transformRequest({ ...BASE_REQUEST, system: "You are helpful." }) as Record<string, unknown>;
    expect(result["system"]).toBe("You are helpful.");
  });

  it("omits system field when not provided", () => {
    const adapter = makeAdapter();
    const result = adapter.transformRequest(BASE_REQUEST) as Record<string, unknown>;
    expect(result).not.toHaveProperty("system");
  });

  it("maps tool definitions to Anthropic tools format", () => {
    const adapter = makeAdapter();
    const result = adapter.transformRequest({
      ...BASE_REQUEST,
      tools: [{ name: "get_weather", description: "Get weather", input_schema: { type: "object" } }],
    }) as Record<string, unknown>;
    expect(result["tools"]).toHaveLength(1);
    expect((result["tools"] as Array<Record<string, unknown>>)[0]?.["name"]).toBe("get_weather");
  });

  it("throws GuardrailViolation when model does not support function_calling", () => {
    const adapter = new ClaudeAdapter({ apiKey: "k", model: "unknown-model" });
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
describe("ClaudeAdapter.execute", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => stopFixture,
      }),
    );
  });

  it("returns raw Anthropic response from fixture", async () => {
    const adapter = makeAdapter();
    const result = await adapter.execute({ model: "claude-sonnet-4-6", messages: [], max_tokens: 100 });
    expect(result).toMatchObject({ id: stopFixture.id, type: "message" });
  });

  it("propagates error when API returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }),
    );
    const adapter = new ClaudeAdapter({
      apiKey: "bad",
      model: "claude-sonnet-4-6",
    });
    // Wrap in a new adapter with no retries to keep test fast
    const fastAdapter = new ClaudeAdapter({
      apiKey: "bad",
      model: "claude-sonnet-4-6",
    });
    // Override retry to 1 attempt
    Object.assign(fastAdapter["config"], { retry: { maxAttempts: 1, initialDelayMs: 0, backoffMultiplier: 1 } });
    await expect(fastAdapter.execute({})).rejects.toMatchObject({ code: "ADAPTER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// transformResponse
// ---------------------------------------------------------------------------
describe("ClaudeAdapter.transformResponse", () => {
  const adapter = makeAdapter();

  it("maps content text block to UnifiedResponse.content", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    expect(result.content).toBe("Hello! How can I help you today?");
    expect(result.tool_calls).toHaveLength(0);
  });

  it("maps tool_use block to UnifiedResponse.tool_calls", () => {
    const result = adapter.transformResponse(toolFixture, "req-002");
    expect(result.content).toBeNull();
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0]?.function_name).toBe("get_weather");
    expect(JSON.parse(result.tool_calls[0]?.arguments ?? "{}")).toMatchObject({
      location: "San Francisco, CA",
    });
  });

  it("maps stop_reason end_turn to finish_reason stop", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    expect(result.finish_reason).toBe("stop");
  });

  it("maps stop_reason tool_use to finish_reason tool_use", () => {
    const result = adapter.transformResponse(toolFixture, "req-002");
    expect(result.finish_reason).toBe("tool_use");
  });

  it("includes computed cost_usd in usage", () => {
    const result = adapter.transformResponse(stopFixture, "req-001");
    // 25 input + 11 output with $3/M in, $15/M out
    // input: (25/1M)*3 = 0.000075; output: (11/1M)*15 = 0.000165; total ≈ 0.00024
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
// validateCapabilities
// ---------------------------------------------------------------------------
describe("ClaudeAdapter.validateCapabilities", () => {
  it("returns true for supported features on known model", () => {
    const adapter = makeAdapter("claude-sonnet-4-6");
    expect(adapter.validateCapabilities("function_calling")).toBe(true);
    expect(adapter.validateCapabilities("vision")).toBe(true);
    expect(adapter.validateCapabilities("system_prompt")).toBe(true);
  });

  it("returns false for unknown model (not in capability matrix)", () => {
    const adapter = makeAdapter("some-future-model");
    expect(adapter.validateCapabilities("function_calling")).toBe(false);
  });
});
