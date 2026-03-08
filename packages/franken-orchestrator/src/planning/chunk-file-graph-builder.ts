import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PlanGraph, PlanTask, PlanIntent } from '../deps.js';

/**
 * Locally compatible GraphBuilder interface.
 * Mirrors franken-planner's GraphBuilder without importing it directly.
 */
export interface GraphBuilder {
  build(intent: PlanIntent): Promise<PlanGraph>;
}

/**
 * Reads numbered .md chunk files from a directory and produces a PlanGraph
 * with impl + harden task pairs wired in linear dependency order.
 *
 * This is Mode 1 (pre-written chunks) — no LLM needed.
 */
export class ChunkFileGraphBuilder implements GraphBuilder {
  constructor(private readonly chunkDir: string) {}

  async build(_intent: PlanIntent): Promise<PlanGraph> {
    const absDir = resolve(this.chunkDir);
    const chunkFiles = this.discoverChunks(absDir);

    if (chunkFiles.length === 0) {
      return { tasks: [] };
    }

    const tasks: PlanTask[] = [];
    let prevHardenId: string | undefined;

    for (const chunkFile of chunkFiles) {
      const chunkId = chunkFile.replace('.md', '');
      const chunkPath = join(absDir, chunkFile);
      const content = readFileSync(chunkPath, 'utf-8');

      const implId = `impl:${chunkId}`;
      const hardenId = `harden:${chunkId}`;

      tasks.push({
        id: implId,
        objective: this.buildImplPrompt(chunkPath, chunkId, content),
        requiredSkills: [`cli:${chunkId}`],
        dependsOn: prevHardenId !== undefined ? [prevHardenId] : [],
      });

      tasks.push({
        id: hardenId,
        objective: this.buildHardenPrompt(chunkPath, chunkId, content),
        requiredSkills: [`cli:${chunkId}`],
        dependsOn: [implId],
      });

      prevHardenId = hardenId;
    }

    return { tasks };
  }

  private discoverChunks(dir: string): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read chunk directory '${dir}': ${msg}`);
    }

    return entries
      .filter((f) => f.endsWith('.md') && !f.startsWith('00_') && /^\d{2}/.test(f))
      .sort();
  }

  private buildImplPrompt(chunkPath: string, chunkId: string, content: string): string {
    return (
      `Read ${chunkPath}. Implement ALL features described. ` +
      `Use TDD: write failing tests first, then implement, then commit atomically. ` +
      `Run the verification command. ` +
      `Output <promise>IMPL_${chunkId}_DONE</promise> when all success criteria are met and verification passes.\n\n` +
      content
    );
  }

  private buildHardenPrompt(chunkPath: string, chunkId: string, content: string): string {
    return (
      `You are hardening chunk '${chunkPath}'. ` +
      `Do NOT invoke any skills or do code reviews. Follow these steps exactly:\n` +
      `1. Read the chunk file to get the success criteria and verification command\n` +
      `2. Run the verification command\n` +
      `3. Fix any failing tests or type errors\n` +
      `4. Ensure all success criteria are met\n` +
      `Output <promise>HARDEN_${chunkId}_DONE</promise> when all success criteria are met and verification passes.\n\n` +
      content
    );
  }
}
