import type { ILlmClient } from '@franken/core';

type UnifiedRequest = {
  id: string;
  provider: string;
  model: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  max_tokens?: number;
  session_id?: string;
};

type UnifiedResponse = {
  content: string | null;
};

export interface IAdapter {
  transformRequest(request: UnifiedRequest): unknown;
  execute(providerRequest: unknown): Promise<unknown>;
  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;
  validateCapabilities(feature: string): boolean;
}

export class AdapterLlmClient implements ILlmClient {
  private readonly adapter: IAdapter;

  constructor(adapter: IAdapter) {
    this.adapter = adapter;
  }

  async complete(prompt: string): Promise<string> {
    const requestId = `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const request: UnifiedRequest = {
      id: requestId,
      provider: 'adapter',
      model: 'adapter',
      messages: [{ role: 'user', content: prompt }],
    };

    const providerRequest = this.adapter.transformRequest(request);
    const providerResponse = await this.adapter.execute(providerRequest);
    const response = this.adapter.transformResponse(providerResponse, requestId);
    return response.content ?? '';
  }
}
