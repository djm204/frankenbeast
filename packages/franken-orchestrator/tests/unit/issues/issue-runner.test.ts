import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueRunner } from '../../../src/issues/issue-runner.js';
import type { IssueRunnerConfig } from '../../../src/issues/issue-runner.js';
import type { GithubIssue, TriageResult, IssueOutcome } from '../../../src/issues/types.js';
import type { PlanGraph, PlanTask, ICheckpointStore, ILogger, SkillResult, SkillInput } from '../../../src/deps.js';
import type { IssueGraphBuilder } from '../../../src/issues/issue-graph-builder.js';
import type { CliSkillExecutor } from '../../../src/skills/cli-skill-executor.js';
import type { GitBranchIsolator } from '../../../src/skills/git-branch-isolator.js';
import type { PrCreator } from '../../../src/closure/pr-creator.js';
import type { CliSkillConfig } from '../../../src/skills/cli-types.js';
import type { IssueRuntimeArtifacts, IssueRuntimeSupport } from '../../../src/issues/issue-runner.js';

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

function makeSuccessResult(tokens: number = 100): SkillResult {
  return { output: 'done', tokensUsed: tokens };
}

// ── Mock builders ──

function mockGraphBuilder(): IssueGraphBuilder {
  return {
    buildForIssue: vi.fn(async (issue: GithubIssue) => makeGraph(issue.number)),
  } as unknown as IssueGraphBuilder;
}

function mockExecutor(result: SkillResult = makeSuccessResult()): CliSkillExecutor {
  return {
    execute: vi.fn(async () => result),
  } as unknown as CliSkillExecutor;
}

function mockGit(): GitBranchIsolator {
  return {
    isolate: vi.fn(),
  } as unknown as GitBranchIsolator;
}

function mockPrCreator(url: string = 'https://github.com/org/repo/pull/1'): PrCreator {
  return {
    create: vi.fn(async () => ({ url })),
  } as unknown as PrCreator;
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
    executor: mockExecutor(),
    git: mockGit(),
    budget: 10,
    baseBranch: 'main',
    noPr: true,
    repo: 'org/repo',
    provider: 'claude',
    providers: ['claude', 'codex'],
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
      const executor = mockExecutor();
      const config = makeConfig({ issues, triageResults: triages, executor });
      const outcomes = await runner.run(config);

      const order = outcomes.map(o => o.issueNumber);
      expect(order).toEqual([2, 4, 3, 1]);
    });

    it('sorts issues without severity labels to the end', async () => {
      const issues = [
        makeIssue({ number: 1, labels: ['bug'] }),
        makeIssue({ number: 2, labels: ['critical'] }),
        makeIssue({ number: 3, labels: [] }),
      ];
      const triages = [makeTriage(1), makeTriage(2), makeTriage(3)];
      const config = makeConfig({ issues, triageResults: triages });
      const outcomes = await runner.run(config);

      expect(outcomes[0]!.issueNumber).toBe(2);
      // Issues 1 and 3 both have no severity → sorted to end
      expect([outcomes[1]!.issueNumber, outcomes[2]!.issueNumber]).toEqual(
        expect.arrayContaining([1, 3]),
      );
    });

    it('matches severity labels case-insensitively', async () => {
      const issues = [
        makeIssue({ number: 1, labels: ['LOW'] }),
        makeIssue({ number: 2, labels: ['Critical'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({ issues, triageResults: triages });
      const outcomes = await runner.run(config);

      expect(outcomes[0]!.issueNumber).toBe(2);
      expect(outcomes[1]!.issueNumber).toBe(1);
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

    it('calls executor.execute() for each task in the graph', async () => {
      const executor = mockExecutor();
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({ issues, triageResults: triages, executor });

      await runner.run(config);

      // Default graph has 2 tasks: impl + harden
      expect(executor.execute).toHaveBeenCalledTimes(2);
    });

    it('creates branch fix/issue-<N> via git.isolate()', async () => {
      const git = mockGit();
      const issues = [makeIssue({ number: 99 })];
      const triages = [makeTriage(99)];
      const config = makeConfig({ issues, triageResults: triages, git });

      await runner.run(config);

      expect(git.isolate).toHaveBeenCalledWith('issue-99');
    });

    it('passes the configured provider and fallback chain into Martin execution', async () => {
      const executor = mockExecutor();
      const issues = [makeIssue({ number: 12 })];
      const triages = [makeTriage(12)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        provider: 'gemini',
        providers: ['gemini', 'codex', 'claude'],
      });

      await runner.run(config);

      const firstCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const skillConfig = firstCall?.[2] as CliSkillConfig | undefined;
      expect(skillConfig?.martin.provider).toBe('gemini');
      expect(skillConfig?.martin.providers).toEqual(['gemini', 'codex', 'claude']);
    });

    it('uses issue-aware Martin identity for one-shot issues', async () => {
      const executor = mockExecutor();
      const issueRuntime = makeIssueRuntimeSupport();
      const issues = [makeIssue({ number: 89 })];
      const triages = [makeTriage(89, 'one-shot')];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        issueRuntime,
      });

      await runner.run(config);

      const firstCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const skillConfig = firstCall?.[2] as CliSkillConfig | undefined;
      expect(skillConfig?.martin.planName).toBe('issue-89');
      expect(skillConfig?.martin.chunkId).toBe('issue-89');
      expect(skillConfig?.martin.taskId).toBe('impl:issue-89');
    });

    it('uses a distinct Martin chunk identity for harden issue tasks', async () => {
      const executor = mockExecutor();
      const issueRuntime = makeIssueRuntimeSupport();
      const issues = [makeIssue({ number: 89 })];
      const triages = [makeTriage(89, 'one-shot')];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        issueRuntime,
      });

      await runner.run(config);

      const hardenCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[1];
      const skillConfig = hardenCall?.[2] as CliSkillConfig | undefined;
      expect(skillConfig?.martin.chunkId).toBe('issue-89/harden');
      expect(skillConfig?.martin.taskId).toBe('harden:issue-89');
    });

    it('does not apply the chunk 10-iteration cap to one-shot issues', async () => {
      const executor = mockExecutor();
      const issues = [makeIssue({ number: 89 })];
      const triages = [makeTriage(89, 'one-shot')];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
      });

      await runner.run(config);

      const firstCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const skillConfig = firstCall?.[2] as CliSkillConfig | undefined;
      expect(skillConfig?.martin.maxIterations).not.toBe(10);
    });

    it('keeps the chunk 10-iteration cap for decomposed chunk tasks', async () => {
      const executor = mockExecutor();
      const issues = [makeIssue({ number: 90 })];
      const triages = [makeTriage(90, 'chunked')];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
      });

      await runner.run(config);

      const firstCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const skillConfig = firstCall?.[2] as CliSkillConfig | undefined;
      expect(skillConfig?.martin.maxIterations).toBe(10);
    });
  });

  describe('PR creation', () => {
    it('calls prCreator.create() on success when noPr is false', async () => {
      const prCreator = mockPrCreator('https://github.com/org/repo/pull/42');
      const issues = [makeIssue({ number: 42 })];
      const triages = [makeTriage(42)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        prCreator,
        noPr: false,
      });

      const outcomes = await runner.run(config);

      expect(prCreator.create).toHaveBeenCalledOnce();
      expect(outcomes[0]!.status).toBe('fixed');
      expect(outcomes[0]!.prUrl).toBe('https://github.com/org/repo/pull/42');
    });

    it('includes "Fixes #N" in the PR body', async () => {
      const prCreator = mockPrCreator();
      const issues = [makeIssue({ number: 42 })];
      const triages = [makeTriage(42)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        prCreator,
        noPr: false,
      });

      await runner.run(config);

      const createCall = (prCreator.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const beastResult = createCall[0];
      expect(beastResult).toBeDefined();
      expect(beastResult.planSummary).toContain('Fixes #42');
    });

    it('does not call prCreator when noPr is true', async () => {
      const prCreator = mockPrCreator();
      const issues = [makeIssue({ number: 1 })];
      const triages = [makeTriage(1)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        prCreator,
        noPr: true,
      });

      await runner.run(config);

      expect(prCreator.create).not.toHaveBeenCalled();
    });

    it('records outcome without prUrl when prCreator fails', async () => {
      const prCreator = {
        create: vi.fn(async () => { throw new Error('gh not authed'); }),
      } as unknown as PrCreator;
      const logger = mockLogger();
      const issues = [makeIssue({ number: 5 })];
      const triages = [makeTriage(5)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        prCreator,
        noPr: false,
        logger,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]!.status).toBe('fixed');
      expect(outcomes[0]!.prUrl).toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('records outcome without prUrl when prCreator returns null', async () => {
      const prCreator = {
        create: vi.fn(async () => null),
      } as unknown as PrCreator;
      const issues = [makeIssue({ number: 6 })];
      const triages = [makeTriage(6)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        prCreator,
        noPr: false,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]!.status).toBe('fixed');
      expect(outcomes[0]!.prUrl).toBeUndefined();
    });
  });

  describe('failure handling', () => {
    it('records failed outcome when executor throws, continues to next issue', async () => {
      const executor = {
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('compile error'))
          .mockResolvedValueOnce(makeSuccessResult())
          .mockResolvedValueOnce(makeSuccessResult()),
      } as unknown as CliSkillExecutor;
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({ issues, triageResults: triages, executor });

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
      const executor = {
        execute: vi.fn(async () => ({ output: 'done', tokensUsed: 600_000 })),
      } as unknown as CliSkillExecutor;
      const issues = [
        makeIssue({ number: 1, labels: ['critical'] }),
        makeIssue({ number: 2, labels: ['high'] }),
        makeIssue({ number: 3, labels: ['medium'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2), makeTriage(3)];
      // Budget of $1 → 1_000_000 tokens. First issue uses 1.2M tokens (2 tasks × 600k)
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        budget: 1,
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(3);
      // First issue should complete (or fail, but attempt)
      // Second and third should be skipped due to budget
      const skipped = outcomes.filter(o => o.status === 'skipped');
      expect(skipped.length).toBeGreaterThanOrEqual(1);
    });

    it('tracks cumulative tokensUsed across issues', async () => {
      const executor = {
        execute: vi.fn(async () => ({ output: 'done', tokensUsed: 100 })),
      } as unknown as CliSkillExecutor;
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        budget: 100, // Very high budget — both should complete
      });

      const outcomes = await runner.run(config);

      // Each issue has 2 tasks × 100 tokens = 200 tokens per issue
      expect(outcomes[0]!.tokensUsed).toBe(200);
      expect(outcomes[1]!.tokensUsed).toBe(200);
    });
  });

  describe('checkpoint integration', () => {
    it('skips issues where all tasks already checkpointed', async () => {
      const checkpoint = mockCheckpoint(
        new Set(['impl:issue-1', 'harden:issue-1']),
      );
      const executor = mockExecutor();
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        checkpoint,
        logger: mockLogger(),
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      // Issue 1 should be skipped (already completed via checkpoint)
      expect(outcomes.find(o => o.issueNumber === 1)!.status).toBe('fixed');
      // Issue 2 should be executed
      // executor.execute called only for issue 2's tasks
      expect(executor.execute).toHaveBeenCalledTimes(2);
    });

    it('recovers unfinished one-shot issue work from the last checkpointed commit before resuming', async () => {
      const checkpoint = mockCheckpoint(new Set());
      checkpoint.lastCommit = vi.fn((taskId: string, stage: string) =>
        taskId === 'impl:issue-89' && stage === 'impl' ? 'abc123' : undefined,
      );
      const executor = {
        execute: vi.fn(async () => ({ output: 'done', tokensUsed: 100 })),
        recoverDirtyFiles: vi.fn(async () => 'clean'),
      } as unknown as CliSkillExecutor;
      const issues = [makeIssue({ number: 89 })];
      const triages = [makeTriage(89, 'one-shot')];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        checkpoint,
        logger: mockLogger(),
      });

      await runner.run(config);

      expect((executor.recoverDirtyFiles as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        'impl:issue-89',
        'impl',
        checkpoint,
        expect.anything(),
      );
    });
  });

  describe('logging', () => {
    it('logs progress with [issues] service label', async () => {
      const logger = mockLogger();
      const issues = [makeIssue({ number: 42 }), makeIssue({ number: 43 })];
      const triages = [makeTriage(42), makeTriage(43)];
      const config = makeConfig({ issues, triageResults: triages, logger });

      await runner.run(config);

      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const issueMessages = infoCalls.map((c: unknown[]) => c[0] as string);
      expect(issueMessages.some((m: string) => m.includes('[issues]') && m.includes('#42'))).toBe(true);
      expect(issueMessages.some((m: string) => m.includes('[issues]') && m.includes('1/'))).toBe(true);
    });

    it('logs PR URL on success', async () => {
      const logger = mockLogger();
      const prCreator = mockPrCreator('https://github.com/org/repo/pull/42');
      const issues = [makeIssue({ number: 42 })];
      const triages = [makeTriage(42)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        prCreator,
        noPr: false,
        logger,
      });

      await runner.run(config);

      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const msgs = infoCalls.map((c: unknown[]) => c[0] as string);
      expect(msgs.some((m: string) => m.includes('[issues]') && m.includes('PR:'))).toBe(true);
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
      expect(outcome.tokensUsed).toBeGreaterThanOrEqual(0);
      expect(outcome.error).toBeUndefined();
    });

    it('returns IssueOutcome with error on failure', async () => {
      const executor = {
        execute: vi.fn().mockRejectedValue(new Error('oops')),
      } as unknown as CliSkillExecutor;
      const issues = [makeIssue({ number: 1 })];
      const triages = [makeTriage(1)];
      const config = makeConfig({ issues, triageResults: triages, executor });

      const outcomes = await runner.run(config);

      expect(outcomes[0]!.status).toBe('failed');
      expect(outcomes[0]!.error).toBe('oops');
    });

    it('returns IssueOutcome with status skipped when budget exceeded', async () => {
      // Use a tiny budget so after first issue, the rest are skipped
      const executor = {
        execute: vi.fn(async () => ({ output: 'ok', tokensUsed: 2_000_000 })),
      } as unknown as CliSkillExecutor;
      const issues = [
        makeIssue({ number: 1, labels: ['critical'] }),
        makeIssue({ number: 2, labels: ['low'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        executor,
        budget: 1, // $1 = 1M tokens
      });

      const outcomes = await runner.run(config);

      const skipped = outcomes.find(o => o.issueNumber === 2);
      expect(skipped).toBeDefined();
      expect(skipped!.status).toBe('skipped');
    });
  });
});
