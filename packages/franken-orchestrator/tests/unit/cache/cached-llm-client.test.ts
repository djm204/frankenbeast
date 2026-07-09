import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const llm = new FakeLlmAdapter({ defaultResponse: 'LLM RESULT' });
    const metrics = new CacheMetrics();

    const policy = new LlmCachePolicy();

    return {
      llm,
      metrics,
      rootDir,
      policy,
      client: new CachedLlmClient({
        llm,
        cacheStore: new LlmCacheStore(rootDir, { schemaVersion: 1 }),
        policy,
        providerSessions: new ProviderSessionStore(rootDir, { schemaVersion: 1 }),
        metrics,
      }),
    };
  }

  async function writeCorruptJson(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{"truncated":', 'utf8');
  }

  function encodeSegment(value: string): string {
    return encodeURIComponent(value);
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

  it('treats corrupt project-stable cache JSON as a miss and calls the backing llm', async () => {
    const { llm, client, metrics, rootDir, policy } = await createHarness();
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
    const computed = policy.buildRequest(request);
    if (!computed.projectStableKey) {
      throw new Error('test request must produce a project-stable key');
    }
    await writeCorruptJson(join(
      rootDir,
      'project',
      encodeSegment(request.scope.projectId),
      'stable',
      `${encodeSegment(computed.projectStableKey)}.json`,
    ));

    await expect(client.complete(request)).resolves.toBe('LLM RESULT');

    expect(llm.callCount).toBe(1);
    expect(metrics.snapshot()).toMatchObject({
      projectStableHits: 0,
      managedResponseMisses: 1,
      innerCalls: 1,
    });
  });

  it('treats corrupt work response cache JSON as a miss and replaces it', async () => {
    const { llm, client, rootDir, policy } = await createHarness();
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
    const computed = policy.buildRequest(request);
    await writeCorruptJson(join(
      rootDir,
      'work',
      encodeSegment(request.scope.projectId),
      encodeSegment(request.scope.workId),
      'entries',
      `${encodeSegment(computed.responseKey)}.json`,
    ));

    await expect(client.complete(request)).resolves.toBe('LLM RESULT');
    await expect(client.complete(request)).resolves.toBe('LLM RESULT');

    expect(llm.callCount).toBe(1);
  });

  it('treats corrupt provider-session JSON as a miss before native-session fallback', async () => {
    const { llm, client, rootDir, metrics } = await createHarness();
    const resume = vi.fn<
      (sessionId: string | undefined, prompt: string) => Promise<{ content: string; sessionId: string } | undefined>
    >().mockResolvedValueOnce(undefined);
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
    await writeCorruptJson(join(
      rootDir,
      'work',
      encodeSegment(request.scope.projectId),
      encodeSegment(request.scope.workId),
      'provider-session.json',
    ));

    await expect(client.complete(request)).resolves.toBe('LLM RESULT');

    expect(resume).toHaveBeenCalledWith(undefined, expect.any(String));
    expect(llm.callCount).toBe(1);
    expect(metrics.snapshot()).toMatchObject({
      nativeSessionAttempts: 1,
      nativeSessionFallbacks: 1,
      innerCalls: 1,
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
