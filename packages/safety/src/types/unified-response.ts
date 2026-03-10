export type FinishReason = "stop" | "tool_use" | "length" | "content_filter";

export interface ToolCall {
  id: string;
  function_name: string;
  /** JSON-encoded string of arguments */
  arguments: string;
}

export interface UsageMetrics {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface UnifiedResponse {
  /** Schema version. Must match guardrails.config.json schema_version */
  schema_version: 1;
  id: string;
  model_used: string;
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason: FinishReason;
  usage: UsageMetrics;
}
