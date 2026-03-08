import { BaseAdapter } from "../base-adapter.js";
// ---------------------------------------------------------------------------
// Capability matrix
// ---------------------------------------------------------------------------
// Base capabilities for all Ollama models — vision and function calling
// depend on the specific model, but we default to conservative
const BASE_CAPABILITIES = ["system_prompt"];
// Models known to support function calling
const FUNCTION_CALLING_MODELS = new Set([
    "llama3.1",
    "llama3.2",
    "mistral",
    "mixtral",
    "qwen2.5",
    "command-r",
]);
export class OllamaAdapter extends BaseAdapter {
    model;
    baseUrl;
    constructor(config) {
        super({
            retry: { maxAttempts: 2, initialDelayMs: 200, backoffMultiplier: 2 },
            timeout: { timeoutMs: 120_000 }, // local models can be slow
            // Local model — zero cost
            costPerInputTokenM: 0,
            costPerOutputTokenM: 0,
        });
        this.model = config.model;
        this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    }
    validateCapabilities(feature) {
        if (BASE_CAPABILITIES.includes(feature))
            return true;
        if (feature === "function_calling") {
            // Check model family (strip version suffixes)
            const family = this.model.split(":")[0];
            return FUNCTION_CALLING_MODELS.has(family);
        }
        return false;
    }
    transformRequest(request) {
        const messages = [];
        if (request.system) {
            messages.push({ role: "system", content: request.system });
        }
        for (const msg of request.messages) {
            const content = typeof msg.content === "string"
                ? msg.content
                : msg.content
                    .filter((b) => b.text !== undefined)
                    .map((b) => b.text ?? "")
                    .join("\n");
            messages.push({
                role: msg.role === "assistant" ? "assistant" : "user",
                content,
            });
        }
        const ollamaRequest = {
            model: this.model,
            messages,
            stream: false,
        };
        if (request.max_tokens) {
            ollamaRequest.options = { num_predict: request.max_tokens };
        }
        return ollamaRequest;
    }
    async execute(providerRequest) {
        return this.withRetry(() => this.withTimeout(async () => {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(providerRequest),
            });
            if (!response.ok) {
                throw new Error(`Ollama API error ${response.status}: ${await response.text()}`);
            }
            return response.json();
        }));
    }
    transformResponse(providerResponse, requestId) {
        const raw = providerResponse;
        // Ollama reports prompt_eval_count and eval_count as token counts
        const inputTokens = raw.prompt_eval_count ?? 0;
        const outputTokens = raw.eval_count ?? 0;
        return {
            schema_version: 1,
            id: requestId,
            model_used: raw.model,
            content: raw.message.content,
            tool_calls: [], // Ollama chat API doesn't return tool calls in this format
            finish_reason: raw.done ? "stop" : "length",
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost_usd: 0, // Local model — always free
            },
        };
    }
}
//# sourceMappingURL=ollama-adapter.js.map