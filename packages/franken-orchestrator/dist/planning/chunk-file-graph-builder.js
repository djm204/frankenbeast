import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
/**
 * Reads numbered .md chunk files from a directory and produces a PlanGraph
 * with impl + harden task pairs wired in linear dependency order.
 *
 * This is Mode 1 (pre-written chunks) — no LLM needed.
 */
export class ChunkFileGraphBuilder {
    chunkDir;
    constructor(chunkDir) {
        this.chunkDir = chunkDir;
    }
    async build(_intent) {
        const absDir = resolve(this.chunkDir);
        const chunkFiles = this.discoverChunks(absDir);
        if (chunkFiles.length === 0) {
            return { tasks: [] };
        }
        const tasks = [];
        let prevHardenId;
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
    discoverChunks(dir) {
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Cannot read chunk directory '${dir}': ${msg}`);
        }
        return entries
            .filter((f) => f.endsWith('.md') && !f.startsWith('00_') && /^\d{2}/.test(f))
            .sort();
    }
    buildImplPrompt(chunkPath, chunkId, content) {
        return (`Read ${chunkPath}. Implement ALL features described. ` +
            `Use TDD: write failing tests first, then implement, then commit atomically. ` +
            `Run the verification command. ` +
            `Output <promise>IMPL_${chunkId}_DONE</promise> when all success criteria are met and verification passes.\n\n` +
            content);
    }
    buildHardenPrompt(chunkPath, chunkId, content) {
        return (`You are hardening chunk '${chunkPath}'. ` +
            `Do NOT invoke any skills or do code reviews. Follow these steps exactly:\n` +
            `1. Read the chunk file to get the success criteria and verification command\n` +
            `2. Run the verification command\n` +
            `3. Fix any failing tests or type errors\n` +
            `4. Ensure all success criteria are met\n` +
            `Output <promise>HARDEN_${chunkId}_DONE</promise> when all success criteria are met and verification passes.\n\n` +
            content);
    }
}
//# sourceMappingURL=chunk-file-graph-builder.js.map