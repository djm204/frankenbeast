import type { ILlmClient } from '@franken/types';

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

export interface ILlmObserver {
  counter: {
    record(entry: { model: string; promptTokens: number; completionTokens: number }): void;
  };
  startSpan(trace: any, opts: { name: string }): any;
  endSpan(span: any, opts: { status: string }): void;
  recordTokenUsage(span: any, usage: { promptTokens: number; completionTokens: number; model: string }, counter: any): void;
  trace: any;
}

export class AdapterLlmClient implements ILlmClient {
  private readonly adapter: IAdapter;
  private readonly observer?: ILlmObserver | undefined;
  private readonly defaultModel: string;

  constructor(adapter: IAdapter, observer?: ILlmObserver, defaultModel = 'claude') {
    this.adapter = adapter;
    this.observer = observer;
    this.defaultModel = defaultModel;
  }

  async complete(prompt: string): Promise<string> {
    const requestId = `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const model = this.defaultModel;
    
    const request: UnifiedRequest = {
      id: requestId,
      provider: 'adapter',
      model,
      messages: [{ role: 'user', content: prompt }],
    };

    let span: any;
    if (this.observer) {
      span = this.observer.startSpan(this.observer.trace, { name: `llm-complete:${requestId}` });
    }

    try {
      const providerRequest = this.adapter.transformRequest(request);
      const providerResponse = await this.adapter.execute(providerRequest);
      const response = this.adapter.transformResponse(providerResponse, requestId);
      const content = response.content ?? '';

      if (this.observer && span) {
        const promptTokens = Math.ceil(prompt.length / 4);
        const completionTokens = Math.ceil(content.length / 4);
        this.observer.recordTokenUsage(
          span,
          {
            model,
            promptTokens,
            completionTokens,
          },
          this.observer.counter,
        );
      }

      return content;
    } finally {
      if (this.observer && span) {
        this.observer.endSpan(span, { status: 'completed' });
      }
    }
  }
}
