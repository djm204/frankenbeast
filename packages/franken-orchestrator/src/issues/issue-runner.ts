import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PlanGraph, ICheckpointStore, ILogger, SkillInput } from '../deps.js';
import type { GithubIssue, TriageResult, IssueOutcome } from './types.js';
import type { IssueGraphBuilder } from './issue-graph-builder.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import type { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import type { PrCreator } from '../closure/pr-creator.js';
import type { CliSkillConfig, IterationResult } from '../skills/cli-types.js';
import type { BeastResult, TaskOutcome } from '../types.js';

export interface IssueRuntimeArtifacts {
  readonly planName: string;
  readonly checkpointFile: string;
  readonly logFile: string;
}

export interface IssueRuntimeSupport {
  planNameForIssue(issueNumber: number): string;
  checkpointForIssue(issueNumber: number): ICheckpointStore;
  artifactsForIssue(issueNumber: number): IssueRuntimeArtifacts;
}

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
  readonly provider: string;
  readonly providers?: readonly string[] | undefined;
  readonly issueRuntime?: IssueRuntimeSupport | undefined;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const NO_SEVERITY = 4;
const TOKENS_PER_DOLLAR = 1_000_000;
const ONE_SHOT_MAX_ITERATIONS = 1_000;
const ONE_SHOT_STALE_MATE_LIMIT = 3;

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

function taskStage(taskId: string): 'impl' | 'harden' {
  return taskId.startsWith('harden:') ? 'harden' : 'impl';
}

function taskChunkId(taskId: string): string {
  const [, ...rest] = taskId.split(':');
  const base = rest.join(':');
  return taskStage(taskId) === 'harden' ? `${base}/harden` : base;
}

function appendIssueLog(logFile: string | undefined, message: string): void {
  if (!logFile) return;
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

export class IssueRunner {
  async run(config: IssueRunnerConfig): Promise<IssueOutcome[]> {
    const {
      issues,
      triageResults,
      budget,
      logger,
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
        const outcome = await this.processIssue(issue, triage, config, cumulativeTokens, budgetTokens);
        cumulativeTokens += outcome.tokensUsed;
        outcomes.push(outcome);

        if (cumulativeTokens >= budgetTokens) {
          budgetExceeded = true;
        }
      } catch (err) {
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
    const {
      graphBuilder,
      executor,
      git,
      prCreator,
      checkpoint,
      logger,
      noPr,
      baseBranch,
      repo,
      provider,
      providers,
      issueRuntime,
    } = config;

    const runtimeArtifacts = issueRuntime?.artifactsForIssue(issue.number);
    const issueCheckpoint = issueRuntime?.checkpointForIssue(issue.number) ?? checkpoint;
    const planName = issueRuntime?.planNameForIssue(issue.number) ?? `issue-${issue.number}`;
    const logFile = runtimeArtifacts?.logFile;

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

    if (issueCheckpoint && graph.tasks.every(t => issueCheckpoint.has(t.id))) {
      logger?.info(`[issues] Issue #${issue.number} already completed (checkpoint)`, undefined, 'issues');
      appendIssueLog(logFile, `Issue #${issue.number} already complete from checkpoint`);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'fixed',
        tokensUsed: 0,
      };
    }

    git.isolate(`issue-${issue.number}`);

    let issueTokens = 0;
    const taskOutcomes: TaskOutcome[] = [];

    for (const task of graph.tasks) {
      if (cumulativeTokens + issueTokens >= budgetTokens) {
        return {
          issueNumber: issue.number,
          issueTitle: issue.title,
          status: 'failed',
          tokensUsed: issueTokens,
          error: 'Budget exceeded',
        };
      }

      if (issueCheckpoint?.has(task.id)) {
        appendIssueLog(logFile, `Skipping checkpointed task ${task.id}`);
        taskOutcomes.push({ taskId: task.id, status: 'success' });
        continue;
      }

      try {
        const stage = taskStage(task.id);
        if (issueCheckpoint?.lastCommit(task.id, stage)) {
          appendIssueLog(logFile, `Recovering ${task.id} from checkpointed commit`);
          await executor.recoverDirtyFiles(task.id, stage, issueCheckpoint, logger);
        }

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
            promiseTag: stage === 'harden'
              ? `HARDEN_issue-${issue.number}_DONE`
              : `IMPL_issue-${issue.number}_DONE`,
            maxIterations: triage.complexity === 'chunked' ? 10 : ONE_SHOT_MAX_ITERATIONS,
            maxTurns: 25,
            provider,
            providers,
            planName,
            chunkId: taskChunkId(task.id),
            taskId: task.id,
            ...(triage.complexity === 'one-shot' ? { staleMateLimit: ONE_SHOT_STALE_MATE_LIMIT } : {}),
            onProviderAttempt: (activeProvider: string, iteration: number) => {
              appendIssueLog(logFile, `Task ${task.id} iteration ${iteration} provider ${activeProvider}`);
            },
            onProviderSwitch: (fromProvider: string, toProvider: string, reason: 'rate-limit' | 'post-sleep-reset') => {
              appendIssueLog(logFile, `Task ${task.id} provider switch ${fromProvider} -> ${toProvider} (${reason})`);
            },
            onSleep: (durationMs: number, source: string) => {
              appendIssueLog(logFile, `Task ${task.id} sleeping ${durationMs}ms (${source})`);
            },
            onIteration: (iteration: number, result: IterationResult) => {
              appendIssueLog(
                logFile,
                `Task ${task.id} iteration ${iteration} exit=${result.exitCode} rateLimited=${result.rateLimited} promise=${result.promiseDetected}`,
              );
            },
            timeoutMs: 600_000,
          },
          git: {
            baseBranch,
            branchPrefix: 'fix/',
            autoCommit: true,
            workingDir: '.',
          },
        };

        const result = await executor.execute(task.id, input, skillConfig, issueCheckpoint, task.id);
        issueTokens += result.tokensUsed ?? 0;
        taskOutcomes.push({ taskId: task.id, status: 'success', output: result.output });
        appendIssueLog(logFile, `Task ${task.id} completed`);
        issueCheckpoint?.write(task.id);
      } catch (err) {
        appendIssueLog(logFile, `Task ${task.id} failed: ${err instanceof Error ? err.message : String(err)}`);
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
          appendIssueLog(logFile, `Issue #${issue.number} fixed with PR ${prUrl}`);
        }
      } catch (err) {
        logger?.warn(
          `[issues] PR creation failed for issue #${issue.number}: ${err instanceof Error ? err.message : String(err)}`,
          undefined,
          'issues',
        );
      }
    }

    appendIssueLog(logFile, `Issue #${issue.number} completed`);

    return {
      issueNumber: issue.number,
      issueTitle: issue.title,
      status: 'fixed',
      tokensUsed: issueTokens,
      prUrl,
    };
  }
}
