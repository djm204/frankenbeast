import type { ILlmClient } from '@franken/types';
import type { ILlmObserver } from '../adapters/adapter-llm-client.js';
import { CachedLlmClient } from './cached-llm-client.js';
import { LlmCacheStore } from './llm-cache-store.js';
import { LlmCachePolicy } from './llm-cache-policy.js';
import { ProviderSessionStore } from './provider-session-store.js';

interface CliSessionMetadata {
  sessionKey: string;
}

interface CliAdapterLike {
  transformRequest(request: unknown): unknown;
  execute(providerRequest: unknown): Promise<unknown>;
  transformResponse(providerResponse: unknown, requestId: string): { content: string | null };
  consumeSessionMetadata?(requestId: string): CliSessionMetadata | undefined;
}

export interface LlmCacheHint {
  operation?: string | undefined;
  workId?: string | undefined;
  stablePrefix?: string | undefined;
  workPrefix?: string | undefined;
  disableNativeSession?: boolean | undefined;
}

export interface CachedCliLlmClientOptions {
  cacheRootDir: string;
  cliAdapter: CliAdapterLike;
  projectId: string;
  provider: string;
  model: string;
  operation: string;
  workId?: string | undefined;
  stablePrefix?: string | undefined;
  workPrefix?: string | undefined;
  schemaVersion?: number | undefined;
  observer?: ILlmObserver | undefined;
}

export class CachedCliLlmClient implements ILlmClient {
  private readonly cached: CachedLlmClient;
  private readonly schemaVersion: number;

  constructor(private readonly options: CachedCliLlmClientOptions) {
    this.schemaVersion = options.schemaVersion ?? 1;
    this.cached = new CachedLlmClient({
      llm: {
        complete: async (prompt: string) => {
          const response = await this.invoke(prompt);
          return response.content;
        },
      },
      cacheStore: new LlmCacheStore(options.cacheRootDir, { schemaVersion: this.schemaVersion }),
      policy: new LlmCachePolicy(),
      providerSessions: new ProviderSessionStore(options.cacheRootDir, { schemaVersion: this.schemaVersion }),
    });
  }

  async complete(prompt: string, hint?: LlmCacheHint): Promise<string> {
    const workId = hint?.workId ?? this.options.workId;
    const stablePrefix = joinNonEmpty([this.options.stablePrefix, hint?.stablePrefix]);
    const workPrefix = joinNonEmpty([this.options.workPrefix, hint?.workPrefix]);
    const nativeSession = !hint?.disableNativeSession && workId
      ? {
          provider: this.options.provider,
          model: this.options.model,
          resume: async (_sessionId: string | undefined, nextPrompt: string) => {
            const response = await this.invoke(nextPrompt, workId);
            return {
              content: response.content,
              sessionId: response.sessionId ?? workId,
            };
          },
        }
      : undefined;

    return this.cached.complete({
      scope: {
        projectId: this.options.projectId,
        ...(workId ? { workId } : {}),
      },
      operation: hint?.operation ?? this.options.operation,
      ...(stablePrefix ? { stablePrefix } : {}),
      ...(workPrefix ? { workPrefix } : {}),
      volatileSuffix: prompt,
      ...(nativeSession ? { nativeSession } : {}),
    });
  }

  private async invoke(prompt: string, cacheSessionKey?: string): Promise<{ content: string; sessionId?: string | undefined }> {
    const requestId = `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const request = {
      id: requestId,
      provider: 'adapter',
      model: this.options.model,
      messages: [{ role: 'user', content: prompt }],
      ...(cacheSessionKey
        ? {
            cacheSession: {
              key: cacheSessionKey,
              persist: true,
            },
          }
        : {}),
    };

    let span: unknown;
    if (this.options.observer) {
      span = this.options.observer.startSpan(this.options.observer.trace, { name: `llm-complete:${requestId}` });
    }

    try {
      const providerRequest = this.options.cliAdapter.transformRequest(request);
      const providerResponse = await this.options.cliAdapter.execute(providerRequest);
      const response = this.options.cliAdapter.transformResponse(providerResponse, requestId);
      const content = response.content ?? '';
      const sessionMetadata = this.options.cliAdapter.consumeSessionMetadata?.(requestId);

      if (this.options.observer && span) {
        this.options.observer.recordTokenUsage(
          span,
          {
            model: this.options.model,
            promptTokens: Math.ceil(prompt.length / 4),
            completionTokens: Math.ceil(content.length / 4),
          },
          this.options.observer.counter,
        );
      }

      return {
        content,
        ...(sessionMetadata?.sessionKey ? { sessionId: sessionMetadata.sessionKey } : {}),
      };
    } finally {
      if (this.options.observer && span) {
        this.options.observer.endSpan(span, { status: 'completed' });
      }
    }
  }
}

export function completeWithCacheHint(
  llm: ILlmClient,
  prompt: string,
  hint?: LlmCacheHint,
): Promise<string> {
  return (llm as CachedCliLlmClient).complete(prompt, hint);
}

function joinNonEmpty(parts: Array<string | undefined>): string | undefined {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0));
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.join('\n');
}
