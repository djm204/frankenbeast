import type { ILlmClient } from '@franken/core';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { PlanContext } from './plan-context-gatherer.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  chunkId: string | null;
  category:
    | 'missing_component'
    | 'wrong_dependency'
    | 'parallelizable'
    | 'missing_interface'
    | 'design_gap'
    | 'chunk_too_large'
    | 'chunk_too_thin';
  description: string;
  suggestion: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  revisedChunks?: ChunkDefinition[];
}

/**
 * Validates chunk decomposition quality using an LLM.
 *
 * Pass 2 of the multi-pass planning pipeline: takes ChunkDefinition[],
 * the original design doc, and codebase context, then asks the LLM to
 * identify structural issues (missing components, wrong dependencies,
 * false serialization, vague interfaces, etc.).
 */
export class ChunkValidator {
  constructor(private readonly llm: ILlmClient) {}

  async validate(
    chunks: ChunkDefinition[],
    designDoc: string,
    context: PlanContext,
  ): Promise<ValidationResult> {
    const prompt = this.buildValidationPrompt(chunks, designDoc, context);
    const raw = await this.llm.complete(prompt);
    return this.parseResponse(raw);
  }

  private buildValidationPrompt(
    chunks: ChunkDefinition[],
    designDoc: string,
    context: PlanContext,
  ): string {
    const sections: string[] = [];

    sections.push(
      `You are a plan validator reviewing a chunk decomposition for an AI-assisted development workflow. ` +
        `Your job is to find structural issues in the decomposition and suggest fixes.`,
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

    sections.push(`## Design Document\n\n${designDoc}`);

    sections.push(
      `## Chunk Definitions\n\n\`\`\`json\n${JSON.stringify(chunks, null, 2)}\n\`\`\``,
    );

    sections.push(`## Validation Checks

Review the chunks for the following issues:

- **missing_component** — the design doc assumes something that doesn't exist and no chunk creates it
- **wrong_dependency** — chunk A depends on B but doesn't need B's output
- **parallelizable** — chunks are falsely serialized; they could run in parallel
- **missing_interface** — interfaceContract is empty or vague for a chunk that defines an API boundary
- **design_gap** — design doc says "use X" but X isn't a dependency and no chunk adds it
- **chunk_too_large** — chunk touches more than ~8 files
- **chunk_too_thin** — chunk is missing important fields like context or edgeCases`);

    sections.push(`## Output Format

Respond with ONLY a JSON object (no markdown, no explanation). The object must have this shape:

\`\`\`
{
  "valid": boolean,
  "issues": [
    {
      "severity": "error" | "warning",
      "chunkId": string | null,
      "category": "missing_component" | "wrong_dependency" | "parallelizable" | "missing_interface" | "design_gap" | "chunk_too_large" | "chunk_too_thin",
      "description": string,
      "suggestion": string
    }
  ],
  "revisedChunks": [...] | null
}
\`\`\`

- Set "valid" to true if there are no errors (warnings alone are OK).
- Set "chunkId" to null for plan-level issues.
- Include "revisedChunks" only when you can auto-fix issues like parallelization or dependency corrections. Set to null otherwise.
- Respond with ONLY the JSON object.`);

    return sections.join('\n\n');
  }

  private parseResponse(raw: string): ValidationResult {
    const text = cleanLlmJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            chunkId: null,
            category: 'design_gap',
            description: 'Validator response could not be parsed',
            suggestion: 'Review chunks manually',
          },
        ],
      };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            chunkId: null,
            category: 'design_gap',
            description: 'Validator response could not be parsed',
            suggestion: 'Review chunks manually',
          },
        ],
      };
    }

    const obj = parsed as Record<string, unknown>;
    const result: ValidationResult = {
      valid: Boolean(obj['valid']),
      issues: Array.isArray(obj['issues'])
        ? (obj['issues'] as ValidationIssue[])
        : [],
    };

    if (Array.isArray(obj['revisedChunks'])) {
      result.revisedChunks = obj['revisedChunks'] as ChunkDefinition[];
    }

    return result;
  }
}
