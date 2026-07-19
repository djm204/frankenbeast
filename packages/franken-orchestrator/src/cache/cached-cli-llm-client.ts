import type { ILlmClient } from '@franken/types';
import type { ILlmObserver } from '../adapters/adapter-llm-client.js';
import { CachedLlmClient } from './cached-llm-client.js';
import { LlmCacheStore } from './llm-cache-store.js';
import { LlmCachePolicy } from './llm-cache-policy.js';
import { ProviderSessionStore } from './provider-session-store.js';
import { CacheMetrics } from './cache-metrics.js';
import { now as deterministicNow, seededRandom } from '@franken/types';

const PROVIDER_SESSION_SCHEMA_VERSION = 2;

interface CliSessionMetadata {
  provider: string;
  model?: string | undefined;
  sessionId: string;
}

interface CliAdapterLike {
  transformRequest(request: unknown): unknown;
  execute(providerRequest: unknown): Promise<unknown>;
  transformResponse(providerResponse: unknown, requestId: string): { content: string | null };
  consumeSessionMetadata?(requestId: string): CliSessionMetadata | undefined;
  getProviderName?(): string;
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
  metrics?: CacheMetrics | undefined;
}

export class CachedCliLlmClient implements ILlmClient {
  private readonly cached: CachedLlmClient;
  private readonly schemaVersion: number;
  private readonly metrics: CacheMetrics;

  constructor(private readonly options: CachedCliLlmClientOptions) {
    this.schemaVersion = options.schemaVersion ?? 1;
    this.metrics = options.metrics ?? new CacheMetrics();
    this.cached = new CachedLlmClient({
      llm: {
        complete: async (prompt: string) => {
          const response = await this.invoke(prompt);
          return response.content;
        },
      },
      cacheStore: new LlmCacheStore(options.cacheRootDir, { schemaVersion: this.schemaVersion }),
      policy: new LlmCachePolicy(),
      providerSessions: new ProviderSessionStore(options.cacheRootDir, {
        schemaVersion: PROVIDER_SESSION_SCHEMA_VERSION,
      }),
      metrics: this.metrics,
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
          resume: async (sessionId: string | undefined, nextPrompt: string) => {
            let response: { content: string; sessionId?: string | undefined };
            let clearSession = false;
            try {
              response = await this.invoke(nextPrompt, workId, sessionId);
            } catch (error) {
              if (!sessionId || !isExpectedStaleSessionError(error)) {
                throw error;
              }
              this.metrics.recordNativeSessionFallback();
              clearSession = true;
              response = await this.invoke(nextPrompt, workId);
            }
            return {
              content: response.content,
              ...(response.sessionId ? { sessionId: response.sessionId } : {}),
              ...(clearSession && !response.sessionId ? { clearSession: true } : {}),
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

  private async invoke(
    prompt: string,
    cacheSessionKey?: string,
    providerSessionId?: string,
  ): Promise<{ content: string; sessionId?: string | undefined }> {
    const requestId = `llm-${deterministicNow()}-${seededRandom.random().toString(16).slice(2)}`;
    const request = {
      id: requestId,
      provider: 'adapter',
      model: this.options.model,
      messages: [{ role: 'user', content: prompt }],
      ...(providerSessionId ? { session_id: providerSessionId } : {}),
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
      const configuredProvider = this.options.cliAdapter.getProviderName?.() ?? this.options.provider;
      const matchingSessionId = sessionMetadata?.provider === configuredProvider
        && (sessionMetadata.model === undefined
          || this.options.model === undefined
          || sessionMetadata.model === this.options.model)
        ? sessionMetadata.sessionId
        : undefined;

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
        ...(matchingSessionId ? { sessionId: matchingSessionId } : {}),
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

function isExpectedStaleSessionError(error: unknown): boolean {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === 'string') {
      messages.push(current);
      break;
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      for (const key of ['message', 'stdout', 'stderr', 'normalizedOutput']) {
        try {
          if (typeof record[key] === 'string') {
            messages.push(record[key]);
          }
        } catch {
          // Ignore hostile getters while classifying an error payload.
        }
      }
      try {
        current = record['cause'];
        continue;
      } catch {
        break;
      }
    }
    break;
  }
  const text = messages.join('\n');
  return /(?:session|conversation).*(?:expired|invalid|not found|no longer exists|stale)|(?:expired|invalid|stale).*(?:session|conversation)|no\s+(?:session|conversation)\s+found/i.test(text);
}
