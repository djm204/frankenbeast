import type { ILlmClient, LlmCompletionOptions, LlmCompletionResult, ProviderContext, TokenUsage } from '@franken/types';
import { now as deterministicNow, seededRandom } from '@franken/types';

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
  sessionContinue?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type UnifiedResponse = {
  content: string | null;
  /** Present only when the underlying provider reported real token usage. */
  usage?: TokenUsage;
  /** The CLI provider/model that actually served this completion, and any fallback that occurred. */
  providerContext?: ProviderContext;
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

export class AdapterLlmError extends Error {
  constructor(
    message: string,
    public readonly requestId: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AdapterLlmError';
  }
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

  async complete(
    prompt: string,
    options?: LlmCompletionOptions & { sessionContinue?: boolean; sessionId?: string },
  ): Promise<string> {
    const { content } = await this.runComplete(prompt, options);
    return content;
  }

  async completeWithUsage(
    prompt: string,
    options?: LlmCompletionOptions & { sessionContinue?: boolean; sessionId?: string },
  ): Promise<LlmCompletionResult> {
    const { content, usage, providerContext } = await this.runComplete(prompt, options);
    return { text: content, ...(usage ? { usage } : {}), ...(providerContext ? { providerContext } : {}) };
  }

  private async runComplete(
    prompt: string,
    options?: LlmCompletionOptions & { sessionContinue?: boolean; sessionId?: string },
  ): Promise<{ content: string; usage?: TokenUsage; providerContext?: ProviderContext }> {
    const requestId = `llm-${deterministicNow()}-${seededRandom.random().toString(16).slice(2)}`;
    const model = this.defaultModel;

    const request: UnifiedRequest = {
      id: requestId,
      provider: 'adapter',
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(options?.sessionId ? { session_id: options.sessionId } : {}),
      ...(options?.sessionContinue !== undefined ? { sessionContinue: options.sessionContinue } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    };

    let span: any;
    if (this.observer) {
      span = this.observer.startSpan(this.observer.trace, { name: `llm-complete:${requestId}` });
    }

    let failed = false;
    try {
      let content: string | null;
      let usage: TokenUsage | undefined;
      let providerContext: ProviderContext | undefined;
      try {
        const providerRequest = this.adapter.transformRequest(request);
        const providerResponse = await this.adapter.execute(providerRequest);
        const response = this.adapter.transformResponse(providerResponse, requestId);
        content = response.content;
        usage = response.usage;
        providerContext = response.providerContext;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new AdapterLlmError(
          `LLM adapter call failed for request ${requestId}: ${message}`,
          requestId,
          { cause: error },
        );
      }

      if (content == null) {
        // An absent completion must not silently become an empty plan downstream.
        throw new AdapterLlmError(
          `LLM adapter returned no content for request ${requestId}`,
          requestId,
        );
      }

      if (this.observer && span) {
        // Prefer the provider's real usage when available; fall back to the
        // character-count estimate only when the provider didn't report it.
        const promptTokens = usage?.inputTokens ?? Math.ceil(prompt.length / 4);
        const completionTokens = usage?.outputTokens ?? Math.ceil(content.length / 4);
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

      return { content, ...(usage ? { usage } : {}), ...(providerContext ? { providerContext } : {}) };
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (this.observer && span) {
        this.observer.endSpan(span, { status: failed ? 'error' : 'completed' });
      }
    }
  }
}
