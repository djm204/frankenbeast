import type { ILlmClient } from '@franken/core';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { PlanContext } from './plan-context-gatherer.js';
import type { ValidationIssue } from './chunk-validator.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

/**
 * Remediates chunk decomposition issues by sending original chunks,
 * validation issues, and codebase context to an LLM for patching.
 *
 * Pass 3 (conditional) of the multi-pass planning pipeline.
 * Patches existing chunks — does NOT re-decompose from scratch.
 * Maximum 1 remediation attempt to prevent infinite loops.
 */
export class ChunkRemediator {
  constructor(private readonly llm: ILlmClient) {}

  async remediate(
    chunks: ChunkDefinition[],
    issues: ValidationIssue[],
    context: PlanContext,
  ): Promise<ChunkDefinition[]> {
    const prompt = this.buildRemediationPrompt(chunks, issues, context);
    const raw = await this.llm.complete(prompt);
    return this.parseResponse(raw, chunks);
  }

  private buildRemediationPrompt(
    chunks: ChunkDefinition[],
    issues: ValidationIssue[],
    context: PlanContext,
  ): string {
    const sections: string[] = [];

    sections.push(
      `You are a plan remediator fixing validation issues in a chunk decomposition ` +
        `for an AI-assisted development workflow. ` +
        `Patch the existing chunks to fix the listed issues.`,
    );

    // Codebase context
    if (context.rampUp) {
      sections.push(`## Codebase Overview (RAMP_UP)\n\n${context.rampUp}`);
    }

    if (context.relevantSignatures.length > 0) {
      const sigEntries = context.relevantSignatures
        .map((s) => `### ${s.path}\n\`\`\`ts\n${s.signatures}\n\`\`\``)
        .join('\n\n');
      sections.push(`## Relevant File Signatures\n\n${sigEntries}`);
    }

    if (Object.keys(context.packageDeps).length > 0) {
      const depEntries = Object.entries(context.packageDeps)
        .map(([pkg, deps]) => `- **${pkg}**: ${deps.join(', ')}`)
        .join('\n');
      sections.push(`## Package Dependencies\n\n${depEntries}`);
    }

    if (context.existingPatterns.length > 0) {
      const patternEntries = context.existingPatterns
        .map((p) => `- **${p.description}**: \`${p.example}\``)
        .join('\n');
      sections.push(`## Existing Patterns\n\n${patternEntries}`);
    }

    sections.push(
      `## Original Chunks\n\n\`\`\`json\n${JSON.stringify(chunks, null, 2)}\n\`\`\``,
    );

    sections.push(
      `## Validation Issues\n\n\`\`\`json\n${JSON.stringify(issues, null, 2)}\n\`\`\``,
    );

    sections.push(
      `## Instructions\n\n` +
        `Patch these chunks to fix the listed issues. ` +
        `Do NOT add or remove chunks — return the same number of chunks with the same IDs. ` +
        `Return ONLY a JSON array of the patched chunks.`,
    );

    return sections.join('\n\n');
  }

  private parseResponse(
    raw: string,
    originalChunks: ChunkDefinition[],
  ): ChunkDefinition[] {
    const text = cleanLlmJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Graceful fallback — don't crash the pipeline
      return originalChunks;
    }

    if (!Array.isArray(parsed)) {
      return originalChunks;
    }

    return parsed as ChunkDefinition[];
  }
}
