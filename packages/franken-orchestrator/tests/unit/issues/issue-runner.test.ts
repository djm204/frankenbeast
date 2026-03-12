import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueRunner } from '../../../src/issues/issue-runner.js';
import type { IssueRunnerConfig } from '../../../src/issues/issue-runner.js';
import type { GithubIssue, TriageResult } from '../../../src/issues/types.js';
import type { PlanGraph, ICheckpointStore, ILogger, BeastLoopDeps } from '../../../src/deps.js';
import type { IssueGraphBuilder } from '../../../src/issues/issue-graph-builder.js';
import type { GitBranchIsolator } from '../../../src/skills/git-branch-isolator.js';
import type { BeastResult } from '../../../src/types.js';
import type { IssueRuntimeArtifacts, IssueRuntimeSupport } from '../../../src/issues/issue-runner.js';
import type { ChunkDefinition } from '../../../src/cli/file-writer.js';

// ── Mocks ──

const mockLoopConstructions: Array<{ deps: BeastLoopDeps; config: unknown }> = [];

const mockRun = vi.fn(async (deps?: BeastLoopDeps) => {
  // Default mock behavior: success with some tokens used
  const result = {
    status: 'completed',
    tokenSpend: { totalTokens: 200 },
    taskResults: [
      { taskId: 'impl:dummy', status: 'success' },
      { taskId: 'harden:dummy', status: 'success' },
    ],
  } as unknown as BeastResult;

  await deps?.prCreator?.create?.(result, undefined);
  return result;
});

vi.mock('../../../src/beast-loop.js', () => {
  return {
    BeastLoop: class {
      private readonly deps: BeastLoopDeps;

      constructor(deps: BeastLoopDeps, config: unknown) {
        this.deps = deps;
        mockLoopConstructions.push({ deps, config });
      }
      run = async () => mockRun(this.deps);
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

function makeChunks(issueNumber: number, complexity: 'one-shot' | 'chunked' = 'one-shot'): ChunkDefinition[] {
  if (complexity === 'one-shot') {
    return [
      {
        id: `issue-${issueNumber}`,
        objective: `Fix #${issueNumber}`,
        files: [],
        successCriteria: `Verify #${issueNumber}`,
        verificationCommand: 'npm test',
        dependencies: [],
      },
    ];
  }

  return [
    {
      id: `issue-${issueNumber}-part-1`,
      objective: `Fix #${issueNumber} part 1`,
      files: [],
      successCriteria: `Verify #${issueNumber} part 1`,
      verificationCommand: 'npm test',
      dependencies: [],
    },
    {
      id: `issue-${issueNumber}-part-2`,
      objective: `Fix #${issueNumber} part 2`,
      files: [],
      successCriteria: `Verify #${issueNumber} part 2`,
      verificationCommand: 'npm test',
      dependencies: [`issue-${issueNumber}-part-1`],
    },
  ];
}

// ── Mock builders ──

function mockGraphBuilder(): IssueGraphBuilder {
  return {
    buildForIssue: vi.fn(async (issue: GithubIssue) => {
      const implId = `impl:issue-${issue.number}`;
      const hardenId = `harden:issue-${issue.number}`;
      return {
        tasks: [
          { id: implId, objective: `Fix #${issue.number}`, requiredSkills: [`cli:issue-${issue.number}`], dependsOn: [] },
          { id: hardenId, objective: `Verify #${issue.number}`, requiredSkills: [`cli:issue-${issue.number}/harden`], dependsOn: [implId] },
        ],
      } as PlanGraph;
    }),
    buildChunkDefinitionsForIssue: vi.fn(async (issue: GithubIssue, triage: TriageResult) =>
      makeChunks(issue.number, triage.complexity),
    ),
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
      planDir: `/tmp/plans/issue-${issueNumber}`,
      checkpointFile: `/tmp/issue-${issueNumber}.checkpoint`,
      logFile: `/tmp/issue-${issueNumber}-build.log`,
    })),
  };
}

describe('IssueRunner', () => {
  let runner: IssueRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoopConstructions.length = 0;
    mockRun.mockReset();
    mockRun.mockImplementation(async (deps?: BeastLoopDeps) => {
      // Default mock behavior: success with some tokens used
      const result = {
        status: 'completed',
        tokenSpend: { totalTokens: 200 },
        taskResults: [
          { taskId: 'impl:dummy', status: 'success' },
          { taskId: 'harden:dummy', status: 'success' },
        ],
      } as unknown as BeastResult;
      await deps?.prCreator?.create?.(result, undefined);
      return result;
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
    it('calls graphBuilder.buildChunkDefinitionsForIssue() for each issue', async () => {
      const graphBuilder = mockGraphBuilder();
      const issues = [makeIssue({ number: 42 })];
      const triages = [makeTriage(42)];
      const config = makeConfig({ issues, triageResults: triages, graphBuilder });

      await runner.run(config);

      expect(graphBuilder.buildChunkDefinitionsForIssue).toHaveBeenCalledOnce();
      expect(graphBuilder.buildChunkDefinitionsForIssue).toHaveBeenCalledWith(issues[0], triages[0]);
    });

    it('instantiates BeastLoop with issue-specific deps and runs it', async () => {
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({ issues, triageResults: triages });

      await runner.run(config);

      expect(mockRun).toHaveBeenCalled();
    });

    it('registers executable one-shot cli skills in BeastLoop deps', async () => {
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        fullDeps: {
          skills: {
            hasSkill: vi.fn(() => false),
            getAvailableSkills: vi.fn(() => []),
            execute: vi.fn(),
          },
        } as unknown as BeastLoopDeps,
      });

      await runner.run(config);

      const issueDeps = mockLoopConstructions[0]!.deps;
      expect(issueDeps.skills.hasSkill('cli:01_issue-7')).toBe(true);
      expect(issueDeps.skills.getAvailableSkills()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'cli:01_issue-7', executionType: 'cli' }),
        ]),
      );
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
        buildChunkDefinitionsForIssue: vi.fn().mockRejectedValueOnce(new Error('LLM down')),
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
        taskResults: [
          { taskId: 'impl:dummy', status: 'success' },
          { taskId: 'harden:dummy', status: 'success' },
        ],
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
        new Set(['impl:01_issue-1:done', 'harden:01_issue-1:done']),
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
      const config = makeConfig({
        issues,
        triageResults: triages,
        fullDeps: {
          prCreator: {
            create: vi.fn(async () => ({ url: 'https://github.com/org/repo/pull/42' })),
          },
        } as unknown as BeastLoopDeps,
      });

      const outcomes = await runner.run(config);

      const outcome = outcomes[0]!;
      expect(outcome.issueNumber).toBe(42);
      expect(outcome.issueTitle).toBe('Fix the thing');
      expect(outcome.status).toBe('fixed');
      expect(outcome.tokensUsed).toBe(200);
      expect(outcome.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(outcome.error).toBeUndefined();
    });
  });
});
