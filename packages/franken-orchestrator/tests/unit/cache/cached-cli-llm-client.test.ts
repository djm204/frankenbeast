import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CachedCliLlmClient } from '../../../src/cache/cached-cli-llm-client.js';

interface FakeCliAdapter {
  transformRequest: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  transformResponse: ReturnType<typeof vi.fn>;
  consumeSessionMetadata: ReturnType<typeof vi.fn>;
}

function createAdapter(): FakeCliAdapter {
  return {
    transformRequest: vi.fn((request: unknown) => request),
    execute: vi.fn(async (request: { messages: Array<{ content: string }>; cacheSession?: { key: string } }) =>
      `response:${request.messages[0]?.content ?? ''}`),
    transformResponse: vi.fn((raw: string) => ({ content: raw })),
    consumeSessionMetadata: vi.fn((requestId: string) => ({ sessionKey: `native:${requestId}` })),
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
  });
});
