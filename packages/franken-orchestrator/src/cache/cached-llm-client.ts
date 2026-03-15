import { CacheMetrics } from './cache-metrics.js';
import { LlmCacheStore } from './llm-cache-store.js';
import { LlmCachePolicy, type CacheablePromptRequest } from './llm-cache-policy.js';
import { ProviderSessionStore } from './provider-session-store.js';

export interface NativeSessionResult {
  content: string;
  sessionId?: string | undefined;
}

export interface NativeSessionController {
  provider: string;
  model: string;
  resume(sessionId: string | undefined, prompt: string): Promise<NativeSessionResult | undefined>;
}

export interface CachedPromptRequest extends CacheablePromptRequest {
  nativeSession?: NativeSessionController | undefined;
}

export interface CachedLlmClientDeps {
  llm: { complete(prompt: string): Promise<string> };
  cacheStore: LlmCacheStore;
  policy: LlmCachePolicy;
  providerSessions: ProviderSessionStore;
  metrics?: CacheMetrics | undefined;
}

export class CachedLlmClient {
  private readonly metrics: CacheMetrics;

  constructor(private readonly deps: CachedLlmClientDeps) {
    this.metrics = deps.metrics ?? new CacheMetrics();
  }

  async complete(request: CachedPromptRequest): Promise<string> {
    const computed = this.deps.policy.buildRequest(request);
    const workId = request.scope.workId;

    if (computed.projectStableKey) {
      const existingProjectStable = await this.deps.cacheStore.loadProjectEntry(
        request.scope.projectId,
        computed.projectStableKey,
      );
      if (existingProjectStable) {
        this.metrics.recordProjectStableHit();
      }
    }

    if (workId) {
      const cachedResponse = await this.deps.cacheStore.loadWorkEntry(
        request.scope.projectId,
        workId,
        computed.responseKey,
      );
      if (cachedResponse) {
        this.metrics.recordManagedResponseHit();
        return cachedResponse.content;
      }
    }
    this.metrics.recordManagedResponseMiss();

    if (request.nativeSession && workId) {
      this.metrics.recordNativeSessionAttempt();
      const existingSession = await this.deps.providerSessions.load({
        projectId: request.scope.projectId,
        workId,
        provider: request.nativeSession.provider,
        model: request.nativeSession.model,
        promptFingerprint: computed.sessionFingerprint,
      });

      try {
        const resumed = await request.nativeSession.resume(existingSession?.sessionId, computed.fullPrompt);
        if (resumed) {
          this.metrics.recordNativeSessionHit();
          const sessionId = resumed.sessionId ?? existingSession?.sessionId;
          if (sessionId) {
            const now = new Date().toISOString();
            await this.deps.providerSessions.save({
              projectId: request.scope.projectId,
              workId,
              provider: request.nativeSession.provider,
              model: request.nativeSession.model,
              sessionId,
              promptFingerprint: computed.sessionFingerprint,
              createdAt: existingSession?.createdAt ?? now,
              updatedAt: now,
            });
          }
          await this.persistCacheArtifacts(request, computed, resumed.content);
          return resumed.content;
        }
      } catch {
        // Fall through to backing llm call.
      }

      this.metrics.recordNativeSessionFallback();
    }

    this.metrics.recordInnerCall();
    const response = await this.deps.llm.complete(computed.fullPrompt);
    await this.persistCacheArtifacts(request, computed, response);
    return response;
  }

  private async persistCacheArtifacts(
    request: CachedPromptRequest,
    computed: ReturnType<LlmCachePolicy['buildRequest']>,
    response: string,
  ): Promise<void> {
    if (computed.projectStableKey && computed.stableText.length > 0) {
      await this.deps.cacheStore.saveProjectEntry(request.scope.projectId, computed.projectStableKey, {
        content: computed.stableText,
        fingerprint: computed.sessionFingerprint,
        createdAt: new Date().toISOString(),
        metadata: {
          kind: 'project',
        },
      });
    }

    if (request.scope.workId && computed.workKey && computed.workText.length > 0) {
      await this.deps.cacheStore.saveWorkEntry(request.scope.projectId, request.scope.workId, computed.workKey, {
        content: computed.workText,
        fingerprint: computed.sessionFingerprint,
        createdAt: new Date().toISOString(),
        metadata: {
          kind: 'work',
        },
      });
    }

    if (request.scope.workId) {
      await this.deps.cacheStore.saveWorkEntry(request.scope.projectId, request.scope.workId, computed.responseKey, {
        content: response,
        fingerprint: computed.sessionFingerprint,
        createdAt: new Date().toISOString(),
        metadata: {
          kind: 'work',
        },
      });
    } else {
      await this.deps.cacheStore.saveProjectEntry(request.scope.projectId, computed.responseKey, {
        content: response,
        fingerprint: computed.sessionFingerprint,
        createdAt: new Date().toISOString(),
        metadata: {
          kind: 'project',
        },
      });
    }
  }
}
