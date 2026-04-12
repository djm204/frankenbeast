import { writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectPaths } from './project-root.js';

export interface ChunkDefinition {
  id: string;
  objective: string;
  files: string[];
  successCriteria: string;
  verificationCommand: string;
  dependencies: string[];
  // New fields — optional for backward compat with hand-written chunks
  context?: string;
  designDecisions?: string;
  interfaceContract?: string;
  edgeCases?: string;
  antiPatterns?: string;
}

/**
 * Writes the design document to .fbeast/plans/design.md.
 * Overwrites if it already exists (revision case).
 * Returns the absolute path written.
 */
export function writeDesignDoc(paths: ProjectPaths, content: string): string {
  writeFileSync(paths.designDocFile, content, 'utf-8');
  return paths.designDocFile;
}

/**
 * Reads the design document from .fbeast/plans/design.md.
 * Returns undefined if not found.
 */
export function readDesignDoc(paths: ProjectPaths): string | undefined {
  try {
    return readFileSync(paths.designDocFile, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Removes all numbered chunk .md files from the plans directory.
 * Matches files starting with two digits (e.g., 01_auth.md, 02_db.md).
 */
export function clearChunkFiles(paths: ProjectPaths): void {
  if (!existsSync(paths.plansDir)) return;
  const files = readdirSync(paths.plansDir);
  for (const f of files) {
    if (/^\d{2}/.test(f) && f.endsWith('.md')) {
      unlinkSync(resolve(paths.plansDir, f));
    }
  }
}

/**
 * Writes chunk definitions as numbered .md files.
 * Clears existing chunks first to handle regeneration.
 * Returns absolute paths of written files.
 */
export function writeChunkFiles(paths: ProjectPaths, chunks: ChunkDefinition[]): string[] {
  clearChunkFiles(paths);

  return chunks.map((chunk, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const safeName = chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${num}_${safeName}.md`;
    const filePath = resolve(paths.plansDir, filename);

    const content = [
      `# Chunk ${num}: ${chunk.id}`,
      '',
      '## Objective',
      '',
      chunk.objective,
      '',
      '## Files',
      '',
      ...chunk.files.map((f) => `- ${f}`),
      '',
      '## Success Criteria',
      '',
      chunk.successCriteria,
      '',
      '## Verification Command',
      '',
      '```bash',
      chunk.verificationCommand,
      '```',
      '',
      ...(chunk.dependencies.length > 0
        ? ['## Dependencies', '', ...chunk.dependencies.map((d) => `- ${d}`), '']
        : []),
    ].join('\n');

    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  });
}
