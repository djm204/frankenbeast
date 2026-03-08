import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse, ToolCall } from "../../types/index.js";

// ---------------------------------------------------------------------------
// Claude-specific request/response shapes (never leak past this file)
// ---------------------------------------------------------------------------

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeTextBlock {
  type: "text";
  text: string;
}

interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock;

interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: ClaudeMessage[];
  tools?: ClaudeToolDefinition[];
}

interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: ClaudeContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Capability matrix — maps model → supported features
// ---------------------------------------------------------------------------

const CAPABILITY_MATRIX: Record<string, CapabilityFeature[]> = {
  "claude-sonnet-4-6": ["function_calling", "vision", "system_prompt"],
  "claude-haiku-4-5-20251001": ["function_calling", "vision", "system_prompt"],
  "claude-opus-4-6": ["function_calling", "vision", "system_prompt"],
};

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapStopReason(
  stopReason: ClaudeResponse["stop_reason"],
): UnifiedResponse["finish_reason"] {
  switch (stopReason) {
    case "end_turn": return "stop";
    case "tool_use": return "tool_use";
    case "max_tokens": return "length";
    case "stop_sequence": return "stop";
    default: return "content_filter";
  }
}

// ---------------------------------------------------------------------------
// ClaudeAdapter
// ---------------------------------------------------------------------------

export interface ClaudeAdapterConfig {
  apiKey: string;
  model: string;
  apiBaseUrl?: string;
}

export class ClaudeAdapter extends BaseAdapter implements IAdapter {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;

  constructor(adapterConfig: ClaudeAdapterConfig) {
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

  validateCapabilities(feature: CapabilityFeature): boolean {
    const supported = CAPABILITY_MATRIX[this.model] ?? [];
    return supported.includes(feature);
  }

  transformRequest(request: UnifiedRequest): ClaudeRequest {
    if (request.tools && request.tools.length > 0 && !this.validateCapabilities("function_calling")) {
      throw this.makeViolation(
        `Model "${this.model}" does not support function_calling`,
        { model: this.model, feature: "function_calling" },
      );
    }

    const messages: ClaudeMessage[] = request.messages.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: typeof msg.content === "string" ? msg.content : msg.content,
    }));

    const claudeRequest: ClaudeRequest = {
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

  async execute(providerRequest: unknown): Promise<unknown> {
    return this.withRetry(() =>
      this.withTimeout(async () => {
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

        return response.json() as Promise<unknown>;
      }),
    );
  }

  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse {
    const raw = providerResponse as ClaudeResponse;

    const textBlock = raw.content.find((b): b is ClaudeTextBlock => b.type === "text");
    const toolBlocks = raw.content.filter((b): b is ClaudeToolUseBlock => b.type === "tool_use");

    const toolCalls: ToolCall[] = toolBlocks.map((b) => ({
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
