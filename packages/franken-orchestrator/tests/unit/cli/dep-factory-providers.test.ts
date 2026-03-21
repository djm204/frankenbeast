import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import type { CliDepOptions } from '../../../src/cli/dep-factory.js';

// ── Mock heavy dependencies to isolate provider wiring ──

vi.mock('../../../src/logging/beast-logger.js', () => ({
  BeastLogger: vi.fn(function (this: Record<string, unknown>) {
    this.info = vi.fn();
    this.debug = vi.fn();
    this.warn = vi.fn();
    this.error = vi.fn();
    this.getLogEntries = vi.fn(() => []);
  }),
}));

const MockMartinLoop = vi.fn(function () {});
vi.mock('../../../src/skills/martin-loop.js', () => ({
  MartinLoop: MockMartinLoop,
}));

vi.mock('../../../src/skills/git-branch-isolator.js', () => ({
  GitBranchIsolator: vi.fn(function () {}),
}));

vi.mock('../../../src/adapters/cli-observer-bridge.js', () => ({
  CliObserverBridge: vi.fn(function (this: Record<string, unknown>) {
    this.startTrace = vi.fn();
    this.observerDeps = {};
  }),
}));

vi.mock('../../../src/checkpoint/file-checkpoint-store.js', () => ({
  FileCheckpointStore: vi.fn(function () {}),
}));

const MockCliLlmAdapter = vi.fn(function () {
  return {
    transformRequest: vi.fn(),
    execute: vi.fn(),
    transformResponse: vi.fn(),
    validateCapabilities: vi.fn(),
  };
});
vi.mock('../../../src/adapters/cli-llm-adapter.js', () => ({
  CliLlmAdapter: MockCliLlmAdapter,
}));

vi.mock('../../../src/adapters/adapter-llm-client.js', () => ({
  AdapterLlmClient: vi.fn(function () {}),
}));

vi.mock('../../../src/cache/cached-cli-llm-client.js', () => ({
  CachedCliLlmClient: vi.fn(function () {
    return {
      complete: vi.fn(async () => 'cached response'),
    };
  }),
  completeWithCacheHint: vi.fn(async (_llm: unknown, prompt: string) => prompt),
}));

vi.mock('../../../src/closure/pr-creator.js', () => ({
  PrCreator: vi.fn(function () {
    return { generateCommitMessage: vi.fn() };
  }),
}));

vi.mock('../../../src/skills/cli-skill-executor.js', () => ({
  CliSkillExecutor: vi.fn(function () {}),
}));

vi.mock('../../../src/cli/trace-viewer.js', () => ({
  setupTraceViewer: vi.fn(async () => ({ stop: vi.fn() })),
}));

vi.mock('../../../src/session/chunk-session-store.js', () => ({
  FileChunkSessionStore: vi.fn(function () {
    return { list: vi.fn(() => []), load: vi.fn(), save: vi.fn(), remove: vi.fn() };
  }),
}));

vi.mock('../../../src/session/chunk-session-snapshot-store.js', () => ({
  FileChunkSessionSnapshotStore: vi.fn(function () {
    return { save: vi.fn(), load: vi.fn(), list: vi.fn(() => []) };
  }),
}));

vi.mock('../../../src/session/chunk-session-renderer.js', () => ({
  ChunkSessionRenderer: vi.fn(function () {
    return { render: vi.fn(() => '') };
  }),
}));

vi.mock('../../../src/session/chunk-session-compactor.js', () => ({
  ChunkSessionCompactor: vi.fn(function () {
    return { compact: vi.fn() };
  }),
}));

vi.mock('../../../src/session/chunk-session-gc.js', () => ({
  ChunkSessionGc: vi.fn(function () {
    return { collect: vi.fn() };
  }),
}));

vi.mock('../../../src/adapters/episodic-memory-port-adapter.js', () => ({
  EpisodicMemoryPortAdapter: vi.fn(function () {
    return { hydrate: vi.fn(async () => ({ context: '' })) };
  }),
}));

vi.mock('../../../src/issues/issue-fetcher.js', () => ({
  IssueFetcher: vi.fn(function () {}),
}));

vi.mock('../../../src/issues/issue-triage.js', () => ({
  IssueTriage: vi.fn(function () {}),
}));

vi.mock('../../../src/issues/issue-graph-builder.js', () => ({
  IssueGraphBuilder: vi.fn(function () {}),
}));

vi.mock('../../../src/issues/issue-review.js', () => ({
  IssueReview: vi.fn(function () {}),
}));

vi.mock('../../../src/issues/issue-runner.js', () => ({
  IssueRunner: vi.fn(function () {}),
}));

vi.mock('franken-brain', () => ({
  MemoryOrchestrator: vi.fn(function () {}),
  EpisodicMemoryStore: vi.fn(function () {}),
  SemanticMemoryStore: vi.fn(function () {}),
  WorkingMemoryStore: vi.fn(function () {}),
}));

vi.mock('@franken/critique', () => ({
  createReviewer: vi.fn(() => ({
    review: vi.fn(async () => ({
      verdict: 'pass',
      iterations: [
        {
          result: {
            overallScore: 1,
            results: [],
          },
        },
      ],
    })),
  })),
}));

// ── Helpers ──

function makeOpts(overrides: Partial<CliDepOptions> = {}): CliDepOptions {
  const testDir = resolve(tmpdir(), `fb-dep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  const paths = getProjectPaths(testDir);
  scaffoldFrankenbeast(paths);
  return {
    paths,
    baseBranch: 'main',
    budget: 5,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
    enabledModules: {
      firewall: false,
      skills: false,
      memory: false,
      planner: false,
      critique: false,
      governor: false,
      heartbeat: false,
    },
    ...overrides,
  };
}

// ── Tests ──

describe('dep-factory provider wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws descriptive error for unknown provider name', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ provider: 'unknown-provider' });
    await expect(createCliDeps(opts)).rejects.toThrow(/Unknown provider "unknown-provider"/);
  });

  for (const name of ['claude', 'codex', 'gemini', 'aider']) {
    it(`accepts built-in provider "${name}" without error`, async () => {
      const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
      const opts = makeOpts({ provider: name });
      const result = await createCliDeps(opts);
      expect(result.cliLlmAdapter).toBeDefined();
    }, 10_000);
  }

  it('passes ProviderRegistry to MartinLoop', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ provider: 'claude' });
    await createCliDeps(opts);
    expect(MockMartinLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        get: expect.any(Function),
        has: expect.any(Function),
        names: expect.any(Function),
      }),
    );
  });

  it('passes resolved provider to CliLlmAdapter', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ provider: 'codex' });
    await createCliDeps(opts);
    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codex' }),
      expect.objectContaining({ workingDir: expect.any(String) }),
    );
  });

  it('prefers top-level runConfig.provider over the CLI provider when no llm default override is set', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      runConfig: {
        provider: 'codex',
        objective: 'Use run config provider',
      },
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codex' }),
      expect.any(Object),
    );
  });

  it('prefers top-level runConfig.model when no llm default model override is set', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      runConfig: {
        provider: 'claude',
        objective: 'Use run config model',
        model: 'claude-sonnet-4-6',
      },
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('prefers llmConfig.default provider and model over top-level runConfig values', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      runConfig: {
        provider: 'codex',
        objective: 'Prefer llmConfig default values',
        model: 'top-level-model',
        llmConfig: {
          default: {
            provider: 'gemini',
            model: 'gemini-2.5-pro',
          },
        },
      },
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'gemini' }),
      expect.objectContaining({ model: 'gemini-2.5-pro' }),
    );
  });

  it('applies command override from providersConfig', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      providersConfig: { claude: { command: '/usr/local/bin/claude' } },
    });
    await createCliDeps(opts);
    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({ commandOverride: '/usr/local/bin/claude' }),
    );
  }, 10_000);

  it('preserves AdapterLlmClient, PrCreator, CliSkillExecutor wiring', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const { AdapterLlmClient } = await import('../../../src/adapters/adapter-llm-client.js');
    const { PrCreator } = await import('../../../src/closure/pr-creator.js');
    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const opts = makeOpts({ noPr: false });
    const result = await createCliDeps(opts);

    expect(AdapterLlmClient).toHaveBeenCalled();
    expect(PrCreator).toHaveBeenCalled();
    expect(CliSkillExecutor).toHaveBeenCalled();
    expect(result.deps.cliExecutor).toBeDefined();
  }, 10_000);

  it('passes selected provider defaults to CliSkillExecutor', { timeout: 10_000 }, async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'codex',
      providers: ['codex'],
      providersConfig: { codex: { command: '/usr/local/bin/codex' } },
    });

    await createCliDeps(opts);

    const cliExecutorCall = (await import('../../../src/skills/cli-skill-executor.js')).CliSkillExecutor as unknown as {
      mock: { calls: unknown[][] };
    };

    expect(cliExecutorCall.mock.calls[0]?.[6]).toEqual(expect.objectContaining({
      provider: 'codex',
      providers: ['codex'],
      command: '/usr/local/bin/codex',
    }));
  });

  it('creates issue-scoped runtime artifact helpers for the issues pipeline', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      issueIO: {
        read: vi.fn(async () => 'y'),
        write: vi.fn(),
      },
    });

    const result = await createCliDeps(opts);
    const artifacts = result.issueDeps?.issueRuntime?.artifactsForIssue(89);

    expect(artifacts).toEqual(expect.objectContaining({
      planName: 'issue-89',
      planDir: expect.stringContaining('issue-89'),
      checkpointFile: expect.stringContaining('issue-89'),
      logFile: expect.stringContaining('issue-89'),
    }));
  });

  it('clears issue-scoped runtime artifacts when reset is requested', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      reset: true,
      issueIO: {
        read: vi.fn(async () => 'y'),
        write: vi.fn(),
      },
    });

    const issueCheckpoint = resolve(opts.paths.buildDir, 'issues', 'issue-89', 'issue-89.checkpoint');
    const chunkSession = resolve(opts.paths.chunkSessionsDir, 'issue-89', 'issue-89.json');
    mkdirSync(resolve(opts.paths.buildDir, 'issues', 'issue-89'), { recursive: true });
    mkdirSync(resolve(opts.paths.chunkSessionsDir, 'issue-89'), { recursive: true });
    writeFileSync(issueCheckpoint, 'impl:issue-89\n');
    writeFileSync(chunkSession, '{}');

    await createCliDeps(opts);

    expect(existsSync(issueCheckpoint)).toBe(false);
    expect(existsSync(chunkSession)).toBe(false);
  });
});
