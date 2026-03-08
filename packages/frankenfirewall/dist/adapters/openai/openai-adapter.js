import { BaseAdapter } from "../base-adapter.js";
// ---------------------------------------------------------------------------
// Capability matrix
// ---------------------------------------------------------------------------
const CAPABILITY_MATRIX = {
    "gpt-4o": ["function_calling", "vision", "system_prompt"],
    "gpt-4o-mini": ["function_calling", "vision", "system_prompt"],
    "gpt-4-turbo": ["function_calling", "vision", "system_prompt"],
    "gpt-3.5-turbo": ["function_calling", "system_prompt"],
};
function mapFinishReason(reason) {
    switch (reason) {
        case "stop": return "stop";
        case "tool_calls": return "tool_use";
        case "length": return "length";
        case "content_filter": return "content_filter";
        default: return "content_filter";
    }
}
export class OpenAIAdapter extends BaseAdapter {
    model;
    apiKey;
    apiBaseUrl;
    constructor(adapterConfig) {
        super({
            retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
            timeout: { timeoutMs: 30_000 },
            // gpt-4o pricing: $5/M input, $15/M output
            costPerInputTokenM: 5,
            costPerOutputTokenM: 15,
        });
        this.model = adapterConfig.model;
        this.apiKey = adapterConfig.apiKey;
        this.apiBaseUrl = adapterConfig.apiBaseUrl ?? "https://api.openai.com";
    }
    validateCapabilities(feature) {
        const supported = CAPABILITY_MATRIX[this.model] ?? [];
        return supported.includes(feature);
    }
    transformRequest(request) {
        if (request.tools && request.tools.length > 0 && !this.validateCapabilities("function_calling")) {
            throw this.makeViolation(`Model "${this.model}" does not support function_calling`, { model: this.model, feature: "function_calling" });
        }
        const messages = [];
        // OpenAI system prompt goes as first message with role "system"
        if (request.system) {
            messages.push({ role: "system", content: request.system });
        }
        for (const msg of request.messages) {
            if (typeof msg.content === "string") {
                messages.push({
                    role: msg.role === "assistant" ? "assistant" : "user",
                    content: msg.content,
                });
            }
            else {
                // Handle content blocks (simplified: concatenate text)
                const textContent = msg.content
                    .filter((b) => b.text !== undefined)
                    .map((b) => b.text ?? "")
                    .join("\n");
                messages.push({
                    role: msg.role === "assistant" ? "assistant" : "user",
                    content: textContent,
                });
            }
        }
        const openAIRequest = {
            model: this.model,
            messages,
        };
        if (request.max_tokens) {
            openAIRequest.max_tokens = request.max_tokens;
        }
        if (request.tools && request.tools.length > 0) {
            openAIRequest.tools = request.tools.map((t) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema,
                },
            }));
        }
        return openAIRequest;
    }
    async execute(providerRequest) {
        return this.withRetry(() => this.withTimeout(async () => {
            const response = await fetch(`${this.apiBaseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(providerRequest),
            });
            if (!response.ok) {
                throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
            }
            return response.json();
        }));
    }
    transformResponse(providerResponse, requestId) {
        const raw = providerResponse;
        const choice = raw.choices[0];
        if (!choice) {
            throw this.makeViolation("OpenAI response has no choices", { response: String(raw) });
        }
        const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            function_name: tc.function.name,
            arguments: tc.function.arguments,
        }));
        const inputTokens = raw.usage.prompt_tokens;
        const outputTokens = raw.usage.completion_tokens;
        return {
            schema_version: 1,
            id: requestId,
            model_used: raw.model,
            content: choice.message.content,
            tool_calls: toolCalls,
            finish_reason: mapFinishReason(choice.finish_reason),
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost_usd: this.calculateCost(inputTokens, outputTokens),
            },
        };
    }
}
//# sourceMappingURL=openai-adapter.js.map