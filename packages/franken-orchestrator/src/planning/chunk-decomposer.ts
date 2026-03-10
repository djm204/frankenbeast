import type { ILlmClient } from '@franken/core';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { PlanContext } from './plan-context-gatherer.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

/**
 * Decomposes a design document into ChunkDefinition[] using an LLM,
 * enriched with codebase context from PlanContextGatherer.
 *
 * Extracted from LlmGraphBuilder to separate decomposition concerns
 * from graph construction.
 */
export class ChunkDecomposer {
  constructor(
    private readonly llm: ILlmClient,
    private readonly options: { maxChunks: number },
  ) {}

  async decompose(designDoc: string, context: PlanContext): Promise<ChunkDefinition[]> {
    const prompt = this.buildDecompositionPrompt(designDoc, context);
    const raw = await this.llm.complete(prompt);
    const chunks = this.parseResponse(raw);
    this.validate(chunks);

    let result = chunks;
    if (chunks.length > this.options.maxChunks) {
      console.warn(
        `LLM produced ${chunks.length} chunks, exceeding max of ${this.options.maxChunks}. Truncating to first ${this.options.maxChunks}.`,
      );
      result = chunks.slice(0, this.options.maxChunks);
    }

    return result;
  }

  private buildDecompositionPrompt(designDoc: string, context: PlanContext): string {
    const sections: string[] = [];

    sections.push(
      `You are decomposing a design document into implementation chunks for an AI-assisted development workflow.`,
    );

    // Codebase context sections
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

    sections.push(`## Project Conventions
- ALWAYS use TDD: write failing tests first, then implement, then commit atomically.
- Each chunk must be completable in 2-5 minutes by an AI agent.
- Commits must be atomic — one logical change per commit.
- Use action-verb kebab-case IDs (e.g., \`define-types\`, \`implement-router\`, \`add-validation\`).
- Identify parallelizable chunks — set dependencies only where truly needed.`);

    sections.push(`## Instructions
Analyze the following design document and produce a JSON array of implementation chunks.

Each chunk object has the following fields:

### Required fields:
- "id": A short kebab-case identifier (action-verb style, e.g., "define-types", "implement-router")
- "objective": What the chunk accomplishes
- "files": Array of file paths to create or modify
- "successCriteria": How to verify the chunk is complete
- "verificationCommand": Shell command to verify (e.g., "npx vitest run ...")
- "dependencies": Array of chunk IDs this chunk depends on (empty array if none)

### Optional fields (include when useful):
- "context": Background information the implementer needs to understand
- "designDecisions": Key design choices made for this chunk
- "interfaceContract": API signatures or contracts this chunk must fulfill
- "edgeCases": Edge cases to handle or test for
- "antiPatterns": Common mistakes to avoid`);

    sections.push(`## Constraints
- Maximum ${this.options.maxChunks} chunks
- Each chunk should be completable in 2-5 minutes
- Order chunks so dependencies come before dependents
- No cyclic dependencies`);

    sections.push(`## Design Document\n\n${designDoc}`);

    sections.push(
      `## Output\n\nRespond with ONLY a JSON array. No explanation, no markdown — just the JSON array.`,
    );

    return sections.join('\n\n');
  }

  private parseResponse(raw: string): ChunkDefinition[] {
    const text = cleanLlmJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `Failed to parse LLM response as JSON. Expected a JSON array of chunk definitions. ` +
          `Response starts with: "${raw.slice(0, 100)}..."`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `LLM response is not a JSON array. Got ${typeof parsed}. ` +
          `Expected an array of chunk definitions.`,
      );
    }

    for (const chunk of parsed) {
      this.validateChunkShape(chunk);
    }

    return parsed as ChunkDefinition[];
  }

  private validateChunkShape(chunk: unknown): void {
    if (typeof chunk !== 'object' || chunk === null) {
      throw new Error('Invalid chunk: expected an object');
    }

    const c = chunk as Record<string, unknown>;
    const required = [
      'id',
      'objective',
      'files',
      'successCriteria',
      'verificationCommand',
      'dependencies',
    ];
    const missing = required.filter((f) => !(f in c));
    if (missing.length > 0) {
      throw new Error(`Chunk missing required fields: ${missing.join(', ')}`);
    }
  }

  private validate(chunks: ChunkDefinition[]): void {
    const ids = new Set(chunks.map((c) => c.id));

    // Check all dependency references exist
    for (const chunk of chunks) {
      for (const dep of chunk.dependencies) {
        if (!ids.has(dep)) {
          throw new Error(
            `Chunk '${chunk.id}' depends on '${dep}' which does not exist in the chunk list`,
          );
        }
      }
    }

    // Check for cycles using DFS
    this.detectCycles(chunks);
  }

  private detectCycles(chunks: ChunkDefinition[]): void {
    const adj = new Map<string, string[]>();
    for (const c of chunks) {
      adj.set(c.id, c.dependencies);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (id: string): void => {
      if (inStack.has(id)) {
        throw new Error(`Cyclic dependency detected involving chunk '${id}'`);
      }
      if (visited.has(id)) return;

      inStack.add(id);
      for (const dep of adj.get(id) ?? []) {
        dfs(dep);
      }
      inStack.delete(id);
      visited.add(id);
    };

    for (const c of chunks) {
      dfs(c.id);
    }
  }
}
