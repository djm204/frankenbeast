import { afterEach, describe, expect, it, vi } from 'vitest';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CachedCliLlmClient } from '../../../src/cache/cached-cli-llm-client.js';
import { CacheMetrics } from '../../../src/cache/cache-metrics.js';

interface FakeCliAdapter {
  transformRequest: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  transformResponse: ReturnType<typeof vi.fn>;
  consumeSessionMetadata: ReturnType<typeof vi.fn>;
  getProviderName: ReturnType<typeof vi.fn>;
}

function createAdapter(): FakeCliAdapter {
  return {
    transformRequest: vi.fn((request: unknown) => request),
    execute: vi.fn(async (request: { messages: Array<{ content: string }>; cacheSession?: { key: string } }) =>
      `response:${request.messages[0]?.content ?? ''}`),
    transformResponse: vi.fn((raw: string) => ({ content: raw })),
    consumeSessionMetadata: vi.fn((requestId: string) => ({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: `native:${requestId}`,
    })),
    getProviderName: vi.fn(() => 'claude'),
  };
}

describe('CachedCliLlmClient', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  async function createHarness(overrides?: {
    workId?: string;
    operation?: string;
  }) {
    workDir = await mkdtemp(join(tmpdir(), 'franken-cached-cli-llm-'));
    const adapter = createAdapter();
    const client = new CachedCliLlmClient({
      cacheRootDir: join(workDir, '.fbeast', '.cache', 'llm'),
      cliAdapter: adapter as never,
      projectId: 'frankenbeast',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      operation: overrides?.operation ?? 'plan-build',
      workId: overrides?.workId ?? 'plan:alpha',
      stablePrefix: 'surface:plan',
      workPrefix: 'plan:alpha',
    });

    return { adapter, client };
  }

  it('persists exact response cache across client instances for the same work scope', async () => {
    const first = await createHarness();

    await expect(first.client.complete('same prompt')).resolves.toContain('same prompt');
    expect(first.adapter.execute).toHaveBeenCalledTimes(1);

    const secondAdapter = createAdapter();
    const secondClient = new CachedCliLlmClient({
      cacheRootDir: join(workDir!, '.fbeast', '.cache', 'llm'),
      cliAdapter: secondAdapter as never,
      projectId: 'frankenbeast',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      operation: 'plan-build',
      workId: 'plan:alpha',
      stablePrefix: 'surface:plan',
      workPrefix: 'plan:alpha',
    });

    await expect(secondClient.complete('same prompt')).resolves.toContain('same prompt');
    expect(secondAdapter.execute).not.toHaveBeenCalled();
  });

  it('keeps identical prompts isolated between work scopes', async () => {
    const issue99 = await createHarness({ workId: 'issue:99', operation: 'issue-graph' });
    await expect(issue99.client.complete('same prompt')).resolves.toContain('same prompt');

    const issue110Adapter = createAdapter();
    const issue110 = new CachedCliLlmClient({
      cacheRootDir: join(workDir!, '.fbeast', '.cache', 'llm'),
      cliAdapter: issue110Adapter as never,
      projectId: 'frankenbeast',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      operation: 'issue-graph',
      workId: 'issue:110',
      stablePrefix: 'surface:issues',
      workPrefix: 'issue:110',
    });

    await expect(issue110.complete('same prompt')).resolves.toContain('same prompt');
    expect(issue110Adapter.execute).toHaveBeenCalledTimes(1);
  });

  it('reuses the same native session key across prompt variations in one work scope', async () => {
    const { adapter, client } = await createHarness({ workId: 'issue:99', operation: 'issue-graph' });

    await expect(client.complete('first prompt')).resolves.toContain('first prompt');
    await expect(client.complete('second prompt')).resolves.toContain('second prompt');

    expect(adapter.transformRequest).toHaveBeenCalledTimes(2);
    expect(adapter.transformRequest.mock.calls[0]?.[0]).toMatchObject({
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });
    expect(adapter.transformRequest.mock.calls[1]?.[0]).toMatchObject({
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });
    expect(adapter.transformRequest.mock.calls[0]?.[0]).not.toHaveProperty('session_id');
    const firstRequestId = (adapter.transformRequest.mock.calls[0]?.[0] as { id?: string }).id;
    expect(adapter.transformRequest.mock.calls[1]?.[0]).toMatchObject({
      session_id: `native:${firstRequestId}`,
    });
  });

  it('retries once with a fresh isolated session when the stored provider session is stale', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-cached-cli-'));
    const adapter = createAdapter();
    adapter.consumeSessionMetadata
      .mockReturnValueOnce({ provider: 'claude', model: 'claude-sonnet-4-6', sessionId: 'stored-session' })
      .mockReturnValue(undefined);
    const metrics = new CacheMetrics();
    const client = new CachedCliLlmClient({
      cacheRootDir: join(workDir, '.fbeast', '.cache', 'llm'),
      cliAdapter: adapter as never,
      projectId: 'frankenbeast',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      operation: 'plan-build',
      workId: 'plan:alpha',
      metrics,
    });

    await client.complete('first prompt');
    adapter.execute
      .mockRejectedValueOnce(new Error('Claude CLI failed', {
        cause: { stdout: 'No conversation found with session ID: stored-session', stderr: '' },
      }))
      .mockResolvedValueOnce('response:fresh');

    await expect(client.complete('second prompt')).resolves.toBe('response:fresh');

    expect(adapter.transformRequest.mock.calls[1]?.[0]).toHaveProperty('session_id');
    expect(adapter.transformRequest.mock.calls[2]?.[0]).not.toHaveProperty('session_id');
    expect(adapter.execute).toHaveBeenCalledTimes(3);
    expect(metrics.snapshot()).toMatchObject({ nativeSessionFallbacks: 1 });
    await expect(access(join(
      workDir,
      '.fbeast',
      '.cache',
      'llm',
      'work',
      'frankenbeast',
      'plan%3Aalpha',
      'provider-session.json',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('ignores legacy provider-session records that contain application work keys', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-cached-cli-'));
    const sessionDir = join(
      workDir,
      '.fbeast',
      '.cache',
      'llm',
      'work',
      'frankenbeast',
      'plan%3Alegacy',
    );
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'provider-session.json'), JSON.stringify({
      schemaVersion: 1,
      projectId: 'frankenbeast',
      workId: 'plan:legacy',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'plan:legacy',
      promptFingerprint: 'legacy-fingerprint',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    const adapter = createAdapter();
    const client = new CachedCliLlmClient({
      cacheRootDir: join(workDir, '.fbeast', '.cache', 'llm'),
      cliAdapter: adapter as never,
      projectId: 'frankenbeast',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      operation: 'plan-build',
      workId: 'plan:legacy',
    });

    await client.complete('first prompt');

    expect(adapter.transformRequest.mock.calls[0]?.[0]).not.toHaveProperty('session_id');

    const bumpedClient = new CachedCliLlmClient({
      cacheRootDir: join(workDir, '.fbeast', '.cache', 'llm'),
      cliAdapter: adapter as never,
      projectId: 'frankenbeast',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      operation: 'plan-build',
      workId: 'plan:legacy',
      schemaVersion: 3,
    });
    await bumpedClient.complete('second prompt');
    expect(adapter.transformRequest.mock.calls[1]?.[0]).not.toHaveProperty('session_id');
  });

  it('keeps provider-issued sessions for aliases when the CLI model is implicit', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-cached-cli-'));
    const adapter = createAdapter();
    adapter.consumeSessionMetadata.mockImplementation((requestId: string) => ({
      provider: 'claude',
      model: undefined,
      sessionId: `native:${requestId}`,
    }));
    const client = new CachedCliLlmClient({
      cacheRootDir: join(workDir, '.fbeast', '.cache', 'llm'),
      cliAdapter: adapter as never,
      projectId: 'frankenbeast',
      provider: 'prod-claude',
      model: 'prod-claude',
      operation: 'plan-build',
      workId: 'plan:alias',
    });

    await client.complete('first prompt');
    await client.complete('second prompt');

    const firstRequestId = (adapter.transformRequest.mock.calls[0]?.[0] as { id?: string }).id;
    expect(adapter.transformRequest.mock.calls[1]?.[0]).toMatchObject({
      session_id: `native:${firstRequestId}`,
    });
  });
});
