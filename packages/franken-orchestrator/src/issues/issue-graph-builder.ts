import type { PlanGraph, PlanTask } from '../deps.js';
import type { GithubIssue, TriageResult } from './types.js';
import type { ChunkDefinition } from '../cli/file-writer.js';
import { stripHookJson } from '../skills/providers/stream-json-utils.js';

type CompleteFn = (prompt: string) => Promise<string>;

/**
 * Builds a PlanGraph for a single GitHub issue.
 *
 * One-shot issues get a single impl+harden task pair.
 * Chunked issues use LLM decomposition to produce multiple task pairs
 * with a linear dependency chain.
 */
export class IssueGraphBuilder {
  constructor(private readonly complete: CompleteFn) {}

  async buildForIssue(issue: GithubIssue, triage: TriageResult): Promise<PlanGraph> {
    if (triage.complexity === 'one-shot') {
      return this.buildOneShotGraph(issue);
    }
    return this.buildChunkedGraph(issue);
  }

  private buildOneShotGraph(issue: GithubIssue): PlanGraph {
    const implId = `impl:issue-${issue.number}`;
    const hardenId = `harden:issue-${issue.number}`;

    const tasks: PlanTask[] = [
      {
        id: implId,
        objective: `Fix issue #${issue.number}: ${issue.title}\n\n${issue.body}`,
        requiredSkills: [],
        dependsOn: [],
      },
      {
        id: hardenId,
        objective:
          `Review and verify the fix for issue #${issue.number}. ` +
          `Run tests. Check acceptance criteria.`,
        requiredSkills: [],
        dependsOn: [implId],
      },
    ];

    return { tasks };
  }

  private async buildChunkedGraph(issue: GithubIssue): Promise<PlanGraph> {
    const prompt = this.buildDecompositionPrompt(issue);
    const raw = await this.complete(prompt);
    const chunks = this.parseResponse(raw);
    return this.buildGraph(issue.number, chunks);
  }

  private buildDecompositionPrompt(issue: GithubIssue): string {
    return `You are decomposing a GitHub issue into implementation chunks for an AI-assisted development workflow.

## Issue #${issue.number}: ${issue.title}

${issue.body}

## Instructions
Analyze the issue above and produce a JSON array of implementation chunks.

Each chunk object must have these fields:
- "id": A short identifier (alphanumeric, underscores, hyphens only)
- "objective": What the chunk accomplishes
- "files": Array of file paths to create or modify
- "successCriteria": How to verify the chunk is complete
- "verificationCommand": Shell command to verify (e.g., "npx vitest run ...")
- "dependencies": Array of chunk IDs this chunk depends on (empty array if none)

## Constraints
- Each chunk should be completable in 2-5 minutes by an AI agent
- Use TDD: write failing tests first, then implement
- Order chunks so dependencies come before dependents
- No cyclic dependencies

## Output

Respond with ONLY a JSON array. No explanation, no markdown — just the JSON array.`;
  }

  private parseResponse(raw: string): ChunkDefinition[] {
    let text = raw.trim();

    // Strip hook output that leaked through normalizeOutput
    text = stripHookJson(text);

    // Strip markdown code fences if present
    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) {
      text = fenceMatch[1]!.trim();
    }

    // Strip trailing commas (common LLM artifact)
    text = text.replace(/,\s*([}\]])/g, '$1');

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
    const required = ['id', 'objective', 'files', 'successCriteria', 'verificationCommand', 'dependencies'];
    const missing = required.filter((f) => !(f in c));
    if (missing.length > 0) {
      throw new Error(`Chunk missing required fields: ${missing.join(', ')}`);
    }
  }

  private buildGraph(issueNumber: number, chunks: ChunkDefinition[]): PlanGraph {
    const tasks: PlanTask[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const chunkNum = i + 1;
      const implId = `impl:issue-${issueNumber}/chunk-${chunkNum}`;
      const hardenId = `harden:issue-${issueNumber}/chunk-${chunkNum}`;

      // Linear dependency: impl of chunk N+1 depends on harden of chunk N
      const implDeps: string[] =
        i > 0 ? [`harden:issue-${issueNumber}/chunk-${i}`] : [];

      tasks.push({
        id: implId,
        objective: chunk.objective,
        requiredSkills: [],
        dependsOn: implDeps,
      });

      tasks.push({
        id: hardenId,
        objective:
          `Review and verify chunk ${chunkNum} for issue #${issueNumber}. ` +
          `Run verification: ${chunk.verificationCommand}. ` +
          `Check success criteria: ${chunk.successCriteria}`,
        requiredSkills: [],
        dependsOn: [implId],
      });
    }

    return { tasks };
  }
}
