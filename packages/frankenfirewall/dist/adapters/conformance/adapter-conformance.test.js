import { describe, it, expect } from "vitest";
import { runAdapterConformance } from "./adapter-conformance.js";
import { ClaudeAdapter } from "../claude/claude-adapter.js";
import { OpenAIAdapter } from "../openai/openai-adapter.js";
import { SIMPLE_TEXT_REQUEST, TOOL_CALL_REQUEST, CLAUDE_TEXT_RESPONSE, CLAUDE_TOOL_RESPONSE, OPENAI_TEXT_RESPONSE, OPENAI_TOOL_RESPONSE, } from "./conformance-fixtures.js";
// ─── Claude Adapter Conformance ──────────────────────────────────────────────
describe("Adapter Conformance: ClaudeAdapter", () => {
    const factory = () => new ClaudeAdapter({
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
    });
    const fixtures = {
        textResponse: CLAUDE_TEXT_RESPONSE,
        toolResponse: CLAUDE_TOOL_RESPONSE,
    };
    it("passes conformance for simple text request", () => {
        const result = runAdapterConformance(factory, SIMPLE_TEXT_REQUEST, fixtures);
        expect(result.failures).toEqual([]);
        expect(result.passed).toBe(true);
    });
    it("passes conformance for tool call request", () => {
        const result = runAdapterConformance(factory, TOOL_CALL_REQUEST, fixtures);
        expect(result.failures).toEqual([]);
        expect(result.passed).toBe(true);
    });
    it("text response has correct shape", () => {
        const adapter = factory();
        const unified = adapter.transformResponse(CLAUDE_TEXT_RESPONSE, "req-001");
        expect(unified.schema_version).toBe(1);
        expect(unified.id).toBe("req-001");
        expect(unified.model_used).toBe("claude-sonnet-4-6");
        expect(unified.content).toBe("Hello! How can I help you today?");
        expect(unified.tool_calls).toEqual([]);
        expect(unified.finish_reason).toBe("stop");
        expect(unified.usage.input_tokens).toBe(25);
        expect(unified.usage.output_tokens).toBe(11);
        expect(unified.usage.cost_usd).toBeGreaterThan(0);
    });
    it("tool response has correct shape", () => {
        const adapter = factory();
        const unified = adapter.transformResponse(CLAUDE_TOOL_RESPONSE, "req-002");
        expect(unified.schema_version).toBe(1);
        expect(unified.content).toBeNull();
        expect(unified.tool_calls).toHaveLength(1);
        expect(unified.tool_calls[0].function_name).toBe("get_weather");
        expect(unified.tool_calls[0].arguments).toBe(JSON.stringify({ location: "San Francisco, CA", unit: "celsius" }));
        expect(unified.finish_reason).toBe("tool_use");
    });
    it("validates capabilities return boolean", () => {
        const adapter = factory();
        expect(typeof adapter.validateCapabilities("function_calling")).toBe("boolean");
        expect(typeof adapter.validateCapabilities("vision")).toBe("boolean");
        expect(typeof adapter.validateCapabilities("streaming")).toBe("boolean");
        expect(typeof adapter.validateCapabilities("system_prompt")).toBe("boolean");
    });
});
// ─── OpenAI Adapter Conformance ──────────────────────────────────────────────
describe("Adapter Conformance: OpenAIAdapter", () => {
    const factory = () => new OpenAIAdapter({
        apiKey: "test-key",
        model: "gpt-4o",
    });
    const fixtures = {
        textResponse: OPENAI_TEXT_RESPONSE,
        toolResponse: OPENAI_TOOL_RESPONSE,
    };
    it("passes conformance for simple text request", () => {
        const result = runAdapterConformance(factory, SIMPLE_TEXT_REQUEST, fixtures);
        expect(result.failures).toEqual([]);
        expect(result.passed).toBe(true);
    });
    it("passes conformance for tool call request", () => {
        const result = runAdapterConformance(factory, TOOL_CALL_REQUEST, fixtures);
        expect(result.failures).toEqual([]);
        expect(result.passed).toBe(true);
    });
    it("text response has correct shape", () => {
        const adapter = factory();
        const unified = adapter.transformResponse(OPENAI_TEXT_RESPONSE, "req-001");
        expect(unified.schema_version).toBe(1);
        expect(unified.id).toBe("req-001");
        expect(unified.model_used).toBe("gpt-4o");
        expect(unified.content).toBe("Hello! How can I help you today?");
        expect(unified.tool_calls).toEqual([]);
        expect(unified.finish_reason).toBe("stop");
        expect(unified.usage.input_tokens).toBe(25);
        expect(unified.usage.output_tokens).toBe(11);
        expect(unified.usage.cost_usd).toBeGreaterThan(0);
    });
    it("tool response has correct shape", () => {
        const adapter = factory();
        const unified = adapter.transformResponse(OPENAI_TOOL_RESPONSE, "req-002");
        expect(unified.schema_version).toBe(1);
        expect(unified.content).toBeNull();
        expect(unified.tool_calls).toHaveLength(1);
        expect(unified.tool_calls[0].function_name).toBe("get_weather");
        expect(unified.tool_calls[0].arguments).toBe('{"location":"San Francisco, CA","unit":"celsius"}');
        expect(unified.finish_reason).toBe("tool_use");
    });
    it("validates capabilities return boolean", () => {
        const adapter = factory();
        expect(typeof adapter.validateCapabilities("function_calling")).toBe("boolean");
        expect(typeof adapter.validateCapabilities("vision")).toBe("boolean");
        expect(typeof adapter.validateCapabilities("streaming")).toBe("boolean");
        expect(typeof adapter.validateCapabilities("system_prompt")).toBe("boolean");
    });
});
// ─── Cross-adapter Consistency ───────────────────────────────────────────────
describe("Adapter Conformance: Cross-adapter consistency", () => {
    it("both adapters produce identical UnifiedResponse shapes for text", () => {
        const claude = new ClaudeAdapter({ apiKey: "k", model: "claude-sonnet-4-6" });
        const openai = new OpenAIAdapter({ apiKey: "k", model: "gpt-4o" });
        const cRes = claude.transformResponse(CLAUDE_TEXT_RESPONSE, "req-001");
        const oRes = openai.transformResponse(OPENAI_TEXT_RESPONSE, "req-001");
        // Same structural shape
        expect(Object.keys(cRes).sort()).toEqual(Object.keys(oRes).sort());
        // Same content
        expect(cRes.content).toBe(oRes.content);
        // Same schema version
        expect(cRes.schema_version).toBe(oRes.schema_version);
        // Same finish reason
        expect(cRes.finish_reason).toBe(oRes.finish_reason);
        // Same token counts
        expect(cRes.usage.input_tokens).toBe(oRes.usage.input_tokens);
        expect(cRes.usage.output_tokens).toBe(oRes.usage.output_tokens);
    });
    it("both adapters produce identical tool_call shapes", () => {
        const claude = new ClaudeAdapter({ apiKey: "k", model: "claude-sonnet-4-6" });
        const openai = new OpenAIAdapter({ apiKey: "k", model: "gpt-4o" });
        const cRes = claude.transformResponse(CLAUDE_TOOL_RESPONSE, "req-001");
        const oRes = openai.transformResponse(OPENAI_TOOL_RESPONSE, "req-001");
        expect(cRes.tool_calls).toHaveLength(1);
        expect(oRes.tool_calls).toHaveLength(1);
        // Same function name
        expect(cRes.tool_calls[0].function_name).toBe(oRes.tool_calls[0].function_name);
        // Both have string IDs and string arguments
        expect(typeof cRes.tool_calls[0].id).toBe("string");
        expect(typeof oRes.tool_calls[0].id).toBe("string");
        expect(typeof cRes.tool_calls[0].arguments).toBe("string");
        expect(typeof oRes.tool_calls[0].arguments).toBe("string");
    });
});
//# sourceMappingURL=adapter-conformance.test.js.map