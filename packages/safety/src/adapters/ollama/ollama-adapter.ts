import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";

// ---------------------------------------------------------------------------
// Ollama-specific types (never leak past this file)
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream: false;
  options?: { num_predict?: number };
}

interface OllamaResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration: number;
  prompt_eval_count: number;
  eval_count: number;
}

// ---------------------------------------------------------------------------
// Capability matrix
// ---------------------------------------------------------------------------

// Base capabilities for all Ollama models — vision and function calling
// depend on the specific model, but we default to conservative
const BASE_CAPABILITIES: CapabilityFeature[] = ["system_prompt"];

// Models known to support function calling
const FUNCTION_CALLING_MODELS = new Set([
  "llama3.1",
  "llama3.2",
  "mistral",
  "mixtral",
  "qwen2.5",
  "command-r",
]);

// ---------------------------------------------------------------------------
// OllamaAdapter
// ---------------------------------------------------------------------------

export interface OllamaAdapterConfig {
  model: string;
  baseUrl?: string;
}

export class OllamaAdapter extends BaseAdapter implements IAdapter {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OllamaAdapterConfig) {
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

  validateCapabilities(feature: CapabilityFeature): boolean {
    if (BASE_CAPABILITIES.includes(feature)) return true;
    if (feature === "function_calling") {
      // Check model family (strip version suffixes)
      const family = this.model.split(":")[0]!;
      return FUNCTION_CALLING_MODELS.has(family);
    }
    return false;
  }

  transformRequest(request: UnifiedRequest): OllamaRequest {
    const messages: OllamaMessage[] = [];

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

    const ollamaRequest: OllamaRequest = {
      model: this.model,
      messages,
      stream: false,
    };

    if (request.max_tokens) {
      ollamaRequest.options = { num_predict: request.max_tokens };
    }

    return ollamaRequest;
  }

  async execute(providerRequest: unknown): Promise<unknown> {
    return this.withRetry(() =>
      this.withTimeout(async () => {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(providerRequest),
        });

        if (!response.ok) {
          throw new Error(`Ollama API error ${response.status}: ${await response.text()}`);
        }

        return response.json() as Promise<unknown>;
      }),
    );
  }

  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse {
    const raw = providerResponse as OllamaResponse;

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
