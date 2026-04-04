import type { IAdapter } from './adapter-llm-client.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { LlmRequest } from '@franken/types';

export interface MiddlewareHooks {
  processRequest(request: LlmRequest): LlmRequest;
  processResponse(response: { content: string; usage: { inputTokens: number; outputTokens: number } }): { content: string; usage: { inputTokens: number; outputTokens: number } };
}

/**
 * Adapts ProviderRegistry (async generator streaming) to the IAdapter contract
 * (Promise<string> execute). Optionally applies MiddlewareChain on request/response.
 */
export class ProviderRegistryIAdapter implements IAdapter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly middleware?: MiddlewareHooks,
  ) {}

  transformRequest(request: unknown): LlmRequest {
    const req = request as {
      messages: Array<{ role: string; content: string }>;
      system?: string;
    };
    const raw: LlmRequest = {
      systemPrompt: req.system ?? '',
      messages: req.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: [],
    };
    return this.middleware ? this.middleware.processRequest(raw) : raw;
  }

  async execute(providerRequest: unknown): Promise<string> {
    const request = providerRequest as LlmRequest;
    const chunks: string[] = [];
    for await (const event of this.registry.execute(request)) {
      if (event.type === 'text') chunks.push(event.content);
      if (event.type === 'done') break;
      if (event.type === 'error') throw new Error(event.error);
    }
    return chunks.join('');
  }

  transformResponse(providerResponse: unknown, _requestId: string): { content: string | null } {
    const text = providerResponse as string;
    if (!this.middleware) return { content: text };
    const processed = this.middleware.processResponse({
      content: text,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    return { content: processed.content };
  }

  validateCapabilities(feature: string): boolean {
    return feature === 'text-completion';
  }
}
