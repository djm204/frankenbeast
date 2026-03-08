import { describe, it, expect, vi } from 'vitest';
import { IssueFetcher } from '../../../src/issues/issue-fetcher.js';
import { IssueTriage } from '../../../src/issues/issue-triage.js';
import { IssueGraphBuilder } from '../../../src/issues/issue-graph-builder.js';
import { IssueReview } from '../../../src/issues/issue-review.js';
import type { ReviewIO } from '../../../src/issues/issue-review.js';
import { IssueRunner } from '../../../src/issues/issue-runner.js';
import type { ICheckpointStore, ILogger } from '../../../src/deps.js';
import type { CliSkillExecutor } from '../../../src/skills/cli-skill-executor.js';
import type { GitBranchIsolator } from '../../../src/skills/git-branch-isolator.js';
import type { PrCreator } from '../../../src/closure/pr-creator.js';

// ── Boundary mock helpers ──

interface RawGhIssue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  state: string;
  url: string;
}

function ghExecFn(rawIssues: RawGhIssue[]) {
  return vi.fn(
    (
      _file: string,
      _args: string[],
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, JSON.stringify(rawIssues), '');
    },
  );
}

function autoApproveIO(): ReviewIO {
  return {
    read: vi.fn(async () => 'y'),
    write: vi.fn(),
  };
}

function noopCheckpoint(): ICheckpointStore {
  return {
    has: vi.fn(() => false),
    write: vi.fn(),
    readAll: vi.fn(() => new Set<string>()),
    clear: vi.fn(),
    recordCommit: vi.fn(),
    lastCommit: vi.fn(() => undefined),
  };
}

function silentLogger(): ILogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function stubExecutor(tokensUsed = 500) {
  return {
    execute: vi.fn(async () => ({ output: 'done', tokensUsed })),
  } as unknown as CliSkillExecutor;
}

function stubGit() {
  return { isolate: vi.fn() } as unknown as GitBranchIsolator;
}

function stubPrCreator(url = 'https://github.com/org/repo/pull/1') {
  return {
    create: vi.fn(async () => ({ url })),
  } as unknown as PrCreator;
}

// ── Tests ──

describe('issues E2E pipeline', () => {
  it('issues pipeline processes a one-shot issue end-to-end', async () => {
    // Boundary mocks
    const execFn = ghExecFn([
      {
        number: 42,
        title: 'Fix login crash',
        body: 'Login crashes on empty password',
        labels: [{ name: 'critical' }],
        state: 'OPEN',
        url: 'https://github.com/org/repo/issues/42',
      },
    ]);

    const completeFn = vi.fn(async () =>
      JSON.stringify([
        {
          issueNumber: 42,
          complexity: 'one-shot',
          rationale: 'Simple null check fix',
          estimatedScope: 'src/auth.ts',
        },
      ]),
    );

    const reviewIO = autoApproveIO();
    const executor = stubExecutor();
    const git = stubGit();
    const prCreator = stubPrCreator();
    const checkpoint = noopCheckpoint();
    const logger = silentLogger();

    // Real pipeline instances wired with mocked boundaries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetcher = new IssueFetcher(execFn as any);
    const triage = new IssueTriage(completeFn);
    const graphBuilder = new IssueGraphBuilder(completeFn);
    const review = new IssueReview(reviewIO);
    const runner = new IssueRunner();

    // Pipeline: fetch → triage → review → execute
    const issues = await fetcher.fetch({ repo: 'org/repo' });
    const triageResults = await triage.triage(issues);
    const decision = await review.review(issues, triageResults);

    expect(decision.action).toBe('execute');

    const outcomes = await runner.run({
      issues,
      triageResults: decision.approved,
      graphBuilder,
      executor,
      git,
      prCreator,
      checkpoint,
      logger,
      budget: 10,
      baseBranch: 'main',
      noPr: false,
      repo: 'org/repo',
    });

    // Assert: IssueOutcome has status 'fixed'
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('fixed');
    expect(outcomes[0]!.issueNumber).toBe(42);

    // Assert: PrCreator.create() called with Fixes #42 in body
    expect(prCreator.create).toHaveBeenCalledOnce();
    const createCall = (prCreator.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(createCall[0].planSummary).toContain('Fixes #42');
    expect(createCall[2]).toEqual({ issueNumber: 42 });
  });

  it('issues pipeline decomposes a chunked issue into multiple tasks', async () => {
    const execFn = ghExecFn([
      {
        number: 10,
        title: 'Add input validation',
        body: 'Need validation across multiple endpoints',
        labels: [{ name: 'high' }],
        state: 'OPEN',
        url: 'https://github.com/org/repo/issues/10',
      },
    ]);

    const completeFn = vi.fn(async (prompt: string) => {
      if (prompt.includes('triage assistant')) {
        return JSON.stringify([
          {
            issueNumber: 10,
            complexity: 'chunked',
            rationale: 'Multi-file change requiring decomposition',
            estimatedScope: 'src/ and tests/',
          },
        ]);
      }
      // Decomposition prompt from IssueGraphBuilder
      return JSON.stringify([
        {
          id: 'add-validators',
          objective: 'Add input validation to user endpoints',
          files: ['src/validate.ts'],
          successCriteria: 'All inputs validated',
          verificationCommand: 'npx vitest run tests/validate.test.ts',
          dependencies: [],
        },
        {
          id: 'add-error-handling',
          objective: 'Add error handling for invalid input',
          files: ['src/handler.ts'],
          successCriteria: 'Error responses correct',
          verificationCommand: 'npx vitest run tests/handler.test.ts',
          dependencies: ['add-validators'],
        },
      ]);
    });

    const reviewIO = autoApproveIO();
    const executor = stubExecutor(200);
    const git = stubGit();
    const prCreator = stubPrCreator();
    const checkpoint = noopCheckpoint();

    // Real pipeline instances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetcher = new IssueFetcher(execFn as any);
    const triage = new IssueTriage(completeFn);
    const graphBuilder = new IssueGraphBuilder(completeFn);
    const review = new IssueReview(reviewIO);
    const runner = new IssueRunner();

    const issues = await fetcher.fetch({ repo: 'org/repo' });
    const triageResults = await triage.triage(issues);
    const decision = await review.review(issues, triageResults);

    const outcomes = await runner.run({
      issues,
      triageResults: decision.approved,
      graphBuilder,
      executor,
      git,
      prCreator,
      checkpoint,
      budget: 10,
      baseBranch: 'main',
      noPr: false,
      repo: 'org/repo',
    });

    // Assert: 4 tasks executed (2 impl + 2 harden)
    expect(executor.execute).toHaveBeenCalledTimes(4);
    const taskIds = (executor.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    const implTasks = taskIds.filter((id) => id.startsWith('impl:'));
    const hardenTasks = taskIds.filter((id) => id.startsWith('harden:'));
    expect(implTasks).toHaveLength(2);
    expect(hardenTasks).toHaveLength(2);

    // Assert: IssueOutcome has status 'fixed'
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('fixed');
  });

  it('issues pipeline continues on individual issue failure', async () => {
    const execFn = ghExecFn([
      {
        number: 1,
        title: 'Critical bug',
        body: 'body1',
        labels: [{ name: 'critical' }],
        state: 'OPEN',
        url: 'https://github.com/org/repo/issues/1',
      },
      {
        number: 2,
        title: 'High priority fix',
        body: 'body2',
        labels: [{ name: 'high' }],
        state: 'OPEN',
        url: 'https://github.com/org/repo/issues/2',
      },
    ]);

    const completeFn = vi.fn(async () =>
      JSON.stringify([
        { issueNumber: 1, complexity: 'one-shot', rationale: 'r1', estimatedScope: 's1' },
        { issueNumber: 2, complexity: 'one-shot', rationale: 'r2', estimatedScope: 's2' },
      ]),
    );

    const reviewIO = autoApproveIO();
    const executor = {
      execute: vi
        .fn()
        // Issue 1 (critical, processed first): impl fails
        .mockRejectedValueOnce(new Error('MartinLoop did not complete: max iterations'))
        // Issue 2 (high): impl + harden succeed
        .mockResolvedValueOnce({ output: 'done', tokensUsed: 100 })
        .mockResolvedValueOnce({ output: 'done', tokensUsed: 100 }),
    } as unknown as CliSkillExecutor;
    const git = stubGit();
    const prCreator = stubPrCreator();
    const checkpoint = noopCheckpoint();
    const logger = silentLogger();

    // Real pipeline instances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetcher = new IssueFetcher(execFn as any);
    const triage = new IssueTriage(completeFn);
    const graphBuilder = new IssueGraphBuilder(completeFn);
    const review = new IssueReview(reviewIO);
    const runner = new IssueRunner();

    const issues = await fetcher.fetch({ repo: 'org/repo' });
    const triageResults = await triage.triage(issues);
    const decision = await review.review(issues, triageResults);

    const outcomes = await runner.run({
      issues,
      triageResults: decision.approved,
      graphBuilder,
      executor,
      git,
      prCreator,
      checkpoint,
      logger,
      budget: 10,
      baseBranch: 'main',
      noPr: false,
      repo: 'org/repo',
    });

    // Issues sorted by severity: 1 (critical) first, then 2 (high)
    expect(outcomes).toHaveLength(2);
    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'fixed']);

    // Second issue still gets a PR
    expect(prCreator.create).toHaveBeenCalledOnce();
    const createCall = (prCreator.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(createCall[2]).toEqual({ issueNumber: 2 });
  });

  it('dry-run stops after triage review', async () => {
    const execFn = ghExecFn([
      {
        number: 5,
        title: 'Fix timeout',
        body: 'Request times out',
        labels: [{ name: 'medium' }],
        state: 'OPEN',
        url: 'https://github.com/org/repo/issues/5',
      },
    ]);

    const completeFn = vi.fn(async () =>
      JSON.stringify([
        {
          issueNumber: 5,
          complexity: 'one-shot',
          rationale: 'Simple timeout increase',
          estimatedScope: 'src/timeout.ts',
        },
      ]),
    );

    const reviewIO = autoApproveIO();
    const executor = stubExecutor();

    // Real pipeline instances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetcher = new IssueFetcher(execFn as any);
    const triage = new IssueTriage(completeFn);
    const review = new IssueReview(reviewIO, { dryRun: true });

    const issues = await fetcher.fetch({ repo: 'org/repo' });
    const triageResults = await triage.triage(issues);
    const decision = await review.review(issues, triageResults);

    // dry-run returns abort — no execution
    expect(decision.action).toBe('abort');
    expect(decision.approved).toEqual([]);

    // Review table was displayed
    expect(reviewIO.write).toHaveBeenCalled();

    // No execution occurred
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
