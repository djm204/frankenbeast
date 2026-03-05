import { BaseAdapter } from "../../../../frankenfirewall/src/adapters/base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../../../../frankenfirewall/src/adapters/i-adapter.js";
import type { UnifiedRequest, UnifiedResponse, ToolCall } from "../../../../frankenfirewall/src/types/index.js";

// ---------------------------------------------------------------------------
// Groq-specific request/response shapes (private — never exported)
// ---------------------------------------------------------------------------

type GroqRole = "system" | "user" | "assistant" | "tool";

interface GroqMessage {
  role: GroqRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: GroqToolCall[];
}

interface GroqToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface GroqFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GroqTool {
  type: "function";
  function: GroqFunction;
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  tools?: GroqTool[];
  max_tokens?: number;
}

interface GroqChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: GroqToolCall[];
  };
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
}

interface GroqResponse {
  id: string;
  object: "chat.completion";
  model: string;
  choices: GroqChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Capability matrix — what each Groq-hosted model supports
// ---------------------------------------------------------------------------

const CAPABILITY_MATRIX: Record<string, CapabilityFeature[]> = {
  "llama-3.3-70b-versatile": ["function_calling", "system_prompt"],
  "llama-3.1-8b-instant": ["function_calling", "system_prompt"],
  "mixtral-8x7b-32768": ["function_calling", "system_prompt"],
  "gemma2-9b-it": ["system_prompt"],
};

// ---------------------------------------------------------------------------
// Pricing per 1M tokens (USD) — varies by model
// ---------------------------------------------------------------------------

const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "llama-3.3-70b-versatile": { inputPerM: 0.59, outputPerM: 0.79 },
  "llama-3.1-8b-instant": { inputPerM: 0.05, outputPerM: 0.08 },
  "mixtral-8x7b-32768": { inputPerM: 0.24, outputPerM: 0.24 },
  "gemma2-9b-it": { inputPerM: 0.20, outputPerM: 0.20 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapFinishReason(
  reason: GroqChoice["finish_reason"],
): UnifiedResponse["finish_reason"] {
  switch (reason) {
    case "stop": return "stop";
    case "tool_calls": return "tool_use";
    case "length": return "length";
    case "content_filter": return "content_filter";
    default: return "content_filter";
  }
}

// ---------------------------------------------------------------------------
// GroqAdapter — public API
// ---------------------------------------------------------------------------

export interface GroqAdapterConfig {
  apiKey: string;
  model: string;
  apiBaseUrl?: string;
}

export class GroqAdapter extends BaseAdapter implements IAdapter {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;

  constructor(adapterConfig: GroqAdapterConfig) {
    const pricing = MODEL_PRICING[adapterConfig.model] ?? { inputPerM: 0, outputPerM: 0 };

    super({
      retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
      timeout: { timeoutMs: 30_000 },
      costPerInputTokenM: pricing.inputPerM,
      costPerOutputTokenM: pricing.outputPerM,
    });

    this.model = adapterConfig.model;
    this.apiKey = adapterConfig.apiKey;
    this.apiBaseUrl = adapterConfig.apiBaseUrl ?? "https://api.groq.com/openai";
  }

  // ── IAdapter.validateCapabilities ──────────────────────────────────

  validateCapabilities(feature: CapabilityFeature): boolean {
    const supported = CAPABILITY_MATRIX[this.model] ?? [];
    return supported.includes(feature);
  }

  // ── IAdapter.transformRequest ──────────────────────────────────────

  transformRequest(request: UnifiedRequest): GroqRequest {
    if (
      request.tools &&
      request.tools.length > 0 &&
      !this.validateCapabilities("function_calling")
    ) {
      throw this.makeViolation(
        `Model "${this.model}" does not support function_calling`,
        { model: this.model, feature: "function_calling" },
      );
    }

    const messages: GroqMessage[] = [];

    // Groq uses the OpenAI-compatible system message format
    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }

    for (const msg of request.messages) {
      if (typeof msg.content === "string") {
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        });
      } else {
        // Handle content blocks — concatenate text portions
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

    const groqRequest: GroqRequest = {
      model: this.model,
      messages,
    };

    if (request.max_tokens) {
      groqRequest.max_tokens = request.max_tokens;
    }

    if (request.tools && request.tools.length > 0) {
      groqRequest.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    return groqRequest;
  }

  // ── IAdapter.execute ───────────────────────────────────────────────

  async execute(providerRequest: unknown): Promise<unknown> {
    return this.withRetry(() =>
      this.withTimeout(async () => {
        const response = await fetch(
          `${this.apiBaseUrl}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(providerRequest),
          },
        );

        if (!response.ok) {
          throw new Error(
            `Groq API error ${response.status}: ${await response.text()}`,
          );
        }

        return response.json() as Promise<unknown>;
      }),
    );
  }

  // ── IAdapter.transformResponse ─────────────────────────────────────

  transformResponse(
    providerResponse: unknown,
    requestId: string,
  ): UnifiedResponse {
    const raw = providerResponse as GroqResponse;
    const choice = raw.choices[0];

    if (!choice) {
      throw this.makeViolation("Groq response has no choices", {
        response: String(raw),
      });
    }

    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(
      (tc) => ({
        id: tc.id,
        function_name: tc.function.name,
        arguments: tc.function.arguments,
      }),
    );

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
