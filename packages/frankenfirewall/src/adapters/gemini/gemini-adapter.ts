import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";

// TODO: Implement Gemini adapter
// Expected request shape: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// Expected response shape: { candidates: [{ content: { parts: [{ text }] }, finishReason }], usageMetadata: { promptTokenCount, candidatesTokenCount } }

export interface GeminiAdapterConfig {
  apiKey: string;
  model: string;
}

export class GeminiAdapter extends BaseAdapter implements IAdapter {
  constructor(config: GeminiAdapterConfig) {
    super({ costPerInputTokenM: 0, costPerOutputTokenM: 0 });
  }

  validateCapabilities(_feature: CapabilityFeature): boolean {
    throw new Error("Not implemented: GeminiAdapter.validateCapabilities");
  }

  transformRequest(_request: UnifiedRequest): unknown {
    throw new Error("Not implemented: GeminiAdapter.transformRequest");
  }

  async execute(_providerRequest: unknown): Promise<unknown> {
    throw new Error("Not implemented: GeminiAdapter.execute");
  }

  transformResponse(_providerResponse: unknown, _requestId: string): UnifiedResponse {
    throw new Error("Not implemented: GeminiAdapter.transformResponse");
  }
}
