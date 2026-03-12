import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BeastLoop } from '../beast-loop.js';
import { ChunkFileGraphBuilder } from '../planning/chunk-file-graph-builder.js';
import { writeChunkFiles, type ChunkDefinition } from '../cli/file-writer.js';
import { getProjectPaths } from '../cli/project-root.js';
import type { PlanGraph, ICheckpointStore, ILogger, BeastLoopDeps } from '../deps.js';
import type { GithubIssue, TriageResult, IssueOutcome } from './types.js';
import type { IssueGraphBuilder } from './issue-graph-builder.js';
import type { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import type { BeastResult } from '../types.js';

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
  readonly fullDeps: BeastLoopDeps;
  readonly git: GitBranchIsolator;
  readonly logger?: ILogger | undefined;
  readonly budget: number;
  readonly repo: string;
  readonly issueRuntime?: IssueRuntimeSupport | undefined;
  readonly checkpoint?: ICheckpointStore | undefined;
  readonly timeoutMs?: number | undefined;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const NO_SEVERITY = 4;
const TOKENS_PER_DOLLAR = 1_000_000;
const ONE_SHOT_MAX_ITERATIONS = 50;
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
      fullDeps,
      git,
      logger,
      repo,
      issueRuntime,
    } = config;

    const runtimeArtifacts = issueRuntime?.artifactsForIssue(issue.number);
    const issueCheckpoint = issueRuntime?.checkpointForIssue(issue.number) ?? config.checkpoint;
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

    const planDir = resolve(`.frankenbeast/plans/issue-${issue.number}`);
    mkdirSync(planDir, { recursive: true });

    // Convert PlanGraph to ChunkDefinitions for the file writer
    const chunkDefs: ChunkDefinition[] = graph.tasks.map(task => ({
      id: task.id,
      objective: task.objective,
      dependsOn: task.dependsOn,
      verificationCommand: 'npm test', // Default for issues
      successCriteria: 'Issue fix is verified by tests',
      files: [],
      dependencies: [],
    }));

    const paths = getProjectPaths('.');
    const issuePaths = { ...paths, plansDir: planDir };
    writeChunkFiles(issuePaths, chunkDefs);

    const realGraphBuilder = new ChunkFileGraphBuilder(planDir);

    // Create issue-specific deps for BeastLoop
    const issueDeps: BeastLoopDeps = {
      ...fullDeps,
      logger: logger ?? fullDeps.logger,
      graphBuilder: realGraphBuilder,
      refreshPlanTasks: async () => (await realGraphBuilder.build({ goal: 'refresh' })).tasks,
    };

    const finalCheckpoint = issueCheckpoint ?? fullDeps.checkpoint;
    if (finalCheckpoint) {
      Object.assign(issueDeps, { checkpoint: finalCheckpoint });
    }

    const loop = new BeastLoop(issueDeps, {
      maxDurationMs: config.timeoutMs ?? 3_600_000,
    });

    try {
      appendIssueLog(logFile, `Issue #${issue.number} execution started via BeastLoop`);
      
      const result = await loop.run({
        sessionId: `issue-${issue.number}`,
        projectId: repo,
        userInput: `Fix issue #${issue.number}: ${issue.title}\n\n${issue.body}`,
      });

      const tokensUsed = result.tokenSpend.totalTokens;
      const status = result.status === 'completed' ? 'fixed' : 'failed';
      const prUrl = result.prUrl;

      appendIssueLog(logFile, `Issue #${issue.number} execution finished with status ${status}`);

      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status,
        tokensUsed,
        prUrl,
      };
    } catch (err) {
      appendIssueLog(logFile, `Issue #${issue.number} failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        issueNumber: issue.number,
        issueTitle: issue.title,
        status: 'failed',
        tokensUsed: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
