import { execSync } from 'node:child_process';
import type { MartinLoopConfig, MartinLoopResult, IterationResult, CliSkillConfig, MergeResult } from './cli-types.js';
import type { SkillInput, SkillResult, ICheckpointStore, ILogger } from '../deps.js';
import type { MartinLoop } from './martin-loop.js';
import type { GitBranchIsolator } from './git-branch-isolator.js';
import type { FileChunkSessionStore } from '../session/chunk-session-store.js';

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

// ── Observer interfaces (no direct @frankenbeast/observer import) ──

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

// ── CliSkillExecutor ──

type CommitMessageFn = (diffStat: string, objective: string) => Promise<string | null>;
type DefaultMartinConfig = Pick<MartinLoopConfig, 'provider'> & Partial<Pick<
  MartinLoopConfig,
  'command' | 'providers' | 'planName' | 'sessionStore' | 'snapshotStore' | 'renderer' | 'compactor' | 'contextUsage'
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
        execSync(this.verifyCommand, {
          encoding: 'utf-8',
          cwd: this.git.getWorkingDir(),
          stdio: 'pipe',
        });
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

  async execute(skillId: string, input: SkillInput, config: CliSkillConfig, checkpoint?: ICheckpointStore, taskId?: string): Promise<SkillResult> {
    if (!skillId || skillId.trim().length === 0) {
      throw new Error('skillId must not be empty');
    }

    const chunkId = this.extractChunkId(skillId);
    const chunkSpan = this.observer.startSpan(this.observer.trace, { name: `cli:${chunkId}` });

    // Snapshot pre-chunk tokens for diff
    const preTokens = this.observer.counter.grandTotal();

    // Pre-loop budget check (before each iteration — including the first)
    const preCost = this.computeCurrentCost();
    const preCheck = this.observer.breaker.check(preCost);
    if (preCheck.tripped) {
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
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: String(err) });
      throw new Error(
        `Git isolation failed for chunk "${chunkId}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Build martin config with defaults from input when not explicitly provided
    const isImpl = taskId ? !taskId.startsWith('harden:') : true;
    const executionStage = isImpl ? 'impl' : 'harden';
    const defaultPromiseTag = isImpl ? `IMPL_${chunkId}_DONE` : `HARDEN_${chunkId}_DONE`;
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

    // Wire onIteration for observer integration
    const wrappedConfig: MartinLoopConfig = {
      ...martinDefaults,
      ...config.martin,
      onRateLimit: (provider: string) => {
        this.logger?.warn('MartinLoop: provider rate limited', { chunkId, provider }, 'martin');
        return config.martin?.onRateLimit?.(provider);
      },
      onProviderAttempt: (provider: string, iteration: number) => {
        this.logger?.info('MartinLoop: provider attempt', { chunkId, provider, iteration }, 'martin');
        // Show in-place progress line (overwritten by next update or final summary)
        writeProgress(
          formatIterationProgress({ chunkId, iteration, maxIterations: wrappedConfig.maxIterations }),
          { final: false },
        );
        config.martin?.onProviderAttempt?.(provider, iteration);
      },
      onProviderSwitch: (fromProvider: string, toProvider: string, reason: 'rate-limit' | 'post-sleep-reset') => {
        this.logger?.warn('MartinLoop: provider switch', { chunkId, fromProvider, toProvider, reason }, 'martin');
        config.martin?.onProviderSwitch?.(fromProvider, toProvider, reason);
      },
      onSpawnError: (provider: string, error: string) => {
        this.logger?.error('MartinLoop: provider spawn error', { chunkId, provider, error }, 'martin');
        config.martin?.onSpawnError?.(provider, error);
      },
      onProviderTimeout: (provider: string, timeoutMs: number) => {
        this.logger?.warn('MartinLoop: provider iteration timeout', { chunkId, provider, timeoutMs }, 'martin');
        config.martin?.onProviderTimeout?.(provider, timeoutMs);
      },
      onSleep: (durationMs: number, source: string) => {
        this.logger?.warn('MartinLoop: sleeping for rate limit reset', {
          chunkId,
          durationMs,
          source,
        }, 'martin');
        config.martin?.onSleep?.(durationMs, source);
      },
      onIteration: (iteration: number, result: IterationResult) => {
        // Print final summary line (not overwritten)
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
          sleepMs: result.sleepMs,
        }, 'martin');
        // Full raw output -> build.log only (via debug, always captured)
        // Embed as multi-line text (not JSON) so newlines are preserved in build.log
        if (result.stderr) {
          this.logger?.debug(`MartinLoop: iter ${iteration} stderr [${chunkId}]:\n${result.stderr}`, undefined, 'martin');
        }
        if (result.stdout) {
          this.logger?.debug(`MartinLoop: iter ${iteration} stdout [${chunkId}] (${result.stdout.length} chars):\n${result.stdout.slice(0, 4000)}`, undefined, 'martin');
        }
        // Surface errors on terminal when iteration fails (non-rate-limit)
        if (result.exitCode !== 0 && !result.rateLimited) {
          const stderrExcerpt = result.stderr?.trim().split('\n').slice(-5).join('\n') ?? '';
          const stdoutExcerpt = !stderrExcerpt && result.stdout
            ? result.stdout.trim().split('\n').slice(-5).join('\n')
            : '';
          this.logger?.error(`MartinLoop: iter ${iteration} failed (exit ${result.exitCode})`, {
            chunkId,
            exitCode: result.exitCode,
            ...(stderrExcerpt && { stderr: stderrExcerpt }),
            ...(stdoutExcerpt && { stdout: stdoutExcerpt }),
          }, 'martin');
        }
        // Create iteration span
        const iterSpan = this.observer.startSpan(this.observer.trace, {
          name: `cli:${chunkId}:iter-${iteration}`,
          parentSpanId: chunkSpan.id,
        });

        // Record token usage
        this.observer.recordTokenUsage(
          iterSpan,
          {
            model: result.provider,
            promptTokens: Math.ceil((config.martin?.prompt?.length ?? 0) / 4),
            completionTokens: result.tokensEstimated,
          },
          this.observer.counter,
        );

        // End iteration span
        this.observer.endSpan(iterSpan, { status: 'completed' }, this.observer.loopDetector);

        // Auto-commit + per-commit checkpoint recording
        const committed = this.git.autoCommit(chunkId, executionStage, iteration);
        if (committed && checkpoint && taskId) {
          const commitHash = this.git.getCurrentHead();
          checkpoint.recordCommit(taskId, executionStage, iteration, commitHash);
        }

        if (wrappedConfig.staleMateLimit !== undefined && !result.rateLimited) {
          const signature = normalizeStaleMateSignature(result.stdout);
          const outputChanged = signature.length > 0 && signature !== lastStaleMateSignature;
          if (committed || outputChanged || result.promiseDetected) {
            stalledIterations = 0;
          } else {
            stalledIterations++;
          }
          lastStaleMateSignature = signature;

          if (stalledIterations >= wrappedConfig.staleMateLimit) {
            throw new Error(
              `MartinLoop stale mate for chunk "${chunkId}" after ${stalledIterations} non-progress iterations`,
            );
          }
        }

        // Budget check — stops before NEXT iteration
        const currentCost = this.computeCurrentCost();
        const budgetResult = this.observer.breaker.check(currentCost);
        if (budgetResult.tripped) {
          throw new BudgetExceededError(currentCost, budgetResult.limitUsd);
        }

        // Forward to original callback if provided
        config.martin?.onIteration?.(iteration, result);
      },
    };

    // Run Martin loop
    let martinResult: MartinLoopResult;
    let lastStaleMateSignature = '';
    let stalledIterations = 0;
    try {
      martinResult = await this.martin.run(wrappedConfig);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        const postTokens = this.observer.counter.grandTotal();
        this.observer.setMetadata(chunkSpan, {
          budgetExceeded: true,
          spent: err.spent,
          limit: err.limit,
        });
        this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: 'budget-exceeded' });
        return {
          output: `Budget exceeded: $${err.spent.toFixed(2)} / $${err.limit.toFixed(2)}`,
          tokensUsed: postTokens.totalTokens - preTokens.totalTokens,
        };
      }
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: String(err) });
      throw new Error(
        `MartinLoop failed for chunk "${chunkId}": ${err instanceof Error ? err.message : String(err)}`,
      );
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

    if (!martinResult.completed) {
      const errorMsg = `MartinLoop did not complete for chunk "${chunkId}" after ${martinResult.iterations} iterations (no promise tag detected)`;
      this.logger?.error('CliSkillExecutor: chunk failed — promise not detected', {
        chunkId,
        iterations: martinResult.iterations,
        tokensUsed: chunkTokensUsed,
      });
      this.observer.endSpan(chunkSpan, { status: 'error', errorMessage: errorMsg });
      throw new Error(errorMsg);
    }

    this.observer.endSpan(chunkSpan, { status: 'completed' });
    return {
      output: martinResult.output,
      tokensUsed: chunkTokensUsed,
    };
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

  private extractChunkId(skillId: string): string {
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

  private recordSessionCommit(taskId: string, commitHash: string): void {
    const sessionStore = this.defaultMartinConfig.sessionStore as FileChunkSessionStore | undefined;
    const planName = this.defaultMartinConfig.planName;
    if (!sessionStore || !planName) {
      return;
    }

    const chunkId = this.extractChunkId(taskId);
    const session = sessionStore.load(planName, chunkId);
    if (!session) {
      return;
    }

    sessionStore.save({
      ...session,
      lastKnownGoodCommit: commitHash,
      updatedAt: new Date().toISOString(),
    });
  }
}

function normalizeStaleMateSignature(stdout: string): string {
  return stdout.replace(/\s+/g, ' ').trim();
}
