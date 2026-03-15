import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CachedLlmClient } from '../../../src/cache/cached-llm-client.js';
import { LlmCacheStore } from '../../../src/cache/llm-cache-store.js';
import { LlmCachePolicy } from '../../../src/cache/llm-cache-policy.js';
import { ProviderSessionStore } from '../../../src/cache/provider-session-store.js';
import { CacheMetrics } from '../../../src/cache/cache-metrics.js';
import { FakeLlmAdapter } from '../../helpers/fake-llm-adapter.js';

describe('CachedLlmClient', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  async function createHarness() {
    workDir = await mkdtemp(join(tmpdir(), 'franken-cached-llm-'));
    const rootDir = join(workDir, '.frankenbeast', '.cache', 'llm');
    const llm = new FakeLlmAdapter({ defaultResponse: 'LLM RESULT' });
    const metrics = new CacheMetrics();

    return {
      llm,
      metrics,
      client: new CachedLlmClient({
        llm,
        cacheStore: new LlmCacheStore(rootDir, { schemaVersion: 1 }),
        policy: new LlmCachePolicy(),
        providerSessions: new ProviderSessionStore(rootDir, { schemaVersion: 1 }),
        metrics,
      }),
    };
  }

  it('returns cached responses for repeated calls in the same work scope', async () => {
    const { llm, client, metrics } = await createHarness();

    const request = {
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:99',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 99 summary',
      volatileSuffix: 'new comment text',
    };

    await expect(client.complete(request)).resolves.toBe('LLM RESULT');
    await expect(client.complete(request)).resolves.toBe('LLM RESULT');

    expect(llm.callCount).toBe(1);
    expect(metrics.snapshot()).toMatchObject({
      managedResponseHits: 1,
      managedResponseMisses: 1,
      innerCalls: 1,
    });
  });

  it('reuses project-stable context across work scopes without reusing work-scoped responses', async () => {
    const { llm, client, metrics } = await createHarness();

    await client.complete({
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:99',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 99 summary',
      volatileSuffix: 'new comment text',
    });

    await client.complete({
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:110',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 110 summary',
      volatileSuffix: 'new comment text',
    });

    expect(llm.callCount).toBe(2);
    expect(metrics.snapshot()).toMatchObject({
      projectStableHits: 1,
      managedResponseHits: 0,
      managedResponseMisses: 2,
    });
  });

  it('uses native session results before falling back to the backing llm', async () => {
    const { llm, client, metrics } = await createHarness();
    const resume = vi.fn<
      (sessionId: string | undefined, prompt: string) => Promise<{ content: string; sessionId: string } | undefined>
    >()
      .mockResolvedValueOnce({ content: 'NATIVE RESULT', sessionId: 'sess-99' })
      .mockResolvedValueOnce(undefined);

    const request = {
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:99',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 99 summary',
      volatileSuffix: 'new comment text',
      nativeSession: {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        resume,
      },
    };

    await expect(client.complete(request)).resolves.toBe('NATIVE RESULT');
    await expect(client.complete({
      ...request,
      volatileSuffix: 'different volatile text',
    })).resolves.toBe('LLM RESULT');

    expect(llm.callCount).toBe(1);
    expect(metrics.snapshot()).toMatchObject({
      nativeSessionAttempts: 2,
      nativeSessionHits: 1,
      nativeSessionFallbacks: 1,
      innerCalls: 1,
    });
  });
});
