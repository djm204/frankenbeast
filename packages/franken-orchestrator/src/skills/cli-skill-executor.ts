import { execFileSync } from 'node:child_process';
import type { MartinLoopConfig, MartinLoopResult, IterationResult, CliSkillConfig, MergeResult } from './cli-types.js';
import type { SkillInput, SkillResult, ICheckpointStore, ILogger } from '../deps.js';
import type { MartinLoop } from './martin-loop.js';
import type { GitBranchIsolator } from './git-branch-isolator.js';
import type { FileChunkSessionStore } from '../session/chunk-session-store.js';
import { isoNow } from '@franken/types';

// ── Number formatting ──

function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Iteration progress display ──

export function formatIterationProgress(opts: {
  chunkId: string;
  iteration: number;
  maxIterations: number;
  durationMs?: number;
  tokensEstimated?: number;
}): string {
  const parts = [
    `[martin] Iteration ${opts.iteration}/${opts.maxIterations}`,
    `chunk: ${opts.chunkId}`,
  ];
  if (opts.durationMs !== undefined) {
    parts.push(`${Math.round(opts.durationMs / 1000)}s elapsed`);
  }
  if (opts.tokensEstimated !== undefined) {
    parts.push(`~${formatNumber(opts.tokensEstimated)} tokens`);
  }
  return parts.join(' | ');
}

export function writeProgress(
  line: string,
  opts: { final: boolean; isTTY?: boolean; write?: (s: string) => void },
): void {
  const write = opts.write ?? process.stdout.write.bind(process.stdout);
  const tty = opts.isTTY ?? process.stdout.isTTY ?? false;
  if (tty) {
    write(`\r\x1b[K${line}${opts.final ? '\n' : ''}`);
  } else {
    write(`${line}\n`);
  }
}

// ── Observer interfaces (no direct @franken/observer import) ──

export interface Span {
  readonly id: string;
}

export interface Trace {
  readonly id: string;
}

export interface TokenTotals {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface TokenRecord {
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model?: string;
}

export interface TokenCounter {
  grandTotal(): TokenTotals;
  allModels(): string[];
  totalsFor(model: string): TokenTotals;
}

export interface CostCalculator {
  totalCost(entries: TokenRecord[]): number;
}

export interface CircuitBreakerResult {
  readonly tripped: boolean;
  readonly limitUsd: number;
  readonly spendUsd: number;
}

export interface CircuitBreaker {
  check(spendUsd: number): CircuitBreakerResult;
}

export interface ContextWindowUsage {
  readonly usedTokens: number;
  readonly maxTokens: number;
  readonly usageRatio: number;
  readonly threshold: number;
  readonly shouldCompact: boolean;
}

export interface LoopDetector {
  check(spanName: string): { detected: boolean };
}

export interface ObserverDeps {
  readonly trace: Trace;
  readonly counter: TokenCounter;
  readonly costCalc: CostCalculator;
  readonly breaker: CircuitBreaker;
  readonly loopDetector: LoopDetector;
  estimateContextWindow(input: {
    renderedPrompt: string;
    provider: string;
    maxTokens: number;
    threshold?: number;
  }): ContextWindowUsage;
  startSpan(trace: Trace, opts: { name: string; parentSpanId?: string }): Span;
  endSpan(span: Span, opts?: { status?: string; errorMessage?: string }, loopDetector?: LoopDetector): void;
  recordTokenUsage(span: Span, usage: TokenUsage, counter?: TokenCounter): void;
  setMetadata(span: Span, data: Record<string, unknown>): void;
  recordReplay?(record: {
    kind: 'tool.call' | 'tool.result';
    runId: string;
    toolName: string;
    content: string;
  }): void;
}

// ── Budget error ──

export class BudgetExceededError extends Error {
  readonly spent: number;
  readonly limit: number;

  constructor(spent: number, limit: number) {
    super(`Budget exceeded: $${spent.toFixed(2)} / $${limit.toFixed(2)}`);
    this.name = 'BudgetExceededError';
    this.spent = spent;
    this.limit = limit;
  }
}

function serializeSkillInputForReplay(input: SkillInput): Record<string, unknown> {
  return {
    ...input,
    dependencyOutputs: Array.from(input.dependencyOutputs.entries()),
  };
}

function safeReplayJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ replaySerializationError: detail });
  }
}

// ── CliSkillExecutor ──

type CommitMessageFn = (diffStat: string, objective: string) => Promise<string | null>;
const BUDGET_POLL_INTERVAL_MS = 100;

type VerifyCommandSpec = {
  readonly command: string;
  readonly args: readonly string[];
};


type BudgetAbortWiring = {
  readonly controller: AbortController;
  readonly abortForBudget: (result: CircuitBreakerResult) => void;
  readonly cleanup: () => void;
  readonly getResult: () => CircuitBreakerResult | undefined;
};

type StaleMateState = {
  lastSignature: string;
  stalledIterations: number;
};

type BuildMartinConfigOptions = {
  readonly chunkId: string;
  readonly config: Partial<CliSkillConfig>;
  readonly input: SkillInput;
  readonly taskId: string | undefined;
  readonly defaultPromiseTag: string;
  readonly executionStage: string;
  readonly budgetWiring: BudgetAbortWiring;
  readonly checkpoint: ICheckpointStore | undefined;
  readonly chunkSpan: Span;
  readonly staleMateState: StaleMateState;
};

const ALLOWED_VERIFY_COMMANDS = new Map<string, VerifyCommandSpec>([
  ['npx tsc --noEmit', { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['tsc', '--noEmit'] }],
  ['npm run typecheck', { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'typecheck'] }],
  ['npm run build', { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'build'] }],
  ['npm run lint', { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'lint'] }],
  ['npm test', { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['test'] }],
  ['npm run test', { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'test'] }],
]);

/**
 * Verification commands intentionally use a small exact whitelist and execFileSync.
 * The verifyCommand option can come from caller-controlled configuration, so never
 * pass it to a shell or parse arbitrary command text.
 */
function normalizeVerifyCommand(verifyCommand: string): VerifyCommandSpec {
  const normalized = verifyCommand.trim().replace(/\s+/g, ' ');
  const spec = ALLOWED_VERIFY_COMMANDS.get(normalized);
  if (!spec) {
    throw new Error(`Unsafe verifyCommand rejected: ${verifyCommand}`);
  }
  return spec;
}

function runVerifyCommand(verifyCommand: string, cwd: string): void {
  const spec = normalizeVerifyCommand(verifyCommand);
  execFileSync(spec.command, [...spec.args], {
    encoding: 'utf-8',
    cwd,
    stdio: 'pipe',
    // Windows requires cmd.exe to launch npm/npx .cmd shims. This remains safe
    // because verifyCommand is matched against exact hard-coded commands above;
    // caller-provided command text is never passed through the shell.
    shell: process.platform === 'win32',
  });
}

type DefaultMartinConfig = Pick<MartinLoopConfig, 'provider'> & Partial<Pick<
  MartinLoopConfig,
  'model' | 'command' | 'providerCommands' | 'providers' | 'planName' | 'sessionStore' | 'snapshotStore' | 'renderer' | 'compactor' | 'contextUsage'
>>;

export class CliSkillExecutor {
  private readonly martin: MartinLoop;
  private readonly git: GitBranchIsolator;
  private readonly observer: ObserverDeps;
  private readonly verifyCommand?: string | undefined;
  private readonly commitMessageFn?: CommitMessageFn | undefined;
  private readonly logger?: ILogger | undefined;
  private readonly defaultMartinConfig: DefaultMartinConfig;

  constructor(
    martin: MartinLoop,
    git: GitBranchIsolator,
    observer: ObserverDeps,
    verifyCommand?: string,
    commitMessageFn?: CommitMessageFn,
    logger?: ILogger,
    defaultMartinConfig?: DefaultMartinConfig,
  ) {
    this.martin = martin;
    this.git = git;
    this.observer = observer;
    this.verifyCommand = verifyCommand;
    this.commitMessageFn = commitMessageFn;
    this.logger = logger;
    this.defaultMartinConfig = defaultMartinConfig ?? { provider: 'claude', command: 'claude' };
  }

  async recoverDirtyFiles(
    taskId: string,
    stage: string,
    checkpoint: ICheckpointStore,
    logger?: ILogger,
  ): Promise<'clean' | 'committed' | 'reset'> {
    const status = this.git.getStatus();
    if (status.length === 0) return 'clean';
    const chunkId = this.extractChunkId(taskId);

    if (this.verifyCommand) {
      try {
        runVerifyCommand(this.verifyCommand, this.git.getWorkingDir());
      } catch {
        // Verification failed — reset to last known good commit
        const lastHash = checkpoint.lastCommit(taskId, stage);
        if (lastHash) {
          this.git.resetHard(lastHash);
          this.recordSessionCommit(taskId, lastHash);
          logger?.warn('Recovery: reset to last good commit', { taskId, commitHash: lastHash }, 'git');
        }
        return 'reset';
      }
    }

    // Verification passed (or no verify command) — auto-commit dirty files
    this.git.autoCommit(chunkId, 'recovery', 0);
    const commitHash = this.git.getCurrentHead();
    checkpoint.recordCommit(taskId, stage, -1, commitHash);
    this.recordSessionCommit(taskId, commitHash);
    logger?.info('Recovery: auto-committed dirty files', { taskId }, 'git');
    return 'committed';
  }

  async execute(skillId: string, input: SkillInput, config: Partial<CliSkillConfig>, checkpoint?: ICheckpointStore, taskId?: string): Promise<SkillResult> {
    if (!skillId || skillId.trim().length === 0) {
      throw new Error('skillId must not be empty');
    }

    const chunkId = this.extractChunkId(skillId);
    const isImpl = taskId ? !this.isHardenTaskId(taskId) : true;
    const executionStage = isImpl ? 'impl' : 'harden';
    const defaultPromiseTag = isImpl ? `IMPL_${chunkId}_DONE` : `HARDEN_${chunkId}_DONE`;
    const budgetWiring = this.createBudgetAbortWiring(config.martin?.abortSignal);

    this.observer.recordReplay?.({
      kind: 'tool.call',
      runId: input.sessionId,
      toolName: skillId,
      content: safeReplayJson({ skillId, input: serializeSkillInputForReplay(input), taskId }),
    });
    const chunkSpan = this.observer.startSpan(this.observer.trace, { name: `cli:${chunkId}` });

    // Snapshot pre-chunk tokens for diff
    const preTokens = this.observer.counter.grandTotal();

    // Pre-loop budget check (before each iteration — including the first)
    const preCost = this.computeCurrentCost();
    const preCheck = this.observer.breaker.check(preCost);
    if (preCheck.tripped) {
      budgetWiring.cleanup();
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: 'budget-exceeded' });
      return {
        output: `Budget exceeded: $${preCheck.spendUsd.toFixed(2)} / $${preCheck.limitUsd.toFixed(2)}`,
        tokensUsed: 0,
      };
    }

    // Git isolation
    try {
      this.git.isolate(chunkId);
    } catch (err) {
      budgetWiring.cleanup();
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: String(err) });
      throw new Error(
        `Git isolation failed for chunk "${chunkId}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const preMartinStatus = this.git.getStatus();
    const preMartinTrackedChanges = this.trackedChangesFromStatus(preMartinStatus);
    if (preMartinTrackedChanges.length > 0) {
      budgetWiring.cleanup();
      const errorMessage = 'git worktree has pre-existing tracked changes after isolation; refusing budget-managed execution';
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage });
      throw new Error(`${errorMessage}: ${preMartinTrackedChanges.join(', ')}`);
    }
    const preMartinUntrackedFiles = this.untrackedFilesFromStatus(preMartinStatus);

    const staleMateState: StaleMateState = { lastSignature: '', stalledIterations: 0 };
    const wrappedConfig = this.buildMartinConfig({
      chunkId,
      config,
      input,
      taskId,
      defaultPromiseTag,
      executionStage,
      budgetWiring,
      checkpoint,
      chunkSpan,
      staleMateState,
    });

    // Run Martin loop
    let martinResult: MartinLoopResult;
    const budgetPoll = setInterval(() => {
      const currentCost = this.computeCurrentCost();
      const budgetResult = this.observer.breaker.check(currentCost);
      if (budgetResult.tripped) {
        budgetWiring.abortForBudget(budgetResult);
      }
    }, BUDGET_POLL_INTERVAL_MS);
    budgetPoll.unref?.();

    try {
      martinResult = await this.martin.run(wrappedConfig);
    } catch (err) {
      const budgetError = err instanceof BudgetExceededError
        ? err
        : budgetWiring.getResult()
          ? new BudgetExceededError(budgetWiring.getResult()!.spendUsd, budgetWiring.getResult()!.limitUsd)
          : undefined;

      if (budgetError) {
        this.resetBudgetAbortedWorktree(preMartinUntrackedFiles);
        this.observer.setMetadata(chunkSpan, {
          budgetExceeded: true,
          spent: budgetError.spent,
          limit: budgetError.limit,
        });
        this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: 'budget-exceeded' });
        throw budgetError;
      }
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: String(err) });
      throw new Error(
        `MartinLoop failed for chunk "${chunkId}": ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearInterval(budgetPoll);
      budgetWiring.cleanup();
    }

    const budgetAbortResult = budgetWiring.getResult();
    if (budgetAbortResult) {
      this.resetBudgetAbortedWorktree(preMartinUntrackedFiles);
      this.observer.setMetadata(chunkSpan, {
        budgetExceeded: true,
        spent: budgetAbortResult.spendUsd,
        limit: budgetAbortResult.limitUsd,
      });
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: 'budget-exceeded' });
      throw new BudgetExceededError(budgetAbortResult.spendUsd, budgetAbortResult.limitUsd);
    }

    const postMartinTokens = this.observer.counter.grandTotal();
    const postMartinTokensUsed = postMartinTokens.totalTokens - preTokens.totalTokens;
    if (!martinResult.completed) {
      const finalBudgetResult = this.observer.breaker.check(this.computeCurrentCost());
      if (finalBudgetResult.tripped) {
        this.resetBudgetAbortedWorktree(preMartinUntrackedFiles);
        this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: 'budget-exceeded' });
        throw new BudgetExceededError(finalBudgetResult.spendUsd, finalBudgetResult.limitUsd);
      }

      const emittedTagsMsg = martinResult.emittedPromiseTags && martinResult.emittedPromiseTags.length > 0
        ? `; emitted tags: ${martinResult.emittedPromiseTags.join(', ')}`
        : '';
      const errorMsg =
        `MartinLoop did not complete for chunk "${chunkId}" after ${martinResult.iterations} iterations `
        + `(no matching promise tag detected${emittedTagsMsg})`;
      this.logger?.error('CliSkillExecutor: chunk failed — promise not detected', {
        chunkId,
        iterations: martinResult.iterations,
        tokensUsed: postMartinTokensUsed,
        ...(martinResult.emittedPromiseTags && martinResult.emittedPromiseTags.length > 0
          ? { emittedPromiseTags: martinResult.emittedPromiseTags }
          : {}),
      });
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: errorMsg });
      throw new Error(errorMsg);
    }

    // Generate commit message for squash merge (if available)
    let commitMessage: string | undefined;
    if (this.commitMessageFn) {
      try {
        const diffStat = this.git.getDiffStat(chunkId);
        const msg = await this.commitMessageFn(diffStat, input.objective);
        if (msg) commitMessage = msg;
      } catch {
        // Silently fall back to no message — never block the pipeline
      }
    }

    // Git merge
    let mergeResult: MergeResult;
    try {
      mergeResult = commitMessage
        ? this.git.merge(chunkId, commitMessage)
        : this.git.merge(chunkId);
    } catch (err) {
      // Merge threw (unexpected error) — still return SkillResult with output
      this.observer.setMetadata(chunkSpan, {
        mergeError: String(err),
      });
      this.observer.endSpan(chunkSpan, {
        status: 'error',
        errorMessage: `merge-failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      const postTokens = this.observer.counter.grandTotal();
      return {
        output: martinResult.output,
        tokensUsed: postTokens.totalTokens - preTokens.totalTokens,
      };
    }

    // Merge conflict detected — hand to LLM for resolution
    if (!mergeResult.merged && mergeResult.conflicted && mergeResult.conflictFiles?.length) {
      mergeResult = await this.attemptConflictResolution(
        chunkId, mergeResult, commitMessage, wrappedConfig, chunkSpan,
      );
    }

    const postTokens = this.observer.counter.grandTotal();
    const chunkTokensUsed = postTokens.totalTokens - preTokens.totalTokens;
    this.observer.setMetadata(chunkSpan, {
      iterations: martinResult.iterations,
      completed: martinResult.completed,
      merged: mergeResult.merged,
      commits: mergeResult.commits,
    });

    this.observer.endSpan(chunkSpan, { status: 'completed' });
    this.observer.recordReplay?.({
      kind: 'tool.result',
      runId: input.sessionId,
      toolName: skillId,
      content: JSON.stringify({ output: martinResult.output, tokensUsed: chunkTokensUsed, iterations: martinResult.iterations }),
    });
    return {
      output: martinResult.output,
      tokensUsed: chunkTokensUsed,
    };
  }


  private createBudgetAbortWiring(upstreamAbortSignal?: AbortSignal): BudgetAbortWiring {
    const controller = new AbortController();
    let budgetAbortResult: CircuitBreakerResult | undefined;
    let upstreamAbortHandler: (() => void) | undefined;

    const abortForBudget = (result: CircuitBreakerResult): void => {
      budgetAbortResult = result;
      if (!controller.signal.aborted) {
        controller.abort(new BudgetExceededError(result.spendUsd, result.limitUsd));
      }
    };

    const cleanup = (): void => {
      if (upstreamAbortSignal && upstreamAbortHandler) {
        upstreamAbortSignal.removeEventListener('abort', upstreamAbortHandler);
        upstreamAbortHandler = undefined;
      }
    };

    if (upstreamAbortSignal?.aborted) {
      controller.abort(upstreamAbortSignal.reason);
    } else if (upstreamAbortSignal) {
      upstreamAbortHandler = () => {
        controller.abort(upstreamAbortSignal.reason);
      };
      upstreamAbortSignal.addEventListener('abort', upstreamAbortHandler, { once: true });
    }

    return {
      controller,
      abortForBudget,
      cleanup,
      getResult: () => budgetAbortResult,
    };
  }

  private buildMartinConfig(options: BuildMartinConfigOptions): MartinLoopConfig {
    const {
      chunkId,
      config,
      input,
      taskId,
      defaultPromiseTag,
      executionStage,
      budgetWiring,
      checkpoint,
      chunkSpan,
      staleMateState,
    } = options;
    const martinDefaults: MartinLoopConfig = {
      prompt: input.objective,
      promiseTag: defaultPromiseTag,
      maxIterations: 10,
      maxTurns: 25,
      timeoutMs: 600_000,
      workingDir: this.git.getWorkingDir(),
      taskId,
      chunkId,
      ...this.defaultMartinConfig,
    };

    const wrappedConfig: MartinLoopConfig = {
      ...martinDefaults,
      ...config.martin,
      abortSignal: budgetWiring.controller.signal,
      onRateLimit: (provider: string) => {
        this.logger?.warn('MartinLoop: provider rate limited', { chunkId, provider }, 'martin');
        return config.martin?.onRateLimit?.(provider);
      },
      onProviderAttempt: (provider: string, iteration: number, renderedPrompt?: string) => {
        const estimatedSpend = this.computeCurrentCost() + this.estimateUpcomingIterationCost(wrappedConfig, provider, renderedPrompt);
        const estimatedBudgetResult = this.observer.breaker.check(estimatedSpend);
        if (estimatedBudgetResult.tripped) {
          budgetWiring.abortForBudget(estimatedBudgetResult);
          throw new BudgetExceededError(estimatedBudgetResult.spendUsd, estimatedBudgetResult.limitUsd);
        }

        this.logger?.info('MartinLoop: provider attempt', { chunkId, provider, iteration }, 'martin');
        writeProgress(
          formatIterationProgress({ chunkId, iteration, maxIterations: wrappedConfig.maxIterations }),
          { final: false },
        );
        config.martin?.onProviderAttempt?.(provider, iteration, renderedPrompt);
      },
      onProviderSwitch: (fromProvider: string, toProvider: string, reason: 'rate-limit' | 'post-sleep-reset' | 'spawn-error') => {
        this.logger?.warn('MartinLoop: provider switch', { chunkId, fromProvider, toProvider, reason }, 'martin');
        config.martin?.onProviderSwitch?.(fromProvider, toProvider, reason);
      },
      onSpawnError: (provider: string, error: string) => {
        this.logger?.error('MartinLoop: provider spawn error', { chunkId, provider, error }, 'martin');
        const currentCost = this.computeCurrentCost();
        const budgetResult = this.observer.breaker.check(currentCost);
        if (budgetResult.tripped) {
          budgetWiring.abortForBudget(budgetResult);
        }
        config.martin?.onSpawnError?.(provider, error);
      },
      onProviderTimeout: (provider: string, timeoutMs: number) => {
        this.logger?.warn('MartinLoop: provider iteration timeout', { chunkId, provider, timeoutMs }, 'martin');
        config.martin?.onProviderTimeout?.(provider, timeoutMs);
      },
      onSleep: (durationMs: number, source: string) => {
        this.logger?.warn('MartinLoop: sleeping for rate limit reset', { chunkId, durationMs, source }, 'martin');
        config.martin?.onSleep?.(durationMs, source);
      },
      onIteration: (iteration: number, result: IterationResult) => {
        this.recordMartinIteration({
          chunkId,
          iteration,
          result,
          wrappedConfig,
          config,
          executionStage,
          checkpoint,
          taskId,
          chunkSpan,
          staleMateState,
        });
      },
    };

    return wrappedConfig;
  }

  private recordMartinIteration(options: {
    readonly chunkId: string;
    readonly iteration: number;
    readonly result: IterationResult;
    readonly wrappedConfig: MartinLoopConfig;
    readonly config: Partial<CliSkillConfig>;
    readonly executionStage: string;
    readonly checkpoint: ICheckpointStore | undefined;
    readonly taskId: string | undefined;
    readonly chunkSpan: Span;
    readonly staleMateState: StaleMateState;
  }): void {
    const { chunkId, iteration, result, wrappedConfig, config, executionStage, checkpoint, taskId, chunkSpan, staleMateState } = options;
    writeProgress(
      formatIterationProgress({
        chunkId,
        iteration,
        maxIterations: wrappedConfig.maxIterations,
        durationMs: result.durationMs,
        tokensEstimated: result.tokensEstimated,
      }),
      { final: true },
    );
    this.logger?.info('MartinLoop: iteration complete', {
      chunkId,
      iteration,
      exitCode: result.exitCode,
      rateLimited: result.rateLimited,
      promiseDetected: result.promiseDetected,
      ...(result.emittedPromiseTags && result.emittedPromiseTags.length > 0
        ? { emittedPromiseTags: result.emittedPromiseTags }
        : {}),
      sleepMs: result.sleepMs,
    }, 'martin');
    if (result.stderr) {
      this.logger?.debug(`MartinLoop: iter ${iteration} stderr [${chunkId}]:\n${result.stderr}`, undefined, 'martin');
    }
    if (result.stdout) {
      this.logger?.debug(`MartinLoop: iter ${iteration} stdout [${chunkId}] (${result.stdout.length} chars):\n${result.stdout.slice(0, 4000)}`, undefined, 'martin');
    }
    if (result.exitCode !== 0 && !result.rateLimited) {
      this.logger?.error(
        `MartinLoop: iter ${iteration} failed (exit ${result.exitCode})`,
        result.failure ?? {
          chunkId,
          exitCode: result.exitCode,
          stderr: result.stderr?.trim().split('\n').slice(-5).join('\n') ?? '',
        },
        'martin',
      );
    }

    const iterSpan = this.observer.startSpan(this.observer.trace, {
      name: `cli:${chunkId}:iter-${iteration}`,
      parentSpanId: chunkSpan.id,
    });
    this.observer.recordTokenUsage(
      iterSpan,
      {
        model: result.provider,
        promptTokens: Math.ceil((config.martin?.prompt?.length ?? 0) / 4),
        completionTokens: result.tokensEstimated,
      },
      this.observer.counter,
    );
    this.observer.endSpan(iterSpan, { status: 'completed' }, this.observer.loopDetector);

    const committed = this.git.autoCommit(chunkId, executionStage, iteration);
    if (committed && checkpoint && taskId) {
      const commitHash = this.git.getCurrentHead();
      checkpoint.recordCommit(taskId, executionStage, iteration, commitHash);
    }

    this.checkStaleMate({ chunkId, result, wrappedConfig, committed, staleMateState });

    const currentCost = this.computeCurrentCost();
    const budgetResult = this.observer.breaker.check(currentCost);
    if (budgetResult.tripped) {
      throw new BudgetExceededError(currentCost, budgetResult.limitUsd);
    }

    config.martin?.onIteration?.(iteration, result);
  }

  private checkStaleMate(options: {
    readonly chunkId: string;
    readonly result: IterationResult;
    readonly wrappedConfig: MartinLoopConfig;
    readonly committed: boolean;
    readonly staleMateState: StaleMateState;
  }): void {
    const { chunkId, result, wrappedConfig, committed, staleMateState } = options;
    if (wrappedConfig.staleMateLimit === undefined || result.rateLimited) return;

    const signature = normalizeStaleMateSignature(result.stdout);
    const outputChanged = signature.length > 0 && signature !== staleMateState.lastSignature;
    if (committed || outputChanged || result.promiseDetected) {
      staleMateState.stalledIterations = 0;
    } else {
      staleMateState.stalledIterations++;
    }
    staleMateState.lastSignature = signature;

    if (staleMateState.stalledIterations >= wrappedConfig.staleMateLimit) {
      throw new Error(
        `MartinLoop stale mate for chunk "${chunkId}" after ${staleMateState.stalledIterations} non-progress iterations`,
      );
    }
  }

  private async attemptConflictResolution(
    chunkId: string,
    mergeResult: MergeResult,
    commitMessage: string | undefined,
    parentConfig: MartinLoopConfig,
    chunkSpan: Span,
  ): Promise<MergeResult> {
    const conflictFiles = mergeResult.conflictFiles ?? [];
    const conflictDiff = this.git.getConflictDiff();

    this.logger?.warn('Merge conflict detected — spawning LLM resolution', {
      chunkId,
      conflictFiles,
    }, 'git');

    const resolvePrompt = [
      `You have a git merge conflict to resolve. The following files have conflict markers (<<<<<<< ======= >>>>>>>):`,
      conflictFiles.join(', '),
      '',
      'Edit each conflicted file to resolve the conflicts by choosing the correct content. Remove all conflict markers.',
      '',
      `Conflict diff:\n${conflictDiff}`,
    ].join('\n');

    const resolveConfig: MartinLoopConfig = {
      prompt: resolvePrompt,
      promiseTag: `RESOLVE_${chunkId}_DONE`,
      maxIterations: 3,
      maxTurns: 10,
      provider: parentConfig.provider,
      command: parentConfig.command,
      timeoutMs: 120_000,
      workingDir: this.git.getWorkingDir(),
    };

    try {
      await this.martin.run(resolveConfig);
    } catch {
      // Resolution failed — abort and move on
      this.logger?.error('Conflict resolution failed', { chunkId }, 'git');
      this.git.abortMerge();
      this.observer.setMetadata(chunkSpan, { conflictResolution: 'failed' });
      return mergeResult;
    }

    // Check if conflicts were actually resolved
    const remaining = this.git.getConflictedFiles();
    if (remaining.length === 0) {
      const msg = commitMessage ?? `auto: merge ${chunkId} (conflict resolved)`;
      this.git.completeMerge(msg);
      this.logger?.info('Merge conflict resolved by LLM', { chunkId }, 'git');
      this.observer.setMetadata(chunkSpan, { conflictResolution: 'resolved' });
      return { merged: true, commits: mergeResult.commits };
    }

    // Still conflicted — abort
    this.logger?.error('LLM did not resolve all conflicts', { chunkId, remaining }, 'git');
    this.git.abortMerge();
    this.observer.setMetadata(chunkSpan, { conflictResolution: 'failed', remainingFiles: remaining });
    return mergeResult;
  }

  private isHardenTaskId(taskId: string): boolean {
    return taskId.startsWith('harden:') || taskId.startsWith('fix-harden:');
  }

  private extractChunkId(skillId: string): string {
    if (skillId.startsWith('fix-harden:')) {
      return skillId.slice('fix-harden:'.length).replace(/-attempt-\d+$/u, '');
    }
    if (skillId.startsWith('fix-impl:')) {
      return skillId.slice('fix-impl:'.length).replace(/-attempt-\d+$/u, '');
    }

    const parts = skillId.split(':').filter(Boolean);
    if (parts.length === 0) return skillId;

    // Handle both canonical skill IDs (`cli:<chunkId>`) and accidental task IDs
    // (`impl:<chunkId>`, `harden:<chunkId>`, `cli:impl:<chunkId>`).
    if (parts[0] === 'cli' && parts.length >= 2) {
      if ((parts[1] === 'impl' || parts[1] === 'harden') && parts.length >= 3) {
        return parts.slice(2).join(':');
      }
      return parts.slice(1).join(':');
    }
    if ((parts[0] === 'impl' || parts[0] === 'harden') && parts.length >= 2) {
      return parts.slice(1).join(':');
    }

    return parts.length >= 2 ? parts.slice(1).join(':') : parts[0]!;
  }

  private computeCurrentCost(): number {
    const entries = this.observer.counter.allModels().map((m) => {
      const t = this.observer.counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    return this.observer.costCalc.totalCost(entries);
  }

  private estimateUpcomingIterationCost(config: MartinLoopConfig, provider = config.provider, prompt = config.prompt): number {
    return this.observer.costCalc.totalCost([{
      model: provider,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.max(config.maxTurns, 1) * 1_000,
    }]);
  }

  private resetBudgetAbortedWorktree(preExistingUntrackedFiles: readonly string[] = []): void {
    const status = this.git.getStatus();
    if (status.length === 0) return;
    this.git.resetHard(this.git.getCurrentHead());
    const preExisting = new Set(preExistingUntrackedFiles);
    const newUntracked = this.untrackedFilesFromStatus(status).filter(file => !preExisting.has(file));
    if (newUntracked.length > 0) {
      this.git.cleanUntracked(newUntracked);
    }
  }

  private untrackedFilesFromStatus(status: string): string[] {
    return status
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('?? '))
      .map(line => line.slice(3).trim())
      .filter(file => file.length > 0);
  }

  private trackedChangesFromStatus(status: string): string[] {
    return status
      .split('\n')
      .map(line => line.trimEnd())
      .filter(line => line.length > 0 && !line.startsWith('?? '))
      .map(line => line.slice(3).trim())
      .filter(file => file.length > 0);
  }

  private recordSessionCommit(taskId: string, commitHash: string): void {
    const sessionStore = this.defaultMartinConfig.sessionStore as FileChunkSessionStore | undefined;
    const planName = this.defaultMartinConfig.planName;
    if (!sessionStore || !planName) {
      return;
    }

    const chunkId = this.extractChunkId(taskId);
    const session = sessionStore.load(planName, chunkId, taskId);
    if (!session) {
      return;
    }

    sessionStore.save({
      ...session,
      lastKnownGoodCommit: commitHash,
      updatedAt: isoNow(),
    });
  }
}

function normalizeStaleMateSignature(stdout: string): string {
  return stdout.replace(/\s+/g, ' ').trim();
}
