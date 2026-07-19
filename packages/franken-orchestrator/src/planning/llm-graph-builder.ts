import type { ILlmClient, LlmCompletionOptions } from '@franken/types';
import type { PlanGraph, PlanTask, PlanIntent } from '../deps.js';
import type { GraphBuilder } from './chunk-file-graph-builder.js';
import type { ChunkDefinition } from '../cli/file-writer.js';
import { ChunkDecomposer } from './chunk-decomposer.js';
import { ChunkValidator, type ValidationIssue } from './chunk-validator.js';
import { ChunkRemediator } from './chunk-remediator.js';
import type { PlanContextGatherer, PlanContext } from './plan-context-gatherer.js';
import { CHUNK_GUARDRAILS } from './chunk-guardrails.js';

const DEFAULT_PLAN_TIMEOUT_MS = 120_000;

type PlanStageName = 'decompose' | 'validate' | 'remediate' | 'revalidate';
type PlanStageStatus = 'completed' | 'timed_out' | 'failed';

export interface PlanStageMetrics {
  name: PlanStageName;
  promptBytes: number;
  elapsedMs: number;
  status: PlanStageStatus;
}

export interface PlanRunMetrics {
  passCount: number;
  promptBytes: number;
  elapsedMs: number;
  stages: PlanStageMetrics[];
}

export interface LlmGraphBuilderOptions {
  maxChunks?: number;
  skipValidation?: boolean;
  /** Adaptive skips quality passes for structurally simple one/two-chunk plans. */
  validationMode?: 'adaptive' | 'always';
  /** Total deadline shared by context gathering, all LLM passes, retries, and fallbacks. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

class PlanBudgetExceededError extends Error {
  constructor(timeoutMs: number) {
    super(`Planning deadline exceeded after ${timeoutMs}ms`);
    this.name = 'PlanBudgetExceededError';
  }
}

/**
 * GraphBuilder implementation that uses ILlmClient.complete() to decompose
 * a design document into a PlanGraph with ordered impl+harden task pairs.
 *
 * Uses an adaptive, bounded pipeline:
 *   Pass 1: Decompose (always)
 *   Pass 2: Validate (complex plans only by default)
 *   Pass 3: Remediate (conditional on validation errors)
 *   Pass 4: Re-validate (conditional on remediation)
 */
export class LlmGraphBuilder implements GraphBuilder {
  private readonly maxChunks: number;
  private activeStage: PlanStageMetrics | undefined;
  /** The parsed chunk definitions from the last build() call. */
  public lastChunks: ChunkDefinition[] = [];
  /** Validation issues from the last build() call (warnings after remediation). */
  public lastValidationIssues: ValidationIssue[] = [];
  /** Per-stage performance evidence from the last build() call. */
  public lastRunMetrics: PlanRunMetrics = {
    passCount: 0,
    promptBytes: 0,
    elapsedMs: 0,
    stages: [],
  };

  constructor(
    private readonly llm: ILlmClient,
    private readonly contextGatherer?: PlanContextGatherer,
    private readonly options: LlmGraphBuilderOptions = {},
  ) {
    this.maxChunks = options.maxChunks ?? 12;
  }

  async build(intent: PlanIntent): Promise<PlanGraph> {
    const startedAt = Date.now();
    const timeoutMs = this.normalizeTimeout(this.options.timeoutMs);
    const controller = new AbortController();
    let planningBudgetExceeded = false;
    const expirePlanningBudget = (): void => {
      if (controller.signal.aborted) return;
      planningBudgetExceeded = true;
      controller.abort(new PlanBudgetExceededError(timeoutMs));
    };
    const timeout = setTimeout(expirePlanningBudget, timeoutMs);

    const abortFromCaller = (): void => {
      controller.abort(this.options.signal?.reason ?? new Error('Planning cancelled'));
    };
    if (this.options.signal?.aborted) {
      abortFromCaller();
    } else {
      this.options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    this.lastChunks = [];
    this.lastValidationIssues = [];
    this.lastRunMetrics = { passCount: 0, promptBytes: 0, elapsedMs: 0, stages: [] };

    const emptyContext: PlanContext = {
      rampUp: '',
      relevantSignatures: [],
      packageDeps: {},
      existingPatterns: [],
    };

    const meteredLlm: ILlmClient = {
      complete: async (prompt: string, completionOptions?: LlmCompletionOptions) => {
        const promptBytes = Buffer.byteLength(prompt, 'utf8');
        this.lastRunMetrics.promptBytes += promptBytes;
        if (this.activeStage) this.activeStage.promptBytes += promptBytes;
        const remainingMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
        const response = await this.llm.complete(prompt, {
          ...completionOptions,
          signal: controller.signal,
          timeoutMs: Math.min(completionOptions?.timeoutMs ?? remainingMs, remainingMs),
        });
        this.throwIfAborted(controller.signal);
        return response;
      },
    };

    try {
      this.throwIfAborted(controller.signal);
      const context = this.contextGatherer
        ? await this.awaitWithAbort(this.contextGatherer.gather(intent.goal), controller.signal)
        : emptyContext;
      if (Date.now() - startedAt >= timeoutMs) expirePlanningBudget();
      this.throwIfAborted(controller.signal);

      const decomposer = new ChunkDecomposer(meteredLlm, { maxChunks: this.maxChunks });
      let chunks = await this.runStage('decompose', controller.signal, () =>
        decomposer.decompose(intent.goal, context, { signal: controller.signal }),
      );
      const decompositionDraft = chunks;
      let validationIssues: ValidationIssue[] = [];

      const shouldValidate = !this.options.skipValidation
        && Boolean(this.contextGatherer)
        && (this.options.validationMode === 'always' || !this.isSimplePlan(chunks));

      if (shouldValidate) {
        // Decomposition already contains the relevant context. Avoid resending the
        // unchanged RAMP_UP/signature payload during every quality pass.
        const qualityContext = emptyContext;
        const validator = new ChunkValidator(meteredLlm);

        try {
          const result = await this.runStage('validate', controller.signal, () =>
            validator.validate(chunks, intent.goal, qualityContext, { signal: controller.signal }),
          );

          if (result.revisedChunks) chunks = result.revisedChunks;

          if (!result.valid) {
            const remediator = new ChunkRemediator(meteredLlm);
            chunks = await this.runStage('remediate', controller.signal, () =>
              remediator.remediate(chunks, result.issues, qualityContext, { signal: controller.signal }),
            );

            const revalidation = await this.runStage('revalidate', controller.signal, () =>
              validator.validate(chunks, intent.goal, qualityContext, { signal: controller.signal }),
            );
            if (revalidation.revisedChunks) chunks = revalidation.revisedChunks;
            validationIssues = revalidation.issues;
          } else {
            validationIssues = result.issues;
          }
        } catch (error) {
          if (!controller.signal.aborted && isTimeoutError(error)) expirePlanningBudget();
          if (!controller.signal.aborted) throw error;
          if (!planningBudgetExceeded) throw error;
          chunks = decompositionDraft;
          validationIssues = [this.buildDraftWarning(controller.signal.reason, timeoutMs)];
        }
      }

      this.lastChunks = chunks;
      this.lastValidationIssues = validationIssues;
      return this.buildGraph(chunks);
    } finally {
      clearTimeout(timeout);
      this.options.signal?.removeEventListener('abort', abortFromCaller);
      this.lastRunMetrics.elapsedMs = Date.now() - startedAt;
      this.activeStage = undefined;
    }
  }

  private async runStage<T>(
    name: PlanStageName,
    signal: AbortSignal,
    run: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    const stage: PlanStageMetrics = { name, promptBytes: 0, elapsedMs: 0, status: 'completed' };
    this.lastRunMetrics.passCount += 1;
    this.lastRunMetrics.stages.push(stage);
    this.activeStage = stage;
    try {
      this.throwIfAborted(signal);
      return await this.awaitWithAbort(run(), signal);
    } catch (error) {
      stage.status = signal.aborted || isTimeoutError(error) ? 'timed_out' : 'failed';
      throw error;
    } finally {
      stage.elapsedMs = Date.now() - startedAt;
      this.activeStage = undefined;
    }
  }

  private isSimplePlan(chunks: ChunkDefinition[]): boolean {
    if (chunks.length === 0 || chunks.length > 2) return false;

    const seenChunkIds = new Set<string>();
    const claimedFiles = new Set<string>();
    for (const chunk of chunks) {
      if (seenChunkIds.has(chunk.id) || chunk.files.length === 0 || chunk.files.length > 4) return false;
      if (chunk.dependencies.length > 1 || chunk.dependencies.some((dependency) => !seenChunkIds.has(dependency))) {
        return false;
      }
      for (const file of chunk.files) {
        if (claimedFiles.has(file)) return false;
        claimedFiles.add(file);
      }
      seenChunkIds.add(chunk.id);
    }
    return true;
  }

  private normalizeTimeout(timeoutMs: number | undefined): number {
    if (timeoutMs === undefined) return DEFAULT_PLAN_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Planning timeoutMs must be a positive finite number');
    }
    return Math.floor(timeoutMs);
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw signal.reason instanceof Error ? signal.reason : new Error('Planning cancelled');
  }

  private awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('Planning cancelled'));
    }

    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        signal.removeEventListener('abort', abort);
        reject(signal.reason instanceof Error ? signal.reason : new Error('Planning cancelled'));
      };
      signal.addEventListener('abort', abort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
    });
  }

  private buildDraftWarning(reason: unknown, timeoutMs: number): ValidationIssue {
    const description = reason instanceof Error ? reason.message : 'Planning quality pass was cancelled';
    return {
      severity: 'warning',
      chunkId: null,
      category: 'planning_budget_exceeded',
      description: `${description}; saved the completed decomposition as a draft`,
      suggestion: `Review the draft manually or retry with a plan timeout above ${timeoutMs}ms`,
    };
  }

  /** Sanitize chunk ID: only alphanumeric, underscores, hyphens. */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  private buildGraph(chunks: ChunkDefinition[]): PlanGraph {
    if (chunks.length === 0) {
      return { tasks: [] };
    }

    // Map original IDs to sanitized IDs
    const idMap = new Map<string, string>();
    for (const chunk of chunks) {
      idMap.set(chunk.id, this.sanitizeId(chunk.id));
    }

    const tasks: PlanTask[] = [];

    for (const chunk of chunks) {
      const chunkId = idMap.get(chunk.id)!;
      const implId = `impl:${chunkId}`;
      const hardenId = `harden:${chunkId}`;

      // impl depends on harden tasks of its chunk dependencies
      const implDeps = chunk.dependencies.map((dep) => `harden:${idMap.get(dep)!}`);

      tasks.push({
        id: implId,
        objective: this.buildImplPrompt(chunkId, chunk),
        requiredSkills: [`cli:${chunkId}`],
        dependsOn: implDeps,
      });

      tasks.push({
        id: hardenId,
        objective: this.buildHardenPrompt(chunkId, chunk),
        requiredSkills: [`cli:${chunkId}`],
        dependsOn: [implId],
      });
    }

    return { tasks };
  }

  private buildImplPrompt(chunkId: string, chunk: ChunkDefinition): string {
    const parts: string[] = [
      `Implement chunk '${chunkId}': ${chunk.objective}`,
      `Files: ${chunk.files.join(', ')}`,
    ];

    if (chunk.context) parts.push(`Context: ${chunk.context}`);
    if (chunk.designDecisions) parts.push(`Design decisions: ${chunk.designDecisions}`);
    if (chunk.interfaceContract) parts.push(`Interface contract:\n${chunk.interfaceContract}`);
    if (chunk.edgeCases) parts.push(`Edge cases: ${chunk.edgeCases}`);
    if (chunk.antiPatterns) parts.push(`Anti-patterns: ${chunk.antiPatterns}`);

    parts.push(`Success criteria: ${chunk.successCriteria}`);
    parts.push(`Verification: ${chunk.verificationCommand}`);
    parts.push('');
    parts.push(
      `Use TDD: write failing tests first, then implement, then commit atomically. ` +
      CHUNK_GUARDRAILS +
      `Output <promise>IMPL_${chunkId}_DONE</promise> when all success criteria are met and verification passes.`,
    );

    return parts.join('\n');
  }

  private buildHardenPrompt(chunkId: string, chunk: ChunkDefinition): string {
    const parts: string[] = [
      `You are hardening chunk '${chunkId}'. ` +
      `Do NOT invoke any skills or do code reviews. Follow these steps exactly:`,
      `1. Review the implementation for chunk: ${chunk.objective}`,
    ];

    if (chunk.context) parts.push(`   Context: ${chunk.context}`);
    if (chunk.interfaceContract) parts.push(`   Interface contract:\n${chunk.interfaceContract}`);
    if (chunk.edgeCases) parts.push(`   Edge cases to verify: ${chunk.edgeCases}`);
    if (chunk.antiPatterns) parts.push(`   Anti-patterns to check for: ${chunk.antiPatterns}`);

    parts.push(`2. Run the verification command: ${chunk.verificationCommand}`);
    parts.push(`3. Fix any failing tests or type errors`);
    parts.push(`4. Ensure all success criteria are met: ${chunk.successCriteria}`);
    parts.push(
      CHUNK_GUARDRAILS +
      `Output <promise>HARDEN_${chunkId}_DONE</promise> when all success criteria are met and verification passes.`,
    );

    return parts.join('\n');
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as NodeJS.ErrnoException).code === 'ETIMEDOUT' || error.name === 'TimeoutError';
}
