import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { ValidationIssue } from './chunk-validator.js';

/**
 * Writes ChunkDefinition[] to numbered .md files on disk.
 *
 * Supports the expanded 10-field format and appends validation warnings
 * when present. Rewrites existing writer-owned chunk files transactionally
 * so a failed generation preserves the previous plan.
 */
export class ChunkFileWriter {
  constructor(private readonly outputDir: string) {}

  /**
   * Writes chunk definitions as numbered .md files.
   * Replaces stale writer-owned chunk files after the full replacement set
   * has been prepared. Unrelated numbered markdown files are preserved.
   * Returns absolute paths of written files.
   */
  write(chunks: ChunkDefinition[], validationIssues?: ValidationIssue[]): string[] {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    const token = `${Date.now()}-${process.pid}`;
    const preparedFiles = chunks.map((chunk, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const safeName = chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${num}_${safeName}.md`;
      const filePath = resolve(this.outputDir, filename);
      const tempPath = resolve(this.outputDir, `.${filename}.${token}.tmp`);

      const content = this.buildContent(chunk, num, validationIssues);
      return { content, filePath, filename, tempPath };
    });

    const tempPaths = preparedFiles.map((file) => file.tempPath);
    const backups: Array<{ backupPath: string; originalPath: string; deleteOnSuccess: boolean }> = [];
    const installedPaths: string[] = [];

    try {
      for (const file of preparedFiles) {
        writeFileSync(file.tempPath, file.content, 'utf-8');
      }

      const staleChunkFiles = this.findWriterOwnedChunkFiles();
      const preservedFiles = this.findDiscoverableNonWriterChunkFiles();
      for (const file of preparedFiles) {
        if (existsSync(file.filePath) && !staleChunkFiles.includes(file.filename)) {
          throw new Error(
            `Refusing to overwrite non-chunk file during chunk rewrite: ${file.filename}`,
          );
        }
      }

      for (const staleFile of staleChunkFiles) {
        const originalPath = resolve(this.outputDir, staleFile);
        const backupPath = resolve(this.outputDir, `.${staleFile}.${token}.bak`);
        renameSync(originalPath, backupPath);
        backups.push({ backupPath, originalPath, deleteOnSuccess: true });
      }

      for (const preservedFile of preservedFiles) {
        const originalPath = resolve(this.outputDir, preservedFile);
        const backupPath = resolve(this.outputDir, `.preserved-${token}-${preservedFile}.bak`);
        renameSync(originalPath, backupPath);
        backups.push({ backupPath, originalPath, deleteOnSuccess: false });
      }

      for (const file of preparedFiles) {
        renameSync(file.tempPath, file.filePath);
        installedPaths.push(file.filePath);
      }

    } catch (error) {
      for (const installedPath of installedPaths) {
        rmSync(installedPath, { force: true });
      }
      for (const backup of backups.reverse()) {
        if (existsSync(backup.backupPath) && !existsSync(backup.originalPath)) {
          renameSync(backup.backupPath, backup.originalPath);
        }
      }
      for (const tempPath of tempPaths) {
        rmSync(tempPath, { force: true, recursive: true });
      }
      throw error;
    }

    for (const backup of backups.filter((backup) => backup.deleteOnSuccess)) {
      try {
        rmSync(backup.backupPath, { force: true });
      } catch {
        // The replacement set is already installed. A backup cleanup failure
        // should leave a recoverable backup file behind rather than rolling
        // back and risking loss of the newly generated or previous plan.
      }
    }

    return preparedFiles.map((file) => file.filePath);
  }

  private findWriterOwnedChunkFiles(): string[] {
    const files = readdirSync(this.outputDir);
    return files.filter((file) => this.isWriterOwnedChunkFile(file));
  }

  private findDiscoverableNonWriterChunkFiles(): string[] {
    const files = readdirSync(this.outputDir);
    return files.filter(
      (file) =>
        file.endsWith('.md') &&
        !file.startsWith('00_') &&
        /^\d{2}/.test(file) &&
        !this.isWriterOwnedChunkFile(file),
    );
  }

  private isWriterOwnedChunkFile(file: string): boolean {
    const match = /^(\d{2,})_[a-zA-Z0-9_-]+\.md$/.exec(file);
    if (!match) {
      return false;
    }

    try {
      const content = readFileSync(join(this.outputDir, file), 'utf-8');
      return content.startsWith(`# Chunk ${match[1]}: `);
    } catch {
      return false;
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
