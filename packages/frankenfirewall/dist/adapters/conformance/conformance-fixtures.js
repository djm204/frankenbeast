/**
 * Canned inputs and provider-specific response shapes for conformance testing.
 * Each adapter must produce identical UnifiedResponse shapes from its own raw format.
 */
// ─── Shared Input ────────────────────────────────────────────────────────────
export const SIMPLE_TEXT_REQUEST = {
    id: "conformance-text-001",
    provider: "test",
    model: "test-model",
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Hello, world!" }],
    max_tokens: 256,
    session_id: "session-conformance",
};
export const TOOL_CALL_REQUEST = {
    id: "conformance-tool-001",
    provider: "test",
    model: "test-model",
    messages: [{ role: "user", content: "What is the weather in SF?" }],
    tools: [
        {
            name: "get_weather",
            description: "Get the current weather",
            input_schema: {
                type: "object",
                properties: {
                    location: { type: "string" },
                    unit: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["location"],
            },
        },
    ],
    max_tokens: 256,
    session_id: "session-conformance",
};
// ─── Claude Fixture Responses ────────────────────────────────────────────────
export const CLAUDE_TEXT_RESPONSE = {
    id: "msg_conformance_001",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "text", text: "Hello! How can I help you today?" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 25, output_tokens: 11 },
};
export const CLAUDE_TOOL_RESPONSE = {
    id: "msg_conformance_002",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [
        {
            type: "tool_use",
            id: "toolu_conformance_001",
            name: "get_weather",
            input: { location: "San Francisco, CA", unit: "celsius" },
        },
    ],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 68, output_tokens: 52 },
};
// ─── OpenAI Fixture Responses ────────────────────────────────────────────────
export const OPENAI_TEXT_RESPONSE = {
    id: "chatcmpl-conformance-001",
    object: "chat.completion",
    created: 1677858242,
    model: "gpt-4o",
    choices: [
        {
            index: 0,
            message: {
                role: "assistant",
                content: "Hello! How can I help you today?",
            },
            finish_reason: "stop",
        },
    ],
    usage: { prompt_tokens: 25, completion_tokens: 11, total_tokens: 36 },
};
export const OPENAI_TOOL_RESPONSE = {
    id: "chatcmpl-conformance-002",
    object: "chat.completion",
    created: 1677858243,
    model: "gpt-4o",
    choices: [
        {
            index: 0,
            message: {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_conformance_001",
                        type: "function",
                        function: {
                            name: "get_weather",
                            arguments: '{"location":"San Francisco, CA","unit":"celsius"}',
                        },
                    },
                ],
            },
            finish_reason: "tool_calls",
        },
    ],
    usage: { prompt_tokens: 68, completion_tokens: 52, total_tokens: 120 },
};
// ─── Provider-Specific Fields That Must NEVER Appear in UnifiedResponse ──────
export const PROVIDER_SPECIFIC_FIELDS = [
    // Claude-specific
    "content_block",
    "stop_reason",
    "stop_sequence",
    "anthropic",
    // OpenAI-specific
    "choices",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "created",
    "object",
];
//# sourceMappingURL=conformance-fixtures.js.map