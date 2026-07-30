import type { ILlmClient, LlmCompletionOptions, LlmCompletionResult, ProviderContext, TokenUsage } from '@franken/types';
import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '../logging/redaction.js';

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

const MAX_OUTWARD_ERROR_CONTEXT_LENGTH = 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_TIMEOUT_MS = 2_147_483_647;

function normalizeRequestTimeout(timeoutMs: number | undefined): number {
  const normalized = timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('LLM request timeoutMs must be a finite positive number');
  }
  if (normalized > MAX_REQUEST_TIMEOUT_MS) {
    throw new Error(`LLM request timeoutMs must be less than or equal to ${MAX_REQUEST_TIMEOUT_MS}`);
  }
  return normalized;
}

function settleOrAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const rejectOnAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', rejectOnAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', rejectOnAbort);
    });
  });
}

function safeAdapterErrorContext(error: unknown): string {
  let errorClass: string = typeof error;
  let message = 'No diagnostic available';
  let errorValue: Error | undefined;
  try {
    if (error instanceof Error) {
      errorValue = error;
    }
  } catch {
    // Treat values with hostile prototype traps as opaque thrown values.
  }
  if (errorValue) {
    try {
      errorClass = String(errorValue.name);
    } catch {
      errorClass = 'Error';
    }
    try {
      message = String(errorValue.message);
    } catch {
      // Keep the fixed safe fallback when an untrusted error getter throws.
    }
  } else {
    try {
      message = String(error);
    } catch {
      // Keep the fixed safe fallback when an untrusted conversion throws.
    }
  }
  const safeClass = redactSensitiveText(errorClass.replace(/\s+/gu, ' ')).trim().slice(0, 100);
  const safeMessage = redactSensitiveText(message.replace(/\s+/gu, ' '))
    .trim()
    .slice(0, MAX_OUTWARD_ERROR_CONTEXT_LENGTH);
  return redactSensitiveText(
    `${safeClass || 'Error'}: ${safeMessage || 'No diagnostic available'}`,
  );
}

export interface IAdapter {
  /** Set only when execute() enforces request.timeoutMs and cancels its underlying work. */
  readonly managesRequestTimeout?: boolean;
  transformRequest(request: UnifiedRequest): unknown;
  execute(providerRequest: unknown, signal?: AbortSignal): Promise<unknown>;
  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;
  validateCapabilities(feature: string): boolean;
}

export interface ILlmObserver {
  counter: {
    record(entry: {
      model: string;
      promptTokens: number;
      completionTokens: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
      cacheCreation1hTokens?: number;
    }): void;
  };
  startSpan(trace: any, opts: { name: string }): any;
  endSpan(span: any, opts: { status: string }): void;
  recordTokenUsage(span: any, usage: {
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    cacheCreation1hTokens?: number;
    model: string;
  }, counter: any): void;
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
    const requestId = `llm-${randomUUID()}`;
    const model = this.defaultModel;
    const timeoutMs = normalizeRequestTimeout(options?.timeoutMs);
    const controller = new AbortController();
    const abortFromCaller = (): void => {
      controller.abort(
        options?.signal?.reason instanceof Error
          ? options.signal.reason
          : new Error('LLM request cancelled'),
      );
    };
    if (options?.signal?.aborted) {
      abortFromCaller();
    } else {
      options?.signal?.addEventListener('abort', abortFromCaller, { once: true });
    }
    const timeout = this.adapter.managesRequestTimeout || controller.signal.aborted
      ? undefined
      : setTimeout(() => {
          controller.abort(
            Object.assign(new Error(`LLM request timeout after ${timeoutMs}ms`), { code: 'ETIMEDOUT' }),
          );
        }, timeoutMs);

    const request: UnifiedRequest = {
      id: requestId,
      provider: 'adapter',
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(options?.sessionId ? { session_id: options.sessionId } : {}),
      ...(options?.sessionContinue !== undefined ? { sessionContinue: options.sessionContinue } : {}),
      signal: controller.signal,
      ...(!this.adapter.managesRequestTimeout || options?.timeoutMs !== undefined ? { timeoutMs } : {}),
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
        if (controller.signal.aborted) throw controller.signal.reason;
        const providerRequest = this.adapter.transformRequest(request);
        const providerResponse = await settleOrAbort(
          this.adapter.execute(providerRequest, controller.signal),
          controller.signal,
        );
        const response = this.adapter.transformResponse(providerResponse, requestId);
        content = response.content;
        usage = response.usage;
        providerContext = response.providerContext;
      } catch (error) {
        throw new AdapterLlmError(
          `LLM adapter call failed for request ${requestId}: ${safeAdapterErrorContext(error)}`,
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
            ...(usage?.cacheReadTokens !== undefined
              ? { cacheReadTokens: usage.cacheReadTokens }
              : {}),
            ...(usage?.cacheCreationTokens !== undefined
              ? { cacheCreationTokens: usage.cacheCreationTokens }
              : {}),
            ...(usage?.cacheCreation1hTokens !== undefined
              ? { cacheCreation1hTokens: usage.cacheCreation1hTokens }
              : {}),
          },
          this.observer.counter,
        );
      }

      return { content, ...(usage ? { usage } : {}), ...(providerContext ? { providerContext } : {}) };
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      options?.signal?.removeEventListener('abort', abortFromCaller);
      if (this.observer && span) {
        this.observer.endSpan(span, { status: failed ? 'error' : 'completed' });
      }
    }
  }
}
