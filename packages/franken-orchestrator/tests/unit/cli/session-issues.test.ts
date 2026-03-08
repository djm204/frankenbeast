import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';
import type { GithubIssue, TriageResult, IssueOutcome } from '../../../src/issues/types.js';
import type { ReviewDecision } from '../../../src/issues/issue-review.js';

// ── Factories ──

function makeIssue(overrides: Partial<GithubIssue> = {}): GithubIssue {
  return {
    number: 1,
    title: 'Fix login bug',
    body: 'Login fails for some users',
    labels: ['critical'],
    state: 'open',
    url: 'https://github.com/org/repo/issues/1',
    ...overrides,
  };
}

function makeTriage(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    issueNumber: 1,
    complexity: 'one-shot' as const,
    rationale: 'Simple fix',
    estimatedScope: 'src/auth.ts',
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<IssueOutcome> = {}): IssueOutcome {
  return {
    issueNumber: 1,
    issueTitle: 'Fix login bug',
    status: 'fixed' as const,
    tokensUsed: 1000,
    prUrl: 'https://github.com/org/repo/pull/10',
    ...overrides,
  };
}

// ── Mock issue deps ──

const mockFetcher = {
  fetch: vi.fn(async () => [makeIssue()]),
  inferRepo: vi.fn(async () => 'org/repo'),
};

const mockTriageInstance = {
  triage: vi.fn(async () => [makeTriage()]),
};

const mockReviewInstance = {
  review: vi.fn(async (): Promise<ReviewDecision> => ({
    approved: [makeTriage()],
    action: 'execute',
  })),
};

const mockGraphBuilder = {
  buildForIssue: vi.fn(async () => ({ tasks: [] })),
};

const mockRunnerInstance = {
  run: vi.fn(async () => [makeOutcome()]),
};

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getLogEntries: vi.fn(() => []),
};

const mockFinalize = vi.fn(async () => {});

const mockExecutor = {
  execute: vi.fn(async () => ({ output: 'done', tokensUsed: 100 })),
};

const mockGit = {
  isolate: vi.fn(),
};

const mockCheckpoint = {
  has: vi.fn(() => false),
  write: vi.fn(),
  readAll: vi.fn(() => new Set<string>()),
  clear: vi.fn(),
  recordCommit: vi.fn(),
  lastCommit: vi.fn(() => undefined),
};

const mockPrCreator = {
  create: vi.fn(async () => ({ url: 'https://pr/1' })),
  generateCommitMessage: vi.fn(async () => 'fix: issue'),
};

const mockCliLlmAdapter = {
  transformRequest: vi.fn((r: unknown) => r),
  execute: vi.fn(async () => ''),
  transformResponse: vi.fn(() => ({ content: 'mock' })),
  validateCapabilities: vi.fn(() => true),
};

// ── Module mocks ──

vi.mock('../../../src/cli/dep-factory.js', () => ({
  createCliDeps: vi.fn(async () => ({
    deps: {},
    cliLlmAdapter: mockCliLlmAdapter,
    logger: mockLogger,
    finalize: mockFinalize,
    observerBridge: { startTrace: vi.fn() },
    issueDeps: {
      fetcher: mockFetcher,
      triage: mockTriageInstance,
      graphBuilder: mockGraphBuilder,
      review: mockReviewInstance,
      runner: mockRunnerInstance,
      executor: mockExecutor,
      git: mockGit,
      prCreator: mockPrCreator,
      checkpoint: mockCheckpoint,
    },
  })),
}));

vi.mock('../../../src/logging/beast-logger.js', () => ({
  ANSI: {
    reset: '', bold: '', dim: '', red: '', green: '', yellow: '',
    blue: '', magenta: '', cyan: '', gray: '', bgRed: '', bgGreen: '',
  },
  BANNER: '',
  budgetBar: vi.fn(() => '[===     ]'),
  statusBadge: vi.fn(() => 'PASS'),
  logHeader: vi.fn((t: string) => `--- ${t} ---`),
  BeastLogger: vi.fn(function (this: Record<string, unknown>) {
    this.info = vi.fn();
    this.debug = vi.fn();
    this.warn = vi.fn();
    this.error = vi.fn();
    this.getLogEntries = vi.fn(() => []);
  }),
  stripAnsi: vi.fn((s: string) => s),
}));

vi.mock('../../../src/adapters/adapter-llm-client.js', () => ({
  AdapterLlmClient: vi.fn(function (this: { complete: () => Promise<string> }) {
    this.complete = vi.fn(async () => 'mock');
  }),
}));

vi.mock('../../../src/adapters/progress-llm-client.js', () => ({
  ProgressLlmClient: vi.fn(function (this: { complete: () => Promise<string> }) {
    this.complete = vi.fn(async () => 'mock');
  }),
}));

// Mock InterviewLoop (imported by session.ts)
vi.mock('../../../src/planning/interview-loop.js', () => {
  const MockInterviewLoop = vi.fn(function (this: { build: () => Promise<unknown> }) {
    this.build = vi.fn(async () => ({ tasks: [] }));
  });
  return { InterviewLoop: MockInterviewLoop };
});

// Mock LlmGraphBuilder (imported by session.ts)
vi.mock('../../../src/planning/llm-graph-builder.js', () => {
  const MockLlmGraphBuilder = vi.fn(function (this: { build: () => Promise<unknown> }) {
    this.build = vi.fn(async () => ({ tasks: [] }));
  });
  return { LlmGraphBuilder: MockLlmGraphBuilder };
});

// Mock BeastLoop (imported by session.ts)
vi.mock('../../../src/beast-loop.js', () => {
  const MockBeastLoop = vi.fn(function (this: { run: () => Promise<unknown> }) {
    this.run = vi.fn(async () => ({
      sessionId: 'test', projectId: 'test', phase: 'closure',
      status: 'completed', tokenSpend: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      taskResults: [], durationMs: 0,
    }));
  });
  return { BeastLoop: MockBeastLoop };
});

// Mock ChunkFileGraphBuilder (imported by session.ts)
vi.mock('../../../src/planning/chunk-file-graph-builder.js', () => {
  const Mock = vi.fn(function (this: { build: () => Promise<unknown> }) {
    this.build = vi.fn(async () => ({ tasks: [] }));
  });
  return { ChunkFileGraphBuilder: Mock };
});

// Mock file-writer (imported by session.ts)
vi.mock('../../../src/cli/file-writer.js', () => ({
  writeDesignDoc: vi.fn(() => '/mock/design.md'),
  readDesignDoc: vi.fn(() => undefined),
  writeChunkFiles: vi.fn(() => ['/mock/01_chunk.md']),
}));

// Mock design-summary (imported by session.ts)
vi.mock('../../../src/cli/design-summary.js', () => ({
  extractDesignSummary: vi.fn(() => ({ title: 'Mock', summary: 'Mock' })),
  formatDesignCard: vi.fn(() => 'Mock Design Card'),
}));

// Mock review-loop (imported by session.ts)
vi.mock('../../../src/cli/review-loop.js', () => ({
  reviewLoop: vi.fn(async () => {}),
}));

// Mock noop-detector (imported by session.ts)
vi.mock('../../../src/cli/noop-detector.js', () => ({
  isNoOpDesign: vi.fn(() => false),
}));

// ── Helpers ──

function mockIO(answers: string[] = []): InterviewIO {
  let idx = 0;
  return {
    ask: vi.fn(async () => answers[idx++] ?? ''),
    display: vi.fn(),
  };
}

function makeConfig(
  overrides: Partial<import('../../../src/cli/session.js').SessionConfig> = {},
): import('../../../src/cli/session.js').SessionConfig {
  const testDir = resolve(
    tmpdir(),
    `fb-test-issues-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
  const paths = getProjectPaths(testDir);
  scaffoldFrankenbeast(paths);

  return {
    paths,
    baseBranch: 'main',
    budget: 5,
    provider: 'claude',
    noPr: false,
    verbose: false,
    reset: false,
    io: mockIO(),
    entryPhase: 'interview',
    issueLabel: ['critical'],
    ...overrides,
  };
}

// ── Tests ──

describe('Session.runIssues()', () => {
  const origLog = console.log;
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
  });
  afterEach(() => {
    console.log = origLog;
  });

  it('happy path: fetch → triage → review → run → summary', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    const session = new Session(config);

    await session.runIssues();

    expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
    expect(mockTriageInstance.triage).toHaveBeenCalledTimes(1);
    expect(mockReviewInstance.review).toHaveBeenCalledTimes(1);
    expect(mockRunnerInstance.run).toHaveBeenCalledTimes(1);
    expect(mockFinalize).toHaveBeenCalled();
  });

  it('constructs fetch options from CLI args', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig({
      issueLabel: ['critical', 'high'],
      issueMilestone: 'v2.0',
      issueSearch: 'login',
      issueAssignee: 'bob',
      issueLimit: 10,
    });
    const session = new Session(config);

    await session.runIssues();

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        label: ['critical', 'high'],
        milestone: 'v2.0',
        search: 'login',
        assignee: 'bob',
        limit: 10,
      }),
    );
  });

  it('--dry-run stops after review (does not execute)', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    mockReviewInstance.review.mockResolvedValueOnce({ approved: [], action: 'abort' });
    const config = makeConfig({ dryRun: true });
    const session = new Session(config);

    await session.runIssues();

    expect(mockFetcher.fetch).toHaveBeenCalled();
    expect(mockTriageInstance.triage).toHaveBeenCalled();
    expect(mockReviewInstance.review).toHaveBeenCalled();
    expect(mockRunnerInstance.run).not.toHaveBeenCalled();
  });

  it('handles review abort gracefully (log and exit, not throw)', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    mockReviewInstance.review.mockResolvedValueOnce({ approved: [], action: 'abort' });
    const config = makeConfig();
    const session = new Session(config);

    // Should not throw
    await expect(session.runIssues()).resolves.toBeUndefined();
    expect(mockRunnerInstance.run).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('abort'),
      expect.anything(),
    );
  });

  it('falls back to --repo flag when inferRepo() fails', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    mockFetcher.inferRepo.mockRejectedValueOnce(new Error('not a git repo'));
    const config = makeConfig({ issueRepo: 'fallback/repo' });
    const session = new Session(config);

    await session.runIssues();

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'fallback/repo' }),
    );
  });

  it('throws when inferRepo() fails and no --repo flag', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    mockFetcher.inferRepo.mockRejectedValueOnce(new Error('not a git repo'));
    const config = makeConfig({ issueRepo: undefined });
    const session = new Session(config);

    await expect(session.runIssues()).rejects.toThrow(/--repo/);
  });

  it('flows budget through to IssueRunner', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig({ budget: 25 });
    const session = new Session(config);

    await session.runIssues();

    expect(mockRunnerInstance.run).toHaveBeenCalledWith(
      expect.objectContaining({ budget: 25 }),
    );
  });

  it('flows --no-pr through to IssueRunner', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig({ noPr: true });
    const session = new Session(config);

    await session.runIssues();

    expect(mockRunnerInstance.run).toHaveBeenCalledWith(
      expect.objectContaining({ noPr: true }),
    );
  });

  it('passes baseBranch and repo to IssueRunner', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig({ baseBranch: 'develop' });
    const session = new Session(config);

    await session.runIssues();

    expect(mockRunnerInstance.run).toHaveBeenCalledWith(
      expect.objectContaining({
        baseBranch: 'develop',
        repo: 'org/repo',
      }),
    );
  });

  it('displays summary table with outcomes', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    mockRunnerInstance.run.mockResolvedValueOnce([
      makeOutcome({ issueNumber: 1, status: 'fixed', prUrl: 'https://pr/1' }),
      makeOutcome({ issueNumber: 2, status: 'failed', issueTitle: 'Another bug' }),
    ]);
    const config = makeConfig();
    const session = new Session(config);

    await session.runIssues();

    // Summary header should be printed
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ISSUE SUMMARY'));
  });

  it('passes only approved issues to IssueRunner', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, title: 'Other' })];
    mockFetcher.fetch.mockResolvedValueOnce(issues);
    mockTriageInstance.triage.mockResolvedValueOnce([
      makeTriage({ issueNumber: 1 }),
      makeTriage({ issueNumber: 2 }),
    ]);
    // Only approve issue 1
    mockReviewInstance.review.mockResolvedValueOnce({
      approved: [makeTriage({ issueNumber: 1 })],
      action: 'execute',
    });

    const config = makeConfig();
    const session = new Session(config);

    await session.runIssues();

    const runCall = mockRunnerInstance.run.mock.calls[0]![0];
    expect(runCall.issues).toHaveLength(1);
    expect(runCall.issues[0].number).toBe(1);
    expect(runCall.triageResults).toHaveLength(1);
  });

  it('wires graphBuilder, executor, git, checkpoint to IssueRunner', async () => {
    const { Session } = await import('../../../src/cli/session.js');
    const config = makeConfig();
    const session = new Session(config);

    await session.runIssues();

    expect(mockRunnerInstance.run).toHaveBeenCalledWith(
      expect.objectContaining({
        graphBuilder: mockGraphBuilder,
        executor: mockExecutor,
        git: mockGit,
        checkpoint: mockCheckpoint,
      }),
    );
  });
});

describe('resolvePhases handles issues subcommand', () => {
  it('returns entryPhase for issues subcommand', async () => {
    const { resolvePhases } = await import('../../../src/cli/run.js');
    const result = resolvePhases({ subcommand: 'issues' });
    expect(result.entryPhase).toBeDefined();
  });
});
