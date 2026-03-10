import type { ILlmClient } from '@franken/core';
import type { PlanGraph, PlanTask, PlanIntent } from '../deps.js';
import type { GraphBuilder } from './chunk-file-graph-builder.js';
import type { ChunkDefinition } from '../cli/file-writer.js';
import { ChunkDecomposer } from './chunk-decomposer.js';
import { ChunkValidator, type ValidationIssue } from './chunk-validator.js';
import { ChunkRemediator } from './chunk-remediator.js';
import type { PlanContextGatherer, PlanContext } from './plan-context-gatherer.js';
import { CHUNK_GUARDRAILS } from './chunk-guardrails.js';

/**
 * GraphBuilder implementation that uses ILlmClient.complete() to decompose
 * a design document into a PlanGraph with ordered impl+harden task pairs.
 *
 * Uses a multi-pass pipeline:
 *   Pass 1: Decompose (ChunkDecomposer)
 *   Pass 2: Validate (ChunkValidator) — optional
 *   Pass 3: Remediate (ChunkRemediator) — conditional on validation errors
 *   Pass 4: Re-validate (ChunkValidator) — conditional on remediation
 */
export class LlmGraphBuilder implements GraphBuilder {
  private readonly maxChunks: number;
  /** The parsed chunk definitions from the last build() call. */
  public lastChunks: ChunkDefinition[] = [];
  /** Validation issues from the last build() call (warnings after remediation). */
  public lastValidationIssues: ValidationIssue[] = [];

  constructor(
    private readonly llm: ILlmClient,
    private readonly contextGatherer?: PlanContextGatherer,
    private readonly options?: { maxChunks?: number; skipValidation?: boolean },
  ) {
    this.maxChunks = options?.maxChunks ?? 12;
  }

  async build(intent: PlanIntent): Promise<PlanGraph> {
    const emptyContext: PlanContext = {
      rampUp: '',
      relevantSignatures: [],
      packageDeps: {},
      existingPatterns: [],
    };

    // Gather codebase context (or use empty if no gatherer provided)
    const context = this.contextGatherer
      ? await this.contextGatherer.gather(intent.goal)
      : emptyContext;

    // Pass 1: Decompose
    const decomposer = new ChunkDecomposer(this.llm, { maxChunks: this.maxChunks });
    let chunks = await decomposer.decompose(intent.goal, context);

    let validationIssues: ValidationIssue[] = [];

    // Pass 2-4: Validate → Remediate → Re-validate (unless skipped)
    if (!this.options?.skipValidation && this.contextGatherer) {
      const validator = new ChunkValidator(this.llm);
      const result = await validator.validate(chunks, intent.goal, context);

      if (result.revisedChunks) {
        chunks = result.revisedChunks;
      }

      if (!result.valid) {
        // Pass 3: Remediate (max 1 attempt)
        const remediator = new ChunkRemediator(this.llm);
        chunks = await remediator.remediate(chunks, result.issues, context);

        // Pass 4: Re-validate
        const revalidation = await validator.validate(chunks, intent.goal, context);
        if (revalidation.revisedChunks) {
          chunks = revalidation.revisedChunks;
        }
        // Remaining issues become warnings
        validationIssues = revalidation.issues;
      } else {
        validationIssues = result.issues; // warnings only
      }
    }

    this.lastChunks = chunks;
    this.lastValidationIssues = validationIssues;
    return this.buildGraph(chunks);
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
