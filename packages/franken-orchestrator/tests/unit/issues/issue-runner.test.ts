import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueRunner } from '../../../src/issues/issue-runner.js';
import type { IssueRunnerConfig } from '../../../src/issues/issue-runner.js';
import type { GithubIssue, TriageResult } from '../../../src/issues/types.js';
import type { PlanGraph, ICheckpointStore, ILogger, BeastLoopDeps } from '../../../src/deps.js';
import type { IssueGraphBuilder } from '../../../src/issues/issue-graph-builder.js';
import type { GitBranchIsolator } from '../../../src/skills/git-branch-isolator.js';
import type { BeastResult } from '../../../src/types.js';
import type { IssueRuntimeArtifacts, IssueRuntimeSupport } from '../../../src/issues/issue-runner.js';

// ── Mocks ──

const mockRun = vi.fn(async () => {
  // Default mock behavior: success with some tokens used
  return {
    status: 'completed',
    tokenSpend: { totalTokens: 200 },
    taskResults: [],
  } as unknown as BeastResult;
});

vi.mock('../../../src/beast-loop.js', () => {
  return {
    BeastLoop: class {
      run = mockRun;
    },
  };
});

import { BeastLoop } from '../../../src/beast-loop.js';

// ── Factories ──

function makeIssue(overrides: Partial<GithubIssue> & { number: number }): GithubIssue {
  return {
    title: `Issue ${overrides.number}`,
    body: `Body for issue ${overrides.number}`,
    labels: [],
    state: 'OPEN',
    url: `https://github.com/org/repo/issues/${overrides.number}`,
    ...overrides,
  };
}

function makeTriage(issueNumber: number, complexity: 'one-shot' | 'chunked' = 'one-shot'): TriageResult {
  return {
    issueNumber,
    complexity,
    rationale: `Triage for #${issueNumber}`,
    estimatedScope: '1 file',
  };
}

function makeGraph(issueNumber: number): PlanGraph {
  const implId = `impl:issue-${issueNumber}`;
  const hardenId = `harden:issue-${issueNumber}`;
  return {
    tasks: [
      { id: implId, objective: `Fix #${issueNumber}`, requiredSkills: [], dependsOn: [] },
      { id: hardenId, objective: `Verify #${issueNumber}`, requiredSkills: [], dependsOn: [implId] },
    ],
  };
}

// ── Mock builders ──

function mockGraphBuilder(): IssueGraphBuilder {
  return {
    buildForIssue: vi.fn(async (issue: GithubIssue) => makeGraph(issue.number)),
  } as unknown as IssueGraphBuilder;
}

function mockGit(): GitBranchIsolator {
  return {
    isolate: vi.fn(),
  } as unknown as GitBranchIsolator;
}

function mockLogger(): ILogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function mockCheckpoint(completed: Set<string> = new Set()): ICheckpointStore {
  return {
    has: vi.fn((key: string) => completed.has(key)),
    write: vi.fn(),
    readAll: vi.fn(() => completed),
    clear: vi.fn(),
    recordCommit: vi.fn(),
    lastCommit: vi.fn(() => undefined),
  };
}

function makeConfig(overrides: Partial<IssueRunnerConfig> = {}): IssueRunnerConfig {
  return {
    issues: [],
    triageResults: [],
    graphBuilder: mockGraphBuilder(),
    fullDeps: {} as any,
    git: mockGit(),
    budget: 10,
    repo: 'org/repo',
    ...overrides,
  };
}

function makeIssueRuntimeSupport(): IssueRuntimeSupport {
  return {
    planNameForIssue: vi.fn((issueNumber: number) => `issue-${issueNumber}`),
    checkpointForIssue: vi.fn((_issueNumber: number) => mockCheckpoint()),
    artifactsForIssue: vi.fn((issueNumber: number): IssueRuntimeArtifacts => ({
      planName: `issue-${issueNumber}`,
      checkpointFile: `/tmp/issue-${issueNumber}.checkpoint`,
      logFile: `/tmp/issue-${issueNumber}-build.log`,
    })),
  };
}

describe('IssueRunner', () => {
  let runner: IssueRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockReset();
    mockRun.mockImplementation(async () => {
      // Default mock behavior: success with some tokens used
      return {
        status: 'completed',
        tokenSpend: { totalTokens: 200 },
        taskResults: [],
      } as unknown as BeastResult;
    });
    runner = new IssueRunner();
  });

  describe('run() basic contract', () => {
    it('returns empty array when no issues provided', async () => {
      const config = makeConfig({ issues: [], triageResults: [] });
      const outcomes = await runner.run(config);
      expect(outcomes).toEqual([]);
    });

    it('returns IssueOutcome[] with one entry per issue', async () => {
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({ issues, triageResults: triages });
      const outcomes = await runner.run(config);
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]!.issueNumber).toBe(1);
      expect(outcomes[1]!.issueNumber).toBe(2);
    });
  });

  describe('severity-priority ordering', () => {
    it('processes critical issues before high before medium before low', async () => {
      const issues = [
        makeIssue({ number: 1, labels: ['low'] }),
        makeIssue({ number: 2, labels: ['critical'] }),
        makeIssue({ number: 3, labels: ['medium'] }),
        makeIssue({ number: 4, labels: ['high'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2), makeTriage(3), makeTriage(4)];
      const config = makeConfig({ issues, triageResults: triages });
      const outcomes = await runner.run(config);

      const order = outcomes.map(o => o.issueNumber);
      expect(order).toEqual([2, 4, 3, 1]);
    });
  });

  describe('per-issue execution', () => {
    it('calls graphBuilder.buildForIssue() for each issue', async () => {
      const graphBuilder = mockGraphBuilder();
      const issues = [makeIssue({ number: 42 })];
      const triages = [makeTriage(42)];
      const config = makeConfig({ issues, triageResults: triages, graphBuilder });

      await runner.run(config);

      expect(graphBuilder.buildForIssue).toHaveBeenCalledOnce();
      expect(graphBuilder.buildForIssue).toHaveBeenCalledWith(issues[0], triages[0]);
    });

    it('instantiates BeastLoop with issue-specific deps and runs it', async () => {
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({ issues, triageResults: triages });

      await runner.run(config);

      expect(mockRun).toHaveBeenCalled();
    });

    it('creates branch fix/issue-<N> via git.isolate()', async () => {
      const git = mockGit();
      const issues = [makeIssue({ number: 99 })];
      const triages = [makeTriage(99)];
      const config = makeConfig({ issues, triageResults: triages, git });

      await runner.run(config);

      expect(git.isolate).toHaveBeenCalledWith('issue-99');
    });
  });

  describe('failure handling', () => {
    it('records failed outcome when BeastLoop throws, continues to next issue', async () => {
      mockRun.mockRejectedValueOnce(new Error('compile error'));
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({ issues, triageResults: triages });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]!.status).toBe('failed');
      expect(outcomes[0]!.error).toContain('compile error');
      expect(outcomes[1]!.status).toBe('fixed');
    });

    it('records failed outcome when graphBuilder throws', async () => {
      const graphBuilder = {
        buildForIssue: vi.fn().mockRejectedValueOnce(new Error('LLM down')),
      } as unknown as IssueGraphBuilder;
      const issues = [makeIssue({ number: 10 })];
      const triages = [makeTriage(10)];
      const config = makeConfig({ issues, triageResults: triages, graphBuilder });

      const outcomes = await runner.run(config);

      expect(outcomes[0]!.status).toBe('failed');
      expect(outcomes[0]!.error).toContain('LLM down');
    });
  });

  describe('budget management', () => {
    it('stops iteration and skips remaining issues when budget exceeded', async () => {
      mockRun.mockImplementation(async () => ({
        status: 'completed',
        tokenSpend: { totalTokens: 1_200_000 },
      }) as any);
      const issues = [
        makeIssue({ number: 1, labels: ['critical'] }),
        makeIssue({ number: 2, labels: ['high'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2)];
      // Budget of $1 → 1_000_000 tokens. First issue uses 1.2M tokens
      const config = makeConfig({
        issues,
        triageResults: triages,
        budget: 1,
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]!.status).toBe('fixed');
      expect(outcomes[1]!.status).toBe('skipped');
    });
  });

  describe('checkpoint integration', () => {
    it('skips issues where all tasks already checkpointed', async () => {
      const checkpoint = mockCheckpoint(
        new Set(['impl:issue-1', 'harden:issue-1']),
      );
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        checkpoint,
        logger: mockLogger(),
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      // Issue 1 should be skipped (already completed via checkpoint)
      expect(outcomes.find(o => o.issueNumber === 1)!.status).toBe('fixed');
      // Issue 2 should be executed
      expect(mockRun).toHaveBeenCalledOnce();
    });
  });

  describe('outcome shape', () => {
    it('returns IssueOutcome with correct fields on success', async () => {
      const issues = [makeIssue({ number: 42, title: 'Fix the thing' })];
      const triages = [makeTriage(42)];
      const config = makeConfig({ issues, triageResults: triages });

      const outcomes = await runner.run(config);

      const outcome = outcomes[0]!;
      expect(outcome.issueNumber).toBe(42);
      expect(outcome.issueTitle).toBe('Fix the thing');
      expect(outcome.status).toBe('fixed');
      expect(outcome.tokensUsed).toBe(200);
      expect(outcome.error).toBeUndefined();
    });
  });
});
