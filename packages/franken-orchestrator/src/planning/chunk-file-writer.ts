import { writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { ValidationIssue } from './chunk-validator.js';

/**
 * Writes ChunkDefinition[] to numbered .md files on disk.
 *
 * Supports the expanded 10-field format and appends validation warnings
 * when present. Clears existing chunk files before writing to handle
 * regeneration cleanly.
 */
export class ChunkFileWriter {
  constructor(private readonly outputDir: string) {}

  /**
   * Writes chunk definitions as numbered .md files.
   * Clears existing chunk files first (files matching /^\d{2}.*\.md$/).
   * Returns absolute paths of written files.
   */
  write(chunks: ChunkDefinition[], validationIssues?: ValidationIssue[]): string[] {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    this.clearExistingChunkFiles();

    return chunks.map((chunk, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const safeName = chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${num}_${safeName}.md`;
      const filePath = resolve(this.outputDir, filename);

      const content = this.buildContent(chunk, num, validationIssues);
      writeFileSync(filePath, content, 'utf-8');
      return filePath;
    });
  }

  private clearExistingChunkFiles(): void {
    const files = readdirSync(this.outputDir);
    for (const f of files) {
      if (/^\d{2}.*\.md$/.test(f)) {
        unlinkSync(join(this.outputDir, f));
      }
    }
  }

  private buildContent(
    chunk: ChunkDefinition,
    num: string,
    validationIssues?: ValidationIssue[],
  ): string {
    const sections: string[] = [];

    // Title
    sections.push(`# Chunk ${num}: ${chunk.id}`);

    // Objective (required)
    sections.push('## Objective\n\n' + chunk.objective);

    // Files (required)
    sections.push('## Files\n\n' + chunk.files.map((f) => `- ${f}`).join('\n'));

    // Context (optional)
    if (chunk.context !== undefined) {
      sections.push('## Context\n\n' + chunk.context);
    }

    // Design Decisions (optional)
    if (chunk.designDecisions !== undefined) {
      sections.push('## Design Decisions\n\n' + chunk.designDecisions);
    }

    // Interface Contract (optional)
    if (chunk.interfaceContract !== undefined) {
      sections.push('## Interface Contract\n\n```ts\n' + chunk.interfaceContract + '\n```');
    }

    // Edge Cases (optional)
    if (chunk.edgeCases !== undefined) {
      sections.push('## Edge Cases\n\n' + chunk.edgeCases);
    }

    // Success Criteria (required)
    sections.push('## Success Criteria\n\n' + chunk.successCriteria);

    // Anti-patterns (optional)
    if (chunk.antiPatterns !== undefined) {
      sections.push('## Anti-patterns\n\n' + chunk.antiPatterns);
    }

    // Verification Command (required)
    sections.push('## Verification Command\n\n```bash\n' + chunk.verificationCommand + '\n```');

    // Dependencies (only if non-empty)
    if (chunk.dependencies.length > 0) {
      sections.push(
        '## Dependencies\n\n' + chunk.dependencies.map((d) => `- ${d}`).join('\n'),
      );
    }

    // Warnings (only if there are validation issues for this chunk)
    if (validationIssues) {
      const chunkIssues = validationIssues.filter((i) => i.chunkId === chunk.id);
      if (chunkIssues.length > 0) {
        const issueLines = chunkIssues.map(
          (i) =>
            `- **[${i.severity}] ${i.category}**: ${i.description}\n  - Suggestion: ${i.suggestion}`,
        );
        sections.push('## Warnings\n\n' + issueLines.join('\n'));
      }
    }

    return sections.join('\n\n') + '\n';
  }
}
