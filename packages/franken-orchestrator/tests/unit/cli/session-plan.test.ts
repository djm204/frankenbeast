import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
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
  createCliDeps: vi.fn(() => ({
    deps: mockDeps,
    logger: mockDeps.logger,
    finalize: vi.fn(async () => {}),
    cliLlmAdapter: mockCliLlmAdapter,
  })),
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
    this: { build: typeof mockLlmGraphBuild },
    llm: unknown,
  ) {
    llmGraphBuilderCtorArg = llm;
    this.build = mockLlmGraphBuild;
  });
  return { LlmGraphBuilder: MockLlmGraphBuilder };
});

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
  const origLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    adapterCtorArg = undefined;
    progressCtorInner = undefined;
    progressCtorOptions = undefined;
    progressInstance = undefined;
    llmGraphBuilderCtorArg = undefined;
    console.log = vi.fn();
  });

  afterEach(() => {
    console.log = origLog;
  });

  it('runPlan() constructs AdapterLlmClient with cliLlmAdapter, not cliExecutor', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    const { AdapterLlmClient } = await import(
      '../../../src/adapters/adapter-llm-client.js'
    );
    expect(AdapterLlmClient).toHaveBeenCalled();
    // The adapter passed to AdapterLlmClient must be cliLlmAdapter, NOT cliExecutor
    expect(adapterCtorArg).toBe(mockCliLlmAdapter);
  });

  it('runPlan() invokes LlmGraphBuilder.build to decompose the design doc', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    expect(mockLlmGraphBuild).toHaveBeenCalled();
  });

  it('runPlan() wraps AdapterLlmClient with ProgressLlmClient before building the plan', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    await new Session(config).start();

    const { ProgressLlmClient } = await import(
      '../../../src/adapters/progress-llm-client.js'
    );

    expect(ProgressLlmClient).toHaveBeenCalled();
    expect(progressCtorInner).toBeDefined();
    expect(progressInstance).toBe(llmGraphBuilderCtorArg);
    expect(progressCtorOptions).toEqual({ label: 'Decomposing design...' });
  });
});

describe('createCliDeps — cliLlmAdapter field', () => {
  it('returns a cliLlmAdapter with transformRequest method', async () => {
    const { createCliDeps: realCreateCliDeps } = await vi.importActual<
      typeof import('../../../src/cli/dep-factory.js')
    >('../../../src/cli/dep-factory.js');

    const testDir = resolve(
      tmpdir(),
      `fb-dep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);

    const result = await realCreateCliDeps({
      paths,
      baseBranch: 'main',
      budget: 5,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
    });

    expect(result.cliLlmAdapter).toBeDefined();
    expect(typeof result.cliLlmAdapter.transformRequest).toBe('function');

    rmSync(testDir, { recursive: true, force: true });
  });
});
