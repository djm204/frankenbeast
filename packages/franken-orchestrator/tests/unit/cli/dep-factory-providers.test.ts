import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import { parseOrchestratorConfig } from '../../../src/config/orchestrator-config.js';
import type { CliDepOptions } from '../../../src/cli/dep-factory.js';

// ── Mock heavy dependencies to isolate provider wiring ──

const mockBridgeReplayManifest: Array<{ version: 1; kind: 'llm.request' | 'llm.response' | 'tool.call' | 'tool.result'; runId: string; timestamp: string; contentRef: string }> = [];
const optionalModuleMocks = vi.hoisted(() => {
  const createReviewer = vi.fn(() => ({
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
  }));
  return {
    critiqueError: undefined as unknown,
    governorError: undefined as unknown,
    createReviewer,
    ApprovalGateway: vi.fn(function () {}),
    CliChannel: vi.fn(function () {}),
    defaultConfig: vi.fn(() => ({})),
  };
});
const traceViewerMocks = vi.hoisted(() => ({
  stop: vi.fn(async () => {}),
}));
const observerDepsMocks = vi.hoisted(() => ({
  enabled: { kind: 'enabled-observer-deps' },
  disabled: { kind: 'disabled-observer-deps' },
}));

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
    this.getActiveSessionId = vi.fn(() => undefined);
    this.recordReplay = vi.fn();
    this.getReplayManifest = vi.fn(() => [...mockBridgeReplayManifest]);
    this.observerDeps = observerDepsMocks.enabled;
    this.disabledObserverDeps = observerDepsMocks.disabled;
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

const MockCachedCliLlmClient = vi.fn(function () {
  return {
    complete: vi.fn(async () => 'cached response'),
  };
});
vi.mock('../../../src/cache/cached-cli-llm-client.js', () => ({
  CachedCliLlmClient: MockCachedCliLlmClient,
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
  setupTraceViewer: vi.fn(async () => ({ stop: traceViewerMocks.stop })),
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

vi.mock('../../../src/cli/dep-bridge.js', () => ({
  bridgeToBeastConfig: vi.fn(() => ({ providers: [{ name: 'claude', type: 'claude-cli' }] })),
  bridgeToExistingDeps: vi.fn((components: Record<string, unknown>) => components),
}));

vi.mock('../../../src/cli/create-beast-deps.js', () => ({
  createBeastDeps: vi.fn((_config: unknown, existing: Record<string, unknown>) => ({
    firewall: { runPipeline: vi.fn(async (input: string) => ({ sanitizedText: input, violations: [], blocked: false })) },
    skills: { hasSkill: vi.fn(() => false), getAvailableSkills: vi.fn(() => []), execute: vi.fn() },
    memory: { frontload: vi.fn(), getContext: vi.fn(async () => ({ adrs: [], knownErrors: [], rules: [] })), recordTrace: vi.fn() },
    heartbeat: { pulse: vi.fn(async () => ({ improvements: [], techDebt: [], summary: '' })) },
    observer: existing.observer,
    planner: existing.planner,
    critique: existing.critique,
    governor: existing.governor,
    logger: existing.logger,
    clock: existing.clock ?? (() => new Date()),
    ...(existing.cliExecutor ? { cliExecutor: existing.cliExecutor } : {}),
    ...(existing.checkpoint ? { checkpoint: existing.checkpoint } : {}),
    ...(existing.prCreator ? { prCreator: existing.prCreator } : {}),
    ...(existing.runConfigOverrides ? { runConfigOverrides: existing.runConfigOverrides } : {}),
    sqliteBrain: { close: vi.fn() },
  })),
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

vi.mock('@franken/brain', () => ({
  MemoryOrchestrator: vi.fn(function () {}),
  EpisodicMemoryStore: vi.fn(function () {}),
  SemanticMemoryStore: vi.fn(function () {}),
  WorkingMemoryStore: vi.fn(function () {}),
}));

vi.mock('@franken/critique', () => {
  if (optionalModuleMocks.critiqueError) {
    throw optionalModuleMocks.critiqueError;
  }
  return {
    createReviewer: optionalModuleMocks.createReviewer,
  };
});

vi.mock('@franken/governor', () => {
  if (optionalModuleMocks.governorError) {
    throw optionalModuleMocks.governorError;
  }
  return {
    ApprovalGateway: optionalModuleMocks.ApprovalGateway,
    CliChannel: optionalModuleMocks.CliChannel,
    defaultConfig: optionalModuleMocks.defaultConfig,
  };
});

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
    optionalModuleMocks.critiqueError = undefined;
    optionalModuleMocks.governorError = undefined;
    traceViewerMocks.stop.mockClear();
    mockBridgeReplayManifest.length = 0;
  });

  it('reports session artifact cleanup failures instead of swallowing them', async () => {
    const { removeSessionArtifactIfPresent } = await import('../../../src/cli/dep-factory.js');
    const testDir = resolve(tmpdir(), `fb-cleanup-warning-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const artifactPath = resolve(testDir, 'session.checkpoint');
    const warn = vi.fn();
    mkdirSync(testDir, { recursive: true });
    writeFileSync(artifactPath, 'checkpoint data');

    try {
      const removed = removeSessionArtifactIfPresent(
        artifactPath,
        () => { throw new Error('permission denied'); },
        warn,
      );

      expect(removed).toBe(false);
      expect(existsSync(artifactPath)).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to remove session artifact ${artifactPath}: permission denied`),
        'dep-factory',
      );
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('throws descriptive error for unknown provider name', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ provider: 'unknown-provider' });
    await expect(createCliDeps(opts)).rejects.toThrow(/Unknown provider "unknown-provider"/);
  }, 15_000);

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

  it('preserves top-level model fallback when llmConfig.default only restates the same provider', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      runConfig: {
        provider: 'codex',
        objective: 'Fallback model compatibility',
        model: 'gpt-5',
        llmConfig: {
          default: { provider: 'codex' },
        },
      },
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codex' }),
      expect.objectContaining({ model: 'gpt-5' }),
    );
  });

  it('routes cli-session overrides into the Martin execution provider without carrying stale default models', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      runConfig: {
        objective: 'Use execution override',
        provider: 'codex',
        model: 'gpt-5.3-codex-spark',
        llmConfig: {
          default: { provider: 'codex', model: 'gpt-5.3-codex-spark' },
          overrides: {
            'cli-session': { provider: 'claude' },
          },
        },
      },
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.not.objectContaining({ model: 'gpt-5.3-codex-spark' }),
    );
  });

  it('providerless operation overrides inherit the default target instead of the execution provider', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      runConfig: {
        objective: 'Operation override inherits default provider',
        provider: 'codex',
        model: 'gpt-5.3-codex-spark',
        llmConfig: {
          default: { provider: 'codex' },
          overrides: {
            'cli-session': { provider: 'claude' },
            'plan-build': { model: 'gpt-5' },
          },
        },
      },
    });

    await createCliDeps(opts);

    expect(MockCachedCliLlmClient).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'plan-build',
      provider: 'codex',
      model: 'gpt-5',
    }));
  });

  it('keeps built-in cli skills available when the skills module is disabled', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const result = await createCliDeps(makeOpts());

    expect(result.deps.skills.hasSkill('cli:chunk-a')).toBe(true);
    expect(result.deps.skills.hasSkill('project-skill')).toBe(false);
  });

  it('routes custom consolidated CLI providers through their registry provider type', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      runConfig: {
        objective: 'Use custom consolidated provider',
        provider: 'prod-claude',
        llmConfig: {
          default: { provider: 'prod-claude', model: 'sonnet' },
        },
      },
      orchestratorConfig: {
        consolidatedProviders: [
          { name: 'prod-claude', type: 'claude-cli', model: 'sonnet' },
        ],
      } as never,
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({ model: 'sonnet' }),
    );
  });

  it('lets explicit run-config models override consolidated provider defaults', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      runConfig: {
        objective: 'Use selected custom model',
        provider: 'prod-claude',
        model: 'haiku',
        llmConfig: {
          default: { provider: 'prod-claude', model: 'sonnet' },
          overrides: {
            'cli-session': { provider: 'prod-claude', model: 'haiku' },
          },
        },
      },
      orchestratorConfig: {
        consolidatedProviders: [
          { name: 'prod-claude', type: 'claude-cli', model: 'sonnet' },
        ],
      } as never,
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({
        model: 'haiku',
        providerOverrides: expect.not.objectContaining({
          'prod-claude': expect.anything(),
        }),
      }),
    );
    expect(MockCachedCliLlmClient).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'cli-session',
      provider: 'prod-claude',
      model: 'haiku',
    }));
  });

  it('preserves model-only consolidated provider defaults when no explicit model is selected', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      runConfig: {
        objective: 'Use configured custom provider defaults',
        provider: 'prod-claude',
        llmConfig: {
          default: { provider: 'prod-claude' },
        },
      },
      orchestratorConfig: {
        consolidatedProviders: [
          { name: 'prod-claude', type: 'claude-cli', model: 'sonnet', extraArgs: ['--verbose'] },
        ],
      } as never,
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({
        model: 'sonnet',
        providerOverrides: expect.objectContaining({
          claude: expect.objectContaining({ model: 'sonnet', extraArgs: ['--verbose'] }),
        }),
      }),
    );
  });

  it('keeps custom provider aliases out of command-policy override maps', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      trustProviderCommandOverrides: true,
      runConfig: {
        objective: 'Use aliased custom provider command',
        provider: 'prod-claude',
      },
      orchestratorConfig: parseOrchestratorConfig({
        consolidatedProviders: [
          {
            name: 'prod-claude',
            type: 'claude-cli',
            cliPath: 'claude',
            trustCommandOverride: true,
          },
        ],
      }, { allowTrustedProviderCommandOverrides: true }),
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({
        commandOverride: 'claude',
        providerOverrides: expect.not.objectContaining({
          'prod-claude': expect.anything(),
        }),
      }),
    );
  }, 10_000);

  it('normalizes custom fallback provider aliases before wiring CLI adapters and Martin skills', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const opts = makeOpts({
      providers: ['prod-claude', 'spark'],
      runConfig: {
        objective: 'Use custom fallback providers',
        provider: 'prod-claude',
        llmConfig: {
          default: { provider: 'prod-claude', model: 'sonnet' },
        },
      },
      orchestratorConfig: {
        consolidatedProviders: [
          { name: 'prod-claude', type: 'claude-cli', model: 'sonnet' },
          { name: 'spark', type: 'codex-cli', model: 'gpt-5.3-codex-spark' },
        ],
      } as never,
    });

    await createCliDeps(opts);

    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({ providers: ['claude', 'codex'] }),
    );
    const cliExecutorCalls = (CliSkillExecutor as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(cliExecutorCalls[0]?.[6]).toEqual(expect.objectContaining({
      provider: 'claude',
      providers: ['claude', 'codex'],
    }));
  });

  it('keeps PR-disabled branch patterns isolated instead of direct-to-base', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const { GitBranchIsolator } = await import('../../../src/skills/git-branch-isolator.js');

    await createCliDeps(makeOpts({
      runConfig: {
        objective: 'Disable PR creation but keep feature branch isolation',
        gitConfig: { prCreation: 'disabled', branchPattern: 'feat/' },
      },
    }));

    expect(GitBranchIsolator).toHaveBeenCalledWith(expect.objectContaining({
      branchPrefix: 'feat/',
      directCommit: false,
    }));
  });

  it('allows direct commits only when PR creation is disabled and no branch pattern remains', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const { GitBranchIsolator } = await import('../../../src/skills/git-branch-isolator.js');

    await createCliDeps(makeOpts({
      runConfig: {
        objective: 'Direct commit yolo run',
        gitConfig: { prCreation: 'disabled', branchPattern: '' },
      },
    }));

    expect(GitBranchIsolator).toHaveBeenCalledWith(expect.objectContaining({
      branchPrefix: '',
      directCommit: true,
    }));
  });

  it('rejects command overrides from providersConfig unless explicitly trusted', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      providersConfig: { claude: { command: '/tmp/malicious-claude' } },
    });

    await expect(createCliDeps(opts)).rejects.toThrow(/trustCommandOverride: true/);
  });

  it('rejects trusted command overrides that do not target the selected provider binary', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      trustProviderCommandOverrides: true,
      providersConfig: {
        claude: { command: '/tmp/malicious-shell', trustCommandOverride: true },
      },
    });

    await expect(createCliDeps(opts)).rejects.toThrow(/allowed provider binary/);
  });

  it('applies trusted command override from providersConfig', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'claude',
      trustProviderCommandOverrides: true,
      providersConfig: {
        claude: {
          command: '/usr/local/bin/claude',
          trustCommandOverride: true,
          trustedCommandPaths: ['/usr/local/bin'],
        },
      },
    });
    await createCliDeps(opts);
    expect(MockCliLlmAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({ commandOverride: '/usr/local/bin/claude' }),
    );
  }, 10_000);

  it('audits trusted command overrides from consolidatedProviders', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const { BeastLogger } = await import('../../../src/logging/beast-logger.js');
    const opts = makeOpts({
      trustProviderCommandOverrides: true,
      orchestratorConfig: parseOrchestratorConfig({
        consolidatedProviders: [
          {
            name: 'local-claude',
            type: 'claude-cli',
            cliPath: '/usr/local/bin/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/usr/local/bin/'],
          },
        ],
      }, { allowTrustedProviderCommandOverrides: true }),
    });

    await createCliDeps(opts);

    const loggerInstances = (BeastLogger as unknown as { mock: { instances: Array<{ warn: ReturnType<typeof vi.fn> }> } }).mock.instances;
    const logger = loggerInstances.at(-1);
    expect(logger?.warn).toHaveBeenCalledWith(
      expect.stringContaining('SECURITY AUDIT: using trusted provider command override for claude-cli: /usr/local/bin/claude-wrapper'),
      'provider-command-policy',
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

  it('passes the CLI logger into PrCreator commit message generation', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const { BeastLogger } = await import('../../../src/logging/beast-logger.js');
    const { PrCreator } = await import('../../../src/closure/pr-creator.js');
    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');

    await createCliDeps(makeOpts({ noPr: false }));

    const cliExecutorCalls = (CliSkillExecutor as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const commitMessageFn = cliExecutorCalls.at(-1)?.[4] as (diffStat: string, objective: string) => Promise<string | null>;
    const prCreatorResults = (PrCreator as unknown as { mock: { results: Array<{ value: { generateCommitMessage: ReturnType<typeof vi.fn> } }> } }).mock.results;
    const prCreator = prCreatorResults.at(-1)?.value;
    const loggerInstances = (BeastLogger as unknown as { mock: { instances: unknown[] } }).mock.instances;
    const logger = loggerInstances.at(-1);

    await commitMessageFn(' src/auth.ts | 1 +', 'fix auth');

    expect(prCreator?.generateCommitMessage).toHaveBeenCalledWith(
      ' src/auth.ts | 1 +',
      'fix auth',
      logger,
    );
  }, 10_000);

  it('wires disabled observer deps to cached LLM when tracing is disabled', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    await createCliDeps(makeOpts({ orchestratorConfig: { enableTracing: false } as never }));

    expect(MockCachedCliLlmClient).toHaveBeenCalledWith(
      expect.objectContaining({ observer: observerDepsMocks.disabled }),
    );
  });

  it('wires full observer deps to cached LLM when tracing is enabled', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    await createCliDeps(makeOpts({ orchestratorConfig: { enableTracing: true } as never }));

    expect(MockCachedCliLlmClient).toHaveBeenCalledWith(
      expect.objectContaining({ observer: observerDepsMocks.enabled }),
    );
  });

  it('passes selected provider defaults to CliSkillExecutor', { timeout: 10_000 }, async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({
      provider: 'codex',
      runConfig: {
        objective: 'Use selected codex model',
        provider: 'codex',
        model: 'gpt-5.3-codex-spark',
      },
      providers: ['codex'],
      trustProviderCommandOverrides: true,
      providersConfig: {
        codex: {
          command: '/usr/local/bin/codex',
          trustCommandOverride: true,
          trustedCommandPaths: ['/usr/local/bin'],
        },
      },
    });

    await createCliDeps(opts);

    const cliExecutorCall = (await import('../../../src/skills/cli-skill-executor.js')).CliSkillExecutor as unknown as {
      mock: { calls: unknown[][] };
    };

    expect(cliExecutorCall.mock.calls[0]?.[6]).toEqual(expect.objectContaining({
      provider: 'codex',
      model: 'gpt-5.3-codex-spark',
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

  it('persists bridge replay manifests under each active run id', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ runSessionId: 'cli-session-1' });
    const result = await createCliDeps(opts);
    mockBridgeReplayManifest.push(
      { version: 1, kind: 'llm.request', runId: 'issue-89', timestamp: '2026-05-25T00:00:00.000Z', contentRef: 'a'.repeat(64) },
      { version: 1, kind: 'tool.result', runId: 'cli-session-1', timestamp: '2026-05-25T00:00:01.000Z', contentRef: 'b'.repeat(64) },
    );

    await result.finalize();

    const issueManifestPath = resolve(opts.paths.root, '.fbeast', 'audit', 'issue-89.replay.json');
    const sessionManifestPath = resolve(opts.paths.root, '.fbeast', 'audit', 'cli-session-1.replay.json');
    const issueManifest = JSON.parse(readFileSync(issueManifestPath, 'utf8')) as Array<{ runId: string }>;
    const sessionManifest = JSON.parse(readFileSync(sessionManifestPath, 'utf8')) as Array<{ runId: string }>;

    expect(issueManifest).toHaveLength(1);
    expect(issueManifest[0]?.runId).toBe('issue-89');
    expect(sessionManifest).toHaveLength(1);
    expect(sessionManifest[0]?.runId).toBe('cli-session-1');
  });

  it('does not let a corrupt existing replay manifest abort other finalize writes', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ runSessionId: 'cli-session-1' });
    const result = await createCliDeps(opts);
    const auditDir = resolve(opts.paths.root, '.fbeast', 'audit');
    mkdirSync(auditDir, { recursive: true });
    writeFileSync(resolve(auditDir, 'issue-89.replay.json'), '{not valid json', 'utf8');
    mockBridgeReplayManifest.push(
      { version: 1, kind: 'llm.request', runId: 'issue-89', timestamp: '2026-05-25T00:00:00.000Z', contentRef: 'a'.repeat(64) },
      { version: 1, kind: 'tool.result', runId: 'cli-session-1', timestamp: '2026-05-25T00:00:01.000Z', contentRef: 'b'.repeat(64) },
    );

    await result.finalize();

    const issueManifest = JSON.parse(readFileSync(resolve(auditDir, 'issue-89.replay.json'), 'utf8')) as Array<{ runId: string }>;
    const sessionManifest = JSON.parse(readFileSync(resolve(auditDir, 'cli-session-1.replay.json'), 'utf8')) as Array<{ runId: string }>;

    expect(issueManifest).toEqual([expect.objectContaining({ runId: 'issue-89' })]);
    expect(sessionManifest).toEqual([expect.objectContaining({ runId: 'cli-session-1' })]);
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

  it('clears session checkpoint sidecars on cold starts', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
    const opts = makeOpts({ resume: false });
    const checkpoint = resolve(opts.paths.buildDir, 'session.checkpoint');
    const checkpointOutputs = `${checkpoint}.outputs`;
    mkdirSync(checkpointOutputs, { recursive: true });
    writeFileSync(checkpoint, 'task-1:done\n');
    writeFileSync(resolve(checkpointOutputs, 'task-1.v8'), 'serialized-output');

    await createCliDeps(opts);

    expect(existsSync(checkpoint)).toBe(false);
    expect(existsSync(checkpointOutputs)).toBe(false);
  });

  it('fails closed when an enabled critique module is truly missing', async () => {
    delete process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES;
    optionalModuleMocks.critiqueError = Object.assign(
      new Error("Cannot find package '@franken/critique' imported from dep-factory.ts"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    await expect(createCliDeps(makeOpts({
      enabledModules: { critique: true, governor: false },
    }))).rejects.toThrow(/@franken\/critique.*fail-closed/i);
  });

  it('uses critique stub when explicitly disabled via config', async () => {
    delete process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES;
    optionalModuleMocks.critiqueError = Object.assign(
      new Error("Cannot find package '@franken/critique' imported from dep-factory.ts"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    const result = await createCliDeps(makeOpts({
      enabledModules: { critique: false, governor: false },
    }));

    await expect(result.deps.critique.reviewPlan({ tasks: [] })).resolves.toEqual({
      verdict: 'pass',
      findings: [],
      score: 1.0,
    });
  });

  it('retains critique stub for a missing module when the unsafe opt-out is set', async () => {
    process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES = '1';
    optionalModuleMocks.critiqueError = Object.assign(
      new Error("Cannot find package '@franken/critique' imported from dep-factory.ts"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    vi.resetModules();
    try {
      const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

      const result = await createCliDeps(makeOpts({
        enabledModules: { critique: true, governor: false },
      }));

      await expect(result.deps.critique.reviewPlan({ tasks: [] })).resolves.toEqual({
        verdict: 'pass',
        findings: [],
        score: 1.0,
      });
    } finally {
      delete process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES;
    }
  });

  it('fails loudly when the optional critique module exists but is broken', async () => {
    optionalModuleMocks.critiqueError = new Error('critique init exploded');
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    await expect(createCliDeps(makeOpts({
      enabledModules: { critique: true, governor: false },
    }))).rejects.toThrow(/@franken\/critique.*critique init exploded/);
  });

  it('stops verbose trace viewer when critique initialization fails after observer setup', async () => {
    optionalModuleMocks.critiqueError = new Error('critique init exploded');
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    await expect(createCliDeps(makeOpts({
      verbose: true,
      enabledModules: { critique: true, governor: false },
    }))).rejects.toThrow(/@franken\/critique.*critique init exploded/);

    expect(traceViewerMocks.stop).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an enabled governor module is truly missing', async () => {
    delete process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES;
    optionalModuleMocks.governorError = Object.assign(
      new Error("Cannot find package '@franken/governor' imported from dep-factory.ts"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    await expect(createCliDeps(makeOpts({
      enabledModules: { critique: false, governor: true },
    }))).rejects.toThrow(/@franken\/governor.*fail-closed/i);
  });

  it('uses governor stub when explicitly disabled via config', async () => {
    delete process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES;
    optionalModuleMocks.governorError = Object.assign(
      new Error("Cannot find package '@franken/governor' imported from dep-factory.ts"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    const result = await createCliDeps(makeOpts({
      enabledModules: { critique: false, governor: false },
    }));

    await expect(result.deps.governor.requestApproval({
      taskId: 'test',
      summary: 'test',
      requiresHitl: true,
    })).resolves.toEqual({ decision: 'approved' });
  });

  it('retains governor stub for a missing module when the unsafe opt-out is set', async () => {
    process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES = '1';
    optionalModuleMocks.governorError = Object.assign(
      new Error("Cannot find package '@franken/governor' imported from dep-factory.ts"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    vi.resetModules();
    try {
      const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

      const result = await createCliDeps(makeOpts({
        enabledModules: { critique: false, governor: true },
      }));

      await expect(result.deps.governor.requestApproval({
        taskId: 'test',
        summary: 'test',
        requiresHitl: true,
      })).resolves.toEqual({ decision: 'approved' });
    } finally {
      delete process.env.FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES;
    }
  });

  it('fails loudly when the optional governor module exists but is broken', async () => {
    optionalModuleMocks.governorError = new Error('governor init exploded');
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    await expect(createCliDeps(makeOpts({
      enabledModules: { critique: false, governor: true },
    }))).rejects.toThrow(/@franken\/governor.*governor init exploded/);
  });

  it('stops verbose trace viewer when governor initialization fails after observer setup', async () => {
    optionalModuleMocks.governorError = new Error('governor init exploded');
    vi.resetModules();
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    await expect(createCliDeps(makeOpts({
      verbose: true,
      enabledModules: { critique: false, governor: true },
    }))).rejects.toThrow(/@franken\/governor.*governor init exploded/);

    expect(traceViewerMocks.stop).toHaveBeenCalledTimes(1);
  });
});
