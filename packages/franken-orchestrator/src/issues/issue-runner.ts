import type { PlanGraph, PlanTask, ICheckpointStore, ILogger, SkillInput, SkillResult } from '../deps.js';
import type { GithubIssue, TriageResult, IssueOutcome } from './types.js';
import type { IssueGraphBuilder } from './issue-graph-builder.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import type { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import type { PrCreator } from '../closure/pr-creator.js';
import type { CliSkillConfig } from '../skills/cli-types.js';
import type { BeastResult, TaskOutcome } from '../types.js';

export interface IssueRunnerConfig {
  readonly issues: readonly GithubIssue[];
  readonly triageResults: readonly TriageResult[];
  readonly graphBuilder: IssueGraphBuilder;
  readonly executor: CliSkillExecutor;
  readonly git: GitBranchIsolator;
  readonly prCreator?: PrCreator | undefined;
  readonly checkpoint?: ICheckpointStore | undefined;
  readonly logger?: ILogger | undefined;
  readonly budget: number;
  readonly baseBranch: string;
  readonly noPr: boolean;
  readonly repo: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const NO_SEVERITY = 4;

/** Dollars-to-tokens conversion factor (approximate). */
const TOKENS_PER_DOLLAR = 1_000_000;

function extractSeverity(labels: readonly string[]): number {
  for (const label of labels) {
    const rank = SEVERITY_ORDER[label.toLowerCase()];
    if (rank !== undefined) return rank;
  }
  return NO_SEVERITY;
}

function sortBySeverity(issues: readonly GithubIssue[]): GithubIssue[] {
  return [...issues].sort((a, b) => extractSeverity(a.labels) - extractSeverity(b.labels));
}

function findTriage(triages: readonly TriageResult[], issueNumber: number): TriageResult | undefined {
  return triages.find(t => t.issueNumber === issueNumber);
}

export class IssueRunner {
  async run(config: IssueRunnerConfig): Promise<IssueOutcome[]> {
    const {
      issues,
      triageResults,
      graphBuilder,
      executor,
      git,
      prCreator,
      checkpoint,
      logger,
      budget,
      baseBranch,
      noPr,
      repo,
    } = config;

    if (issues.length === 0) return [];

    const sorted = sortBySeverity(issues);
    const budgetTokens = budget * TOKENS_PER_DOLLAR;
    let cumulativeTokens = 0;
    let budgetExceeded = false;
    const outcomes: IssueOutcome[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const issue = sorted[i]!;
      const position = `${i + 1}/${sorted.length}`;

      // Budget exceeded — skip remaining
      if (budgetExceeded) {
        outcomes.push({
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'skipped',
          tokensUsed: 0,
        });
        continue;
      }

      logger?.info(`[issues] Starting issue #${issue.number} (${position})`, undefined, 'issues');

      const triage = findTriage(triageResults, issue.number);
      if (!triage) {
        outcomes.push({
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: 0,
          error: `No triage result for issue #${issue.number}`,
        });
        continue;
      }

      try {
        const outcome = await this.processIssue(
          issue, triage, config, cumulativeTokens, budgetTokens,
        );
        cumulativeTokens += outcome.tokensUsed;
        outcomes.push(outcome);

        if (cumulativeTokens >= budgetTokens) {
          budgetExceeded = true;
        }
      } catch (err) {
        // Catch-all for unexpected errors
        outcomes.push({
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return outcomes;
  }

  private async processIssue(
    issue: GithubIssue,
    triage: TriageResult,
    config: IssueRunnerConfig,
    cumulativeTokens: number,
    budgetTokens: number,
  ): Promise<IssueOutcome> {
    const { graphBuilder, executor, git, prCreator, checkpoint, logger, noPr, baseBranch, repo } = config;

    // Check if all tasks already checkpointed
    let graph: PlanGraph;
    try {
      graph = await graphBuilder.buildForIssue(issue, triage);
    } catch (err) {
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'failed',
        tokensUsed: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Checkpoint: skip if all tasks already done
    if (checkpoint && graph.tasks.every(t => checkpoint.has(t.id))) {
      logger?.info(`[issues] Issue #${issue.number} already completed (checkpoint)`, undefined, 'issues');
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'fixed',
        tokensUsed: 0,
      };
    }

    // Branch isolation for this issue
    git.isolate(`issue-${issue.number}`);

    // Execute each task
    let issueTokens = 0;
    const taskOutcomes: TaskOutcome[] = [];

    for (const task of graph.tasks) {
      // Budget check before each task
      if (cumulativeTokens + issueTokens >= budgetTokens) {
        return {
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: issueTokens,
          error: 'Budget exceeded',
        };
      }

      // Skip if already checkpointed
      if (checkpoint?.has(task.id)) {
        taskOutcomes.push({ taskId: task.id, status: 'success' });
        continue;
      }

      try {
        const input: SkillInput = {
          objective: task.objective,
          context: { adrs: [], knownErrors: [], rules: [] },
          dependencyOutputs: new Map(),
          sessionId: `issue-${issue.number}`,
          projectId: repo,
        };

        const skillConfig: CliSkillConfig = {
          martin: {
            prompt: task.objective,
            promiseTag: `IMPL_issue-${issue.number}_DONE`,
            maxIterations: 10,
            maxTurns: 25,
            provider: 'claude',
            timeoutMs: 600_000,
          },
          git: {
            baseBranch,
            branchPrefix: 'fix/',
            autoCommit: true,
            workingDir: '.',
          },
        };

        const result = await executor.execute(task.id, input, skillConfig, checkpoint, task.id);
        issueTokens += result.tokensUsed ?? 0;
        taskOutcomes.push({ taskId: task.id, status: 'success', output: result.output });

        // Record checkpoint
        checkpoint?.write(task.id);
      } catch (err) {
        taskOutcomes.push({
          taskId: task.id,
          status: 'failure',
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: issueTokens,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // All tasks succeeded — create PR if configured
    let prUrl: string | undefined;
    if (!noPr && prCreator) {
      try {
        const beastResult: BeastResult = {
          sessionId: `issue-${issue.number}`,
          projectId: repo,
          phase: 'execution',
          status: 'completed',
          tokenSpend: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: issueTokens,
            estimatedCostUsd: issueTokens / TOKENS_PER_DOLLAR,
          },
          taskResults: taskOutcomes,
          durationMs: 0,
          planSummary: `Fixes #${issue.number}: ${issue.title}`,
        };

        const prResult = await prCreator.create(beastResult, logger, { issueNumber: issue.number });
        if (prResult) {
          prUrl = prResult.url;
          logger?.info(`[issues] Issue #${issue.number} fixed, PR: ${prUrl}`, undefined, 'issues');
        }
      } catch (err) {
        logger?.warn(
          `[issues] PR creation failed for issue #${issue.number}: ${err instanceof Error ? err.message : String(err)}`,
          undefined,
          'issues',
        );
        // Continue without PR — don't fail the outcome
      }
    }

    return {
      issueNumber: issue.number,
      issueTitle: issue.title,
      status: 'fixed',
      tokensUsed: issueTokens,
      prUrl,
    };
  }
}
