import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

// ── Track AdapterLlmClient constructor arg ──

let adapterCtorArg: unknown = undefined;
let progressCtorInner: unknown = undefined;
let progressCtorOptions: unknown = undefined;
let progressInstance: unknown = undefined;
let llmGraphBuilderCtorArg: unknown = undefined;
let llmGraphBuilderCtorOptions: unknown = undefined;
let lastCreateCliDepsOptions: import('../../../src/cli/dep-factory.js').CliDepOptions | undefined;
let streamProgressOptions: { onProgressEvent?: (event: { type: string; [key: string]: unknown }) => void } | undefined;
const mockProgressUpdate = vi.fn();
const mockCurrentStage = vi.fn();
const mockFinalize = vi.fn(async () => {});

// ── Mock heavy deps ──

const mockCliLlmAdapter = {
  transformRequest: vi.fn((r: unknown) => r),
  execute: vi.fn(async () => ''),
  transformResponse: vi.fn(() => ({ content: 'mock response' })),
  validateCapabilities: vi.fn(() => true),
  config: {
    provider: 'claude',
    claudeCmd: 'claude',
    codexCmd: 'codex',
    workingDir: '/tmp',
    timeoutMs: 120_000,
  },
};

const mockDeps = {
  firewall: { runPipeline: vi.fn() },
  skills: { hasSkill: vi.fn(), getAvailableSkills: vi.fn(() => []), execute: vi.fn() },
  memory: { frontload: vi.fn(), getContext: vi.fn(), recordTrace: vi.fn() },
  planner: { createPlan: vi.fn() },
  observer: {
    startTrace: vi.fn(),
    startSpan: vi.fn(() => ({ end: vi.fn() })),
    getTokenSpend: vi.fn(async () => ({
      inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0,
    })),
  },
  critique: { reviewPlan: vi.fn() },
  governor: { requestApproval: vi.fn() },
  heartbeat: { pulse: vi.fn() },
  logger: {
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
    getLogEntries: vi.fn(() => []),
  },
  clock: () => new Date(),
  cliExecutor: { run: vi.fn() },
};

vi.mock('../../../src/cli/dep-factory.js', () => ({
  createCliDeps: vi.fn((options: import('../../../src/cli/dep-factory.js').CliDepOptions) => {
    lastCreateCliDepsOptions = options;
    return {
      deps: mockDeps,
      logger: mockDeps.logger,
      finalize: mockFinalize,
      cliLlmAdapter: mockCliLlmAdapter,
      artifacts: {
        planName: 'session',
        checkpointFile: resolve(options.paths.buildDir, 'session.checkpoint'),
        logFile: resolve(options.paths.buildDir, 'session-build.log'),
      },
    };
  }),
}));

// Mock AdapterLlmClient — capture constructor arg
const mockComplete = vi.fn(async () => 'mock LLM response');
vi.mock('../../../src/adapters/adapter-llm-client.js', () => {
  const MockAdapterLlmClient = vi.fn(function (
    this: { complete: typeof mockComplete },
    adapter: unknown,
  ) {
    adapterCtorArg = adapter;
    this.complete = mockComplete;
  });
  return { AdapterLlmClient: MockAdapterLlmClient };
});

vi.mock('../../../src/adapters/progress-llm-client.js', () => {
  const MockProgressLlmClient = vi.fn(function (
    this: { complete: typeof mockComplete },
    inner: unknown,
    options?: unknown,
  ) {
    progressInstance = this;
    progressCtorInner = inner;
    progressCtorOptions = options;
    this.complete = mockComplete;
  });
  return { ProgressLlmClient: MockProgressLlmClient };
});

// Mock InterviewLoop
const mockInterviewBuild = vi.fn(async () => ({ tasks: [] }));
vi.mock('../../../src/planning/interview-loop.js', () => {
  const MockInterviewLoop = vi.fn(function (
    this: { build: typeof mockInterviewBuild },
  ) {
    this.build = mockInterviewBuild;
  });
  return { InterviewLoop: MockInterviewLoop };
});

// Mock LlmGraphBuilder
const mockLlmGraphBuild = vi.fn(async () => ({
  tasks: [
    { id: 'impl:chunk-a', objective: 'Build A', requiredSkills: ['cli:chunk-a'], dependsOn: [] },
    { id: 'harden:chunk-a', objective: 'Harden A', requiredSkills: ['cli:chunk-a'], dependsOn: ['impl:chunk-a'] },
  ],
}));
vi.mock('../../../src/planning/llm-graph-builder.js', () => {
  const MockLlmGraphBuilder = vi.fn(function (
    this: { build: typeof mockLlmGraphBuild; lastChunks: unknown[]; lastValidationIssues: unknown[] },
    llm: unknown,
    _contextGatherer: unknown,
    options: unknown,
  ) {
    llmGraphBuilderCtorArg = llm;
    llmGraphBuilderCtorOptions = options;
    this.lastChunks = [{ id: 'chunk-a', objective: 'Build A', files: ['src/a.ts'], successCriteria: 'Tests pass', verificationCommand: 'npx vitest run', dependencies: [] }];
    this.lastValidationIssues = [];
    this.build = mockLlmGraphBuild;
  });
  return { LlmGraphBuilder: MockLlmGraphBuilder };
});

// Mock PlanContextGatherer
vi.mock('../../../src/planning/plan-context-gatherer.js', () => {
  const MockPlanContextGatherer = vi.fn(function (this: { gather: ReturnType<typeof vi.fn> }) {
    this.gather = vi.fn(async () => ({ rampUp: '', relevantSignatures: [], packageDeps: {}, existingPatterns: [] }));
  });
  return { PlanContextGatherer: MockPlanContextGatherer };
});

// Mock ChunkFileWriter
vi.mock('../../../src/planning/chunk-file-writer.js', () => {
  const MockChunkFileWriter = vi.fn(function (this: { write: ReturnType<typeof vi.fn> }) {
    this.write = vi.fn(() => ['/mock/01_chunk.md']);
  });
  return { ChunkFileWriter: MockChunkFileWriter };
});

// Mock stream-progress to prevent real timers/stderr writes
vi.mock('../../../src/adapters/stream-progress.js', () => ({
  createStreamProgressWithSpinner: vi.fn((options: typeof streamProgressOptions) => {
    streamProgressOptions = options;
    return { onLine: vi.fn(), update: mockProgressUpdate, currentStage: mockCurrentStage, stop: vi.fn() };
  }),
  createStreamProgressHandler: vi.fn(() => vi.fn()),
}));

// Mock reviewLoop, file-writer, beast-logger
vi.mock('../../../src/cli/review-loop.js', () => ({
  reviewLoop: vi.fn(async () => {}),
}));

const mockReadDesignDoc = vi.fn(() => '# Test Design Doc' as string | undefined);
vi.mock('../../../src/cli/file-writer.js', () => ({
  writeDesignDoc: vi.fn(() => '/mock/design.md'),
  readDesignDoc: () => mockReadDesignDoc(),
  writeChunkFiles: vi.fn(() => ['/mock/01_chunk.md']),
}));

vi.mock('../../../src/logging/beast-logger.js', () => ({
  ANSI: { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '', magenta: '', cyan: '', gray: '', bgRed: '', bgGreen: '' },
  BANNER: '',
  budgetBar: vi.fn(() => ''),
  statusBadge: vi.fn(() => ''),
  logHeader: vi.fn((t: string) => t),
  BeastLogger: vi.fn(function (this: Record<string, unknown>) {
    this.info = vi.fn();
    this.debug = vi.fn();
    this.warn = vi.fn();
    this.error = vi.fn();
    this.getLogEntries = vi.fn(() => []);
  }),
  stripAnsi: vi.fn((s: string) => s),
}));

vi.mock('@franken/brain', () => ({
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

function mockIO(): InterviewIO {
  return {
    ask: vi.fn(async () => 'yes'),
    display: vi.fn(),
  };
}

function makeConfig(
  overrides: Partial<import('../../../src/cli/session.js').SessionConfig> = {},
): import('../../../src/cli/session.js').SessionConfig {
  const testDir = resolve(
    tmpdir(),
    `fb-session-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
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
    io: mockIO(),
    entryPhase: 'plan',
    exitAfter: 'plan',
    ...overrides,
  };
}

// ── Tests ──

describe('Session plan phase — CliLlmAdapter wiring', () => {
  const origLog = console.info;
  const origRunConfigEnv = process.env.FRANKENBEAST_RUN_CONFIG;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFinalize.mockClear();
    adapterCtorArg = undefined;
    progressCtorInner = undefined;
    progressCtorOptions = undefined;
    progressInstance = undefined;
    llmGraphBuilderCtorArg = undefined;
    llmGraphBuilderCtorOptions = undefined;
    lastCreateCliDepsOptions = undefined;
    streamProgressOptions = undefined;
    console.info = vi.fn();
  });

  afterEach(() => {
    console.info = origLog;
    if (origRunConfigEnv === undefined) {
      delete process.env.FRANKENBEAST_RUN_CONFIG;
    } else {
      process.env.FRANKENBEAST_RUN_CONFIG = origRunConfigEnv;
    }
  });

  it('runPlan() passes a cached CliLlmAdapter-backed LLM to LlmGraphBuilder', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    expect(llmGraphBuilderCtorArg).toBeDefined();

    const llm = llmGraphBuilderCtorArg as {
      complete(prompt: string): Promise<string>;
    };
    await expect(llm.complete('repeat this prompt')).resolves.toBe('mock response');
    await expect(llm.complete('repeat this prompt')).resolves.toBe('mock response');

    expect(mockCliLlmAdapter.execute).toHaveBeenCalledTimes(1);
    expect(mockCliLlmAdapter.transformRequest).toHaveBeenCalledWith(expect.objectContaining({
      cacheSession: {
        key: 'plan:session',
        persist: true,
      },
    }));
  });

  it('runPlan() invokes LlmGraphBuilder.build to decompose the design doc', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    expect(mockLlmGraphBuild).toHaveBeenCalled();
  });

  it('runPlan() uses the dedicated planning deadline instead of the execution deadline', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig({ maxDurationMs: 300_000, planningTimeoutMs: 75_000 });
    await new Session(config).start();

    expect(llmGraphBuilderCtorOptions).toEqual(expect.objectContaining({ timeoutMs: 75_000 }));
  });

  it('runPlan() persists sanitized live progress and discloses the build log path', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    const expectedLogFile = resolve(config.paths.buildDir, 'session-build.log');

    await new Session(config).start();
    streamProgressOptions?.onProgressEvent?.({ type: 'chunk-detected', count: 2 });
    lastCreateCliDepsOptions?.onLlmLifecycleEvent?.({
      type: 'fallback',
      from: 'claude',
      to: 'codex',
    });

    expect(mockDeps.logger.debug).toHaveBeenCalledWith(
      'Plan progress',
      { type: 'chunk-detected', count: 2 },
      'planner',
    );
    expect(mockDeps.logger.debug).toHaveBeenCalledWith(
      'LLM provider lifecycle',
      { type: 'fallback', from: 'claude', to: 'codex' },
      'planner',
    );
    expect(mockDeps.logger.info).not.toHaveBeenCalledWith(
      expect.stringMatching(/^(Plan progress|LLM provider lifecycle)$/),
      expect.anything(),
      'planner',
    );
    expect(mockDeps.logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: expect.anything() }),
      expect.anything(),
    );
    expect(config.io.display).toHaveBeenCalledWith(expect.stringContaining('Build log:'));
    expect(config.io.display).toHaveBeenCalledWith(expect.stringContaining(expectedLogFile));
    expect(config.io.display).toHaveBeenCalledWith(expect.stringContaining(`tail -f '${expectedLogFile}'`));
    expect(mockDeps.logger.info).toHaveBeenCalledWith(
      'Plan stage completed',
      expect.objectContaining({ stage: 'decompose', stageElapsedMs: expect.any(Number), totalElapsedMs: expect.any(Number) }),
      'planner',
    );
  });

  it('runPlan() restarts stream progress while applying review revisions', async () => {
    const { reviewLoop } = await import('../../../src/cli/review-loop.js');
    vi.mocked(reviewLoop).mockImplementationOnce(async ({ onRevise }) => {
      await onRevise('Split the plan into smaller chunks');
    });
    const { createStreamProgressWithSpinner } = await import('../../../src/adapters/stream-progress.js');
    const { Session } = await import('../../../src/cli/session.js');

    await new Session(makeConfig()).start();

    expect(createStreamProgressWithSpinner).toHaveBeenCalledTimes(2);
    expect(mockLlmGraphBuild).toHaveBeenCalledTimes(2);
    for (const result of vi.mocked(createStreamProgressWithSpinner).mock.results) {
      expect(result.value.stop).toHaveBeenCalled();
    }
  });

  it('runPlan() finalizes when build-log disclosure fails', async () => {
    const io = mockIO();
    vi.mocked(io.display).mockImplementationOnce(() => {
      throw new Error('output closed');
    });
    const { createStreamProgressWithSpinner } = await import('../../../src/adapters/stream-progress.js');
    const { Session } = await import('../../../src/cli/session.js');

    await expect(new Session(makeConfig({ io })).start()).rejects.toThrow('output closed');

    expect(mockFinalize).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createStreamProgressWithSpinner).mock.results.at(-1)?.value.stop).toHaveBeenCalled();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'runPlan() flushes one active-stage cancellation record on %s and removes signal handlers',
    async (signal) => {
      const signalHandlers = new Map<NodeJS.Signals, () => void>();
      const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: () => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          signalHandlers.set(event, listener);
        }
        return process;
      }) as typeof process.on);
      const removeSpy = vi.spyOn(process, 'removeListener').mockImplementation((() => process) as typeof process.removeListener);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      let resolveBuild!: () => void;
      mockLlmGraphBuild.mockImplementationOnce(() => new Promise((resolveBuildPromise) => {
        resolveBuild = () => resolveBuildPromise({ tasks: [] });
      }));
      const { Session } = await import('../../../src/cli/session.js');

      const startPromise = new Session(makeConfig()).start();
      await vi.waitFor(() => expect(signalHandlers.size).toBe(2));
      signalHandlers.get(signal)!();
      await vi.waitFor(() => expect(mockFinalize).toHaveBeenCalledTimes(1));
      resolveBuild();

      await expect(startPromise).rejects.toThrow(`Plan cancelled by ${signal}`);
      expect(mockDeps.logger.warn).toHaveBeenCalledWith(
        'Plan stage cancelled',
        expect.objectContaining({ stage: 'decompose', signal }),
        'planner',
      );
      expect(mockDeps.logger.warn).toHaveBeenCalledWith(
        'Plan cycle cancelled',
        expect.objectContaining({ signal }),
        'planner',
      );
      expect(mockDeps.logger.warn.mock.calls.filter(([message]) => message === 'Plan stage cancelled')).toHaveLength(1);
      expect(mockDeps.logger.warn.mock.calls.filter(([message]) => message === 'Plan cycle cancelled')).toHaveLength(1);
      expect(mockFinalize).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(signal === 'SIGINT' ? 130 : 143);
      expect(removeSpy).toHaveBeenCalledWith('SIGINT', signalHandlers.get('SIGINT'));
      expect(removeSpy).toHaveBeenCalledWith('SIGTERM', signalHandlers.get('SIGTERM'));

      onSpy.mockRestore();
      removeSpy.mockRestore();
      exitSpy.mockRestore();
    },
  );

  it('runPlan() finalizes CLI dependencies so replay records are persisted', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it('runPlan() reports the searched design doc path when an explicit file is missing', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const missingDesignDoc = resolve(
      tmpdir(),
      `missing-design-${Date.now()}-${Math.random().toString(36).slice(2)}.md`,
    );
    const config = makeConfig({ designDocPath: missingDesignDoc });

    await expect(new Session(config).start()).rejects.toThrow(
      `No design document found at ${missingDesignDoc}`,
    );
    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it('runPlan() drops a stale default model when the plan-build override changes provider only', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    const runConfigPath = resolve(config.paths.root, 'run-config.json');
    writeFileSync(runConfigPath, JSON.stringify({
      provider: 'codex',
      model: 'gpt-5.3-codex-spark',
      llmConfig: {
        default: { provider: 'codex', model: 'gpt-5.3-codex-spark' },
        overrides: { 'plan-build': { provider: 'claude' } },
      },
    }));
    process.env.FRANKENBEAST_RUN_CONFIG = runConfigPath;

    await new Session(config).start();

    expect(lastCreateCliDepsOptions?.runConfig?.llmConfig?.default).toEqual({
      provider: 'claude',
      model: undefined,
    });
    expect(lastCreateCliDepsOptions?.runConfig?.llmConfig?.overrides?.['cli-session']).toBeUndefined();
  });

  it('runPlan() passes LLM directly to LlmGraphBuilder (no ProgressLlmClient spinner)', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    // Stream progress replaces the spinner — ProgressLlmClient should NOT be used for planning
    const { ProgressLlmClient } = await import(
      '../../../src/adapters/progress-llm-client.js'
    );
    expect(ProgressLlmClient).not.toHaveBeenCalled();
    // LlmGraphBuilder should still receive an LLM client
    expect(llmGraphBuilderCtorArg).toBeDefined();
  });
});

describe('createCliDeps — cliLlmAdapter field', () => {
  it('returns a cliLlmAdapter with transformRequest method', async () => {
    const { createCliDeps } = await import('../../../src/cli/dep-factory.js');

    const testDir = resolve(
      tmpdir(),
      `fb-dep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);

    const result = await createCliDeps({
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
    });

    expect(result.cliLlmAdapter).toBeDefined();
    expect(typeof result.cliLlmAdapter.transformRequest).toBe('function');

    rmSync(testDir, { recursive: true, force: true });
  });
});
