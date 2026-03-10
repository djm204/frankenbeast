import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
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

vi.mock('@franken/firewall', () => ({
  scanForInjection: vi.fn(() => ({ passed: true, violations: [] })),
  maskPii: vi.fn((request: unknown) => ({ passed: true, value: request, violations: [] })),
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

  it.each(['claude', 'codex', 'gemini', 'aider'])(
    'accepts built-in provider "%s" without error',
    async (name) => {
      const { createCliDeps } = await import('../../../src/cli/dep-factory.js');
      const opts = makeOpts({ provider: name });
      const result = await createCliDeps(opts);
      expect(result.cliLlmAdapter).toBeDefined();
    },
  );

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
  });

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
  });

  it('passes selected provider defaults to CliSkillExecutor', async () => {
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
});
