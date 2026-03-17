import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLoop } from '../beast-loop.js';
import { ChunkFileGraphBuilder } from '../planning/chunk-file-graph-builder.js';
import { LlmGraphBuilder } from '../planning/llm-graph-builder.js';
import { PlanContextGatherer } from '../planning/plan-context-gatherer.js';
import { ChunkFileWriter } from '../planning/chunk-file-writer.js';
import { InterviewLoop } from '../planning/interview-loop.js';
import { AdapterLlmClient } from '../adapters/adapter-llm-client.js';
import { ProgressLlmClient } from '../adapters/progress-llm-client.js';
import { ANSI, budgetBar, statusBadge, logHeader } from '../logging/beast-logger.js';
import { createStreamProgressWithSpinner } from '../adapters/stream-progress.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import type { BeastResult } from '../types.js';
import type { ProjectPaths } from './project-root.js';
import type { ReviewIO } from '../issues/issue-review.js';
import type { IssueFetchOptions, IssueOutcome } from '../issues/types.js';
import { createCliDeps, type CliDepOptions } from './dep-factory.js';
import { loadRunConfigFromEnv } from './run-config-loader.js';
import { extractDesignSummary, formatDesignCard } from './design-summary.js';
import { reviewLoop } from './review-loop.js';
import { isNoOpDesign } from './noop-detector.js';
import { writeDesignDoc, readDesignDoc } from './file-writer.js';
import { resolveUpstreamRepo } from './upstream-repo.js';
import type { ChunkDefinition } from './file-writer.js';
import { CachedCliLlmClient } from '../cache/cached-cli-llm-client.js';

export type SessionPhase = 'interview' | 'plan' | 'execute';

export interface SessionConfig {
  paths: ProjectPaths;
  baseBranch: string;
  budget: number;
  provider: string;
  providers?: string[] | undefined;
  providersConfig?: Record<string, { command?: string | undefined; model?: string | undefined; extraArgs?: string[] | undefined }> | undefined;
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
  io: InterviewIO;
  /** Entry phase — determined by CLI args */
  entryPhase: SessionPhase;
  /** Exit after this phase (subcommand mode) or run to completion (default mode) */
  exitAfter?: SessionPhase;
  /** Pre-existing design doc path (--design-doc flag) */
  designDocPath?: string;
  /** Pre-existing plan dir (--plan-dir flag) */
  planDirOverride?: string;
  /** Maximum plan-critique iterations before escalation */
  maxCritiqueIterations?: number | undefined;
  /** Maximum execution time in milliseconds */
  maxDurationMs?: number | undefined;
  /** Whether to emit observability spans */
  enableTracing?: boolean | undefined;
  /** Whether to run a heartbeat pulse after execution */
  enableHeartbeat?: boolean | undefined;
  /** Minimum critique score to pass (0-1) */
  minCritiqueScore?: number | undefined;
  /** Maximum total tokens before budget breaker trips */
  maxTotalTokens?: number | undefined;
  // ── Issue-specific config ──
  issueLabel?: string[] | undefined;
  issueMilestone?: string | undefined;
  issueSearch?: string | undefined;
  issueAssignee?: string | undefined;
  issueLimit?: number | undefined;
  issueRepo?: string | undefined;
  targetUpstream?: boolean | undefined;
  dryRun?: boolean | undefined;
}

export class Session {
  constructor(private readonly config: SessionConfig) {}

  async start(): Promise<BeastResult | undefined> {
    const { entryPhase, exitAfter } = this.config;
    const phases: SessionPhase[] = ['interview', 'plan', 'execute'];
    const startIdx = phases.indexOf(entryPhase);

    for (let i = startIdx; i < phases.length; i++) {
      const phase = phases[i];

      if (phase === 'interview') {
        const decision = await this.runInterview();
        if (decision === 'exit') return undefined;
        if (exitAfter === 'interview') return undefined;
      }

      if (phase === 'plan') {
        await this.runPlan();
        if (exitAfter === 'plan') return undefined;
      }

      if (phase === 'execute') {
        return this.runExecute();
      }
    }

    return undefined;
  }

  async runIssues(): Promise<void> {
    const { io, budget, baseBranch, noPr, dryRun } = this.config;

    // Adapt InterviewIO to ReviewIO
    const reviewIO: ReviewIO = {
      read: () => io.ask(''),
      write: (text: string) => io.display(text),
    };

    const { deps, logger, issueDeps, finalize } = await createCliDeps({
      ...this.buildDepOptions(),
      issueIO: reviewIO,
      dryRun,
    });

    if (!issueDeps) {
      throw new Error('Issue dependencies not created');
    }

    const { fetcher, triage, review, graphBuilder, runner, executor, git, prCreator, checkpoint, issueRuntime } = issueDeps;

    // Resolve canonical repo for the entire issues pipeline.
    let repo: string;
    if (this.config.targetUpstream) {
      repo = await resolveUpstreamRepo();
    } else if (this.config.issueRepo) {
      repo = this.config.issueRepo;
    } else {
      try {
        repo = await fetcher.inferRepo();
      } catch {
        throw new Error('Could not infer repository. Use --repo <owner/repo> to specify.');
      }
    }

    // Build fetch options from CLI args
    const fetchOptions: IssueFetchOptions = {
      repo,
      label: this.config.issueLabel,
      milestone: this.config.issueMilestone,
      search: this.config.issueSearch,
      assignee: this.config.issueAssignee,
      limit: this.config.issueLimit,
    };

    // Fetch
    logger.info('Fetching issues...', 'issues');
    const issues = await fetcher.fetch(fetchOptions);
    logger.info(`Found ${issues.length} issue(s)`, 'issues');

    // Triage
    logger.info('Triaging issues...', 'issues');
    const triageResults = await triage.triage(issues);

    // Review (HITL)
    const decision = await review.review(issues, triageResults);

    if (decision.action === 'abort') {
      logger.info('Issue processing aborted by user', 'issues');
      await finalize();
      return;
    }

    // Execute approved issues
    logger.info('Executing approved issues...', 'issues');

    const approvedNumbers = new Set(decision.approved.map(t => t.issueNumber));
    const approvedIssues = issues.filter(i => approvedNumbers.has(i.number));

    const outcomes = await runner.run({
      issues: approvedIssues,
      triageResults: decision.approved,
      graphBuilder,
      fullDeps: deps,
      git,
      logger,
      budget,
      repo,
      issueRuntime,
      checkpoint,
    });

    this.displayIssueSummary(outcomes);
    await finalize();
  }

  private async runInterview(): Promise<'continue' | 'exit'> {
    const { paths, io } = this.config;
    const interviewOpts = this.buildDepOptions();
    interviewOpts.adapterWorkingDir = tmpdir();
    const { cliLlmAdapter } = await createCliDeps(interviewOpts);

    const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
    const progressLlm = new ProgressLlmClient(adapterLlm);

    let capturedDesignDoc = '';
    const capturingGraphBuilder = {
      build: async (intent: { goal: string }) => {
        capturedDesignDoc = intent.goal;
        return { tasks: [] };
      },
    };

    const interviewIo: InterviewIO = {
      ask: async (prompt) => {
        if (prompt === 'Approve this design? (yes/no)') {
          return 'yes';
        }
        return io.ask(prompt);
      },
      display: () => {
        // Session owns post-interview design presentation.
      },
    };

    const capturingInterview = new InterviewLoop(progressLlm, interviewIo, capturingGraphBuilder);
    await capturingInterview.build({ goal: 'Gather requirements' });

    const displayDesignCard = (designDoc: string): string => {
      const designPath = writeDesignDoc(paths, designDoc);
      io.display(formatDesignCard({
        ...extractDesignSummary(designDoc),
        filePath: designPath,
      }));
      return designPath;
    };

    displayDesignCard(capturedDesignDoc);

    while (true) {
      const noOp = isNoOpDesign(capturedDesignDoc);
      const header = noOp
        ? 'Analysis complete: no implementation changes needed.'
        : 'Design ready. What next?';

      const choice = await io.ask(
        `${header}\n\n  [c] Continue to planning phase${noOp ? ' anyway' : ''}\n  [r] Revise - give feedback to regenerate\n  [x] Exit\n`,
      );
      const normalized = choice.trim().toLowerCase();

      if (normalized === 'x' || normalized === 'exit') {
        return 'exit';
      }

      if (normalized === 'c' || normalized === 'continue') {
        return 'continue';
      }

      if (normalized === 'r' || normalized === 'revise') {
        const feedback = await io.ask('What would you like to change?');
        const revised = await progressLlm.complete(
          `Revise this design document based on the following feedback:\n\nFeedback: ${feedback}\n\nCurrent document:\n${capturedDesignDoc}`,
        );
        capturedDesignDoc = revised;
        displayDesignCard(revised);
        continue;
      }

      io.display('Please enter c, r, or x.');
    }
  }

  private async runPlan(): Promise<void> {
    const { paths, io, designDocPath } = this.config;
    const depOptions = this.buildDepOptions();
    // Run planning CLI from tmpdir to prevent project-scoped plugins (superpowers, etc.)
    // from loading in the spawned CLI. Plugins poison the session by injecting skill
    // instructions that make the CLI explore the codebase instead of returning JSON.
    depOptions.adapterWorkingDir = tmpdir();
    const progress = createStreamProgressWithSpinner({ label: 'Planning...' });
    depOptions.onStreamLine = progress.onLine;
    const { cliLlmAdapter, logger } = await createCliDeps(depOptions);

    // Load design doc
    let designContent: string;
    if (designDocPath) {
      designContent = readFileSync(designDocPath, 'utf-8');
    } else {
      const stored = readDesignDoc(paths);
      if (!stored) {
        throw new Error(`No design document found at ${paths.designDocFile}. Run "frankenbeast interview" first, or provide --design-doc.`);
      }
      designContent = stored;
    }

    const inferredPlanName = paths.plansDir.split('/').filter(Boolean).pop() ?? 'plans';
    const planName = this.config.planDirOverride
      ? this.config.planDirOverride.split('/').filter(Boolean).pop() ?? 'session'
      : inferredPlanName === 'plans' ? 'session' : inferredPlanName;
    const cachingLlm = new CachedCliLlmClient({
      cacheRootDir: paths.llmCacheDir,
      cliAdapter: cliLlmAdapter,
      projectId: paths.root,
      provider: this.config.provider,
      model: this.config.provider,
      operation: 'plan-build',
      workId: `plan:${planName}`,
      stablePrefix: 'surface:plan',
      workPrefix: `plan:${planName}`,
    });
    const contextGatherer = new PlanContextGatherer(paths.root);
    const llmGraphBuilder = new LlmGraphBuilder(cachingLlm, contextGatherer);
    const chunkWriter = new ChunkFileWriter(paths.plansDir);

    logger.info('Decomposing design into chunks...', 'planner');

    // Build the plan graph — lastChunks preserves the structured LLM output
    try {
      await llmGraphBuilder.build({ goal: designContent });
    } finally {
      progress.stop();
    }

    const chunks = llmGraphBuilder.lastChunks;
    const issues = llmGraphBuilder.lastValidationIssues;
    logger.info(`Planned ${chunks.length} chunk(s)`, 'planner');

    if (issues.length > 0) {
      logger.warn(`${issues.length} validation warning(s) attached to chunks`, 'planner');
    }

    // Write chunk files using ChunkFileWriter
    let chunkPaths = chunkWriter.write(chunks, issues);
    logger.info(`Wrote chunk files to ${paths.plansDir}`, 'planner');

    // Review loop
    await reviewLoop({
      filePaths: chunkPaths,
      artifactLabel: 'Chunk files',
      io,
      onRevise: async (feedback) => {
        await llmGraphBuilder.build({
          goal: `${designContent}\n\nRevision feedback: ${feedback}`,
        });
        chunkPaths = chunkWriter.write(
          llmGraphBuilder.lastChunks,
          llmGraphBuilder.lastValidationIssues,
        );
        return chunkPaths;
      },
    });
  }

  private async runExecute(): Promise<BeastResult> {
    const { paths, planDirOverride, budget } = this.config;
    const chunkDir = planDirOverride ?? paths.plansDir;

    const { deps, logger, finalize } = await createCliDeps(this.buildDepOptions());

    const graphBuilder = new ChunkFileGraphBuilder(chunkDir);
    const refreshPlanTasks = async () => {
      const latest = await graphBuilder.build({ goal: 'refresh chunk graph' });
      return latest.tasks;
    };

    // Wire graph builder and refresh into deps
    const fullDeps = {
      ...deps,
      graphBuilder,
      refreshPlanTasks,
    };

    const projectId = paths.root.split('/').pop() ?? 'unknown';

    // SIGINT handler
    let stopping = false;
    const sigintHandler = async () => {
      if (stopping) process.exit(1);
      stopping = true;
      logger.warn('SIGINT received. Finishing current iteration then stopping...', 'session');
      await finalize();
      process.exit(0);
    };
    process.on('SIGINT', sigintHandler);

    logger.info(`Budget: $${budget} | Provider: ${ANSI.bold}${this.config.provider}${ANSI.reset}`, 'session');

    const result = await new BeastLoop(fullDeps).run({
      projectId,
      userInput: `Process chunks in ${chunkDir}`,
    });

    await finalize();
    this.displaySummary(result);
    return result;
  }

  private extractChunkDefinitions(planGraph: {
    tasks: readonly { id: string; objective: string; requiredSkills: readonly string[]; dependsOn: readonly string[] }[];
  }): ChunkDefinition[] {
    // LlmGraphBuilder creates paired impl:/harden: tasks.
    // Extract unique chunk IDs from impl: tasks.
    const implTasks = planGraph.tasks.filter((t) => t.id.startsWith('impl:'));
    return implTasks.map((t) => {
      const chunkId = t.id.replace('impl:', '');
      return {
        id: chunkId,
        objective: t.objective,
        files: [],
        successCriteria: '',
        verificationCommand: '',
        dependencies: t.dependsOn
          .filter((d) => d.startsWith('harden:'))
          .map((d) => d.replace('harden:', '')),
      };
    });
  }

  private displaySummary(result: BeastResult): void {
    const A = ANSI;
    console.log(logHeader('BUILD SUMMARY'));
    console.log(`  ${A.dim}Duration:${A.reset}  ${(result.durationMs / 1000 / 60).toFixed(1)} min`);
    console.log(`  ${A.dim}Budget:${A.reset}    ${budgetBar(result.tokenSpend.estimatedCostUsd, this.config.budget)}`);
    console.log(`  ${A.dim}Status:${A.reset}    ${statusBadge(result.status === 'completed')}`);
    if (result.taskResults?.length) {
      console.log(`\n  ${A.dim}Chunks:${A.reset}`);
      for (const t of result.taskResults) {
        if (t.status === 'skipped') {
          console.log(`    ${A.dim} SKIP ${A.reset} ${A.dim}${t.taskId}${A.reset}`);
        } else {
          console.log(`    ${statusBadge(t.status === 'success')} ${A.bold}${t.taskId}${A.reset}`);
        }
      }
    }
    const passed = result.taskResults?.filter((t) => t.status === 'success').length ?? 0;
    const skipped = result.taskResults?.filter((t) => t.status === 'skipped').length ?? 0;
    const failed = result.taskResults?.filter((t) => t.status !== 'success' && t.status !== 'skipped').length ?? 0;
    const parts = [`${passed} passed`, `${failed} failed`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    console.log(`\n  ${failed === 0 ? A.green : A.red}${A.bold}Result: ${parts.join(', ')}${A.reset}\n`);
  }

  private displayIssueSummary(outcomes: IssueOutcome[]): void {
    const A = ANSI;
    console.log(logHeader('ISSUE SUMMARY'));

    const TITLE_MAX = 40;
    console.log(
      `  ${'#'.padStart(5)}  ${'Title'.padEnd(TITLE_MAX)}  ${'Status'.padEnd(8)}  PR`,
    );
    console.log(`  ${'-'.repeat(70)}`);

    for (const o of outcomes) {
      const badge =
        o.status === 'fixed'
          ? `${A.green}fixed${A.reset}`
          : o.status === 'skipped'
            ? `${A.dim}skipped${A.reset}`
            : `${A.red}failed${A.reset}`;
      const title =
        o.issueTitle.length > TITLE_MAX
          ? o.issueTitle.slice(0, TITLE_MAX - 3) + '...'
          : o.issueTitle;
      const pr = o.prUrl ?? '-';
      console.log(
        `  ${String(o.issueNumber).padStart(5)}  ${title.padEnd(TITLE_MAX)}  ${badge.padEnd(8)}  ${pr}`,
      );
    }

    const fixed = outcomes.filter((o) => o.status === 'fixed').length;
    const failed = outcomes.filter((o) => o.status === 'failed').length;
    const skipped = outcomes.filter((o) => o.status === 'skipped').length;
    console.log(
      `\n  ${fixed === outcomes.length ? A.green : A.red}${A.bold}Result: ${fixed} fixed, ${failed} failed, ${skipped} skipped${A.reset}\n`,
    );
  }

  private buildDepOptions(): CliDepOptions {
    return {
      paths: this.config.paths,
      baseBranch: this.config.baseBranch,
      budget: this.config.budget,
      provider: this.config.provider,
      providers: this.config.providers,
      providersConfig: this.config.providersConfig,
      noPr: this.config.noPr,
      verbose: this.config.verbose,
      reset: this.config.reset,
      planDirOverride: this.config.planDirOverride,
      runConfig: loadRunConfigFromEnv(),
    };
  }
}
