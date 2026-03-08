import { BaseAdapter } from "../base-adapter.js";
// ---------------------------------------------------------------------------
// Capability matrix — maps model → supported features
// ---------------------------------------------------------------------------
const CAPABILITY_MATRIX = {
    "claude-sonnet-4-6": ["function_calling", "vision", "system_prompt"],
    "claude-haiku-4-5-20251001": ["function_calling", "vision", "system_prompt"],
    "claude-opus-4-6": ["function_calling", "vision", "system_prompt"],
};
// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------
function mapStopReason(stopReason) {
    switch (stopReason) {
        case "end_turn": return "stop";
        case "tool_use": return "tool_use";
        case "max_tokens": return "length";
        case "stop_sequence": return "stop";
        default: return "content_filter";
    }
}
export class ClaudeAdapter extends BaseAdapter {
    model;
    apiKey;
    apiBaseUrl;
    constructor(adapterConfig) {
        super({
            retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
            timeout: { timeoutMs: 30_000 },
            // claude-sonnet-4-6 pricing: $3/M input, $15/M output
            costPerInputTokenM: 3,
            costPerOutputTokenM: 15,
        });
        this.model = adapterConfig.model;
        this.apiKey = adapterConfig.apiKey;
        this.apiBaseUrl = adapterConfig.apiBaseUrl ?? "https://api.anthropic.com";
    }
    validateCapabilities(feature) {
        const supported = CAPABILITY_MATRIX[this.model] ?? [];
        return supported.includes(feature);
    }
    transformRequest(request) {
        if (request.tools && request.tools.length > 0 && !this.validateCapabilities("function_calling")) {
            throw this.makeViolation(`Model "${this.model}" does not support function_calling`, { model: this.model, feature: "function_calling" });
        }
        const messages = request.messages.map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: typeof msg.content === "string"
                ? msg.content
                : msg.content.map((block) => ({
                    type: "text",
                    text: block.text ?? block.content ?? "",
                })),
        }));
        const claudeRequest = {
            model: this.model,
            max_tokens: request.max_tokens ?? 1024,
            messages,
        };
        if (request.system) {
            claudeRequest.system = request.system;
        }
        if (request.tools && request.tools.length > 0) {
            claudeRequest.tools = request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
            }));
        }
        return claudeRequest;
    }
    async execute(providerRequest) {
        return this.withRetry(() => this.withTimeout(async () => {
            const response = await fetch(`${this.apiBaseUrl}/v1/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify(providerRequest),
            });
            if (!response.ok) {
                throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
            }
            return response.json();
        }));
    }
    transformResponse(providerResponse, requestId) {
        const raw = providerResponse;
        const textBlock = raw.content.find((b) => b.type === "text");
        const toolBlocks = raw.content.filter((b) => b.type === "tool_use");
        const toolCalls = toolBlocks.map((b) => ({
            id: b.id,
            function_name: b.name,
            arguments: JSON.stringify(b.input),
        }));
        const inputTokens = raw.usage.input_tokens;
        const outputTokens = raw.usage.output_tokens;
        return {
            schema_version: 1,
            id: requestId,
            model_used: raw.model,
            content: textBlock?.text ?? null,
            tool_calls: toolCalls,
            finish_reason: mapStopReason(raw.stop_reason),
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost_usd: this.calculateCost(inputTokens, outputTokens),
            },
        };
    }
}
//# sourceMappingURL=claude-adapter.js.map