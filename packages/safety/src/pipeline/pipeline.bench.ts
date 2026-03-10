import { bench, describe, vi } from "vitest";
import { runPipeline } from "./pipeline.js";
import type { IAdapter } from "../adapters/index.js";
import type { UnifiedRequest, UnifiedResponse } from "../types/index.js";
import type { GuardrailsConfig } from "../config/index.js";

const CLEAN_RESPONSE: UnifiedResponse = {
  schema_version: 1,
  id: "req-bench",
  model_used: "claude-sonnet-4-6",
  content: "const x = 1;",
  tool_calls: [],
  finish_reason: "stop",
  usage: { input_tokens: 10, output_tokens: 8, cost_usd: 0.00015 },
};

const CONFIG: GuardrailsConfig = {
  project_name: "Bench",
  security_tier: "STRICT",
  schema_version: 1,
  agnostic_settings: {
    redact_pii: true,
    max_token_spend_per_call: 0.10,
    allowed_providers: ["anthropic"],
  },
  safety_hooks: { pre_flight: [], post_flight: [] },
  dependency_whitelist: [],
};

const REQUEST: UnifiedRequest = {
  id: "req-bench",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "Write a hello world function." }],
};

const adapter: IAdapter = {
  transformRequest: () => ({}),
  execute: async () => ({}),
  transformResponse: () => CLEAN_RESPONSE,
  validateCapabilities: () => true,
};

describe("runPipeline — performance baseline", () => {
  bench(
    "full pipeline with all 6 interceptors (no violations)",
    async () => {
      await runPipeline(REQUEST, adapter, CONFIG);
    },
    { time: 1000 },
  );
});
