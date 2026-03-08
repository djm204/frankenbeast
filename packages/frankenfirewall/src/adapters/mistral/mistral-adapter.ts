import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";

// TODO: Implement Mistral adapter
// Expected request shape: POST https://api.mistral.ai/v1/chat/completions (OpenAI-compatible)
// Expected response shape: Same as OpenAI — { id, choices: [{ message, finish_reason }], usage: { prompt_tokens, completion_tokens } }

export interface MistralAdapterConfig {
  apiKey: string;
  model: string;
}

export class MistralAdapter extends BaseAdapter implements IAdapter {
  constructor(config: MistralAdapterConfig) {
    super({ costPerInputTokenM: 0, costPerOutputTokenM: 0 });
  }

  validateCapabilities(_feature: CapabilityFeature): boolean {
    throw new Error("Not implemented: MistralAdapter.validateCapabilities");
  }

  transformRequest(_request: UnifiedRequest): unknown {
    throw new Error("Not implemented: MistralAdapter.transformRequest");
  }

  async execute(_providerRequest: unknown): Promise<unknown> {
    throw new Error("Not implemented: MistralAdapter.execute");
  }

  transformResponse(_providerResponse: unknown, _requestId: string): UnifiedResponse {
    throw new Error("Not implemented: MistralAdapter.transformResponse");
  }
}
