/**
 * GraphBuilder implementation that uses ILlmClient.complete() to decompose
 * a design document into a PlanGraph with ordered impl+harden task pairs.
 *
 * This is Mode 2 (design-doc input) — the LLM produces the chunk breakdown.
 */
export class LlmGraphBuilder {
    llm;
    options;
    maxChunks;
    constructor(llm, options) {
        this.llm = llm;
        this.options = options;
        this.maxChunks = options?.maxChunks ?? 12;
    }
    async build(intent) {
        const prompt = this.buildDecompositionPrompt(intent.goal);
        const raw = await this.llm.complete(prompt);
        const chunks = this.parseResponse(raw);
        this.validate(chunks);
        let truncated = chunks;
        if (chunks.length > this.maxChunks) {
            console.warn(`LLM produced ${chunks.length} chunks, exceeding max of ${this.maxChunks}. Truncating to first ${this.maxChunks}.`);
            truncated = chunks.slice(0, this.maxChunks);
        }
        return this.buildGraph(truncated);
    }
    buildDecompositionPrompt(designDoc) {
        return `You are decomposing a design document into implementation chunks for an AI-assisted development workflow.

## Project Conventions
- ALWAYS use TDD: write failing tests first, then implement, then commit atomically.
- Each chunk must be completable in 2-5 minutes by an AI agent.
- Commits must be atomic — one logical change per commit.

## Instructions
Analyze the following design document and produce a JSON array of implementation chunks.

Each chunk object must have these fields:
- "id": A short identifier (alphanumeric, underscores, hyphens only — suitable for git branch names)
- "objective": What the chunk accomplishes
- "files": Array of file paths to create or modify
- "successCriteria": How to verify the chunk is complete
- "verificationCommand": Shell command to verify (e.g., "npx vitest run ...")
- "dependencies": Array of chunk IDs this chunk depends on (empty array if none)

## Constraints
- Maximum ${this.maxChunks} chunks
- Each chunk should be completable in 2-5 minutes
- Order chunks so dependencies come before dependents
- No cyclic dependencies

## Design Document

${designDoc}

## Output

Respond with ONLY a JSON array. No explanation, no markdown — just the JSON array.`;
    }
    parseResponse(raw) {
        let text = raw.trim();
        // Strip markdown code fences if present
        const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
        if (fenceMatch) {
            text = fenceMatch[1].trim();
        }
        // Strip trailing commas (common LLM artifact)
        text = text.replace(/,\s*([}\]])/g, '$1');
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new Error(`Failed to parse LLM response as JSON. Expected a JSON array of chunk definitions. ` +
                `Response starts with: "${raw.slice(0, 100)}..."`);
        }
        if (!Array.isArray(parsed)) {
            throw new Error(`LLM response is not a JSON array. Got ${typeof parsed}. ` +
                `Expected an array of chunk definitions.`);
        }
        for (const chunk of parsed) {
            this.validateChunkShape(chunk);
        }
        return parsed;
    }
    validateChunkShape(chunk) {
        if (typeof chunk !== 'object' || chunk === null) {
            throw new Error('Invalid chunk: expected an object');
        }
        const c = chunk;
        const required = ['id', 'objective', 'files', 'successCriteria', 'verificationCommand', 'dependencies'];
        const missing = required.filter((f) => !(f in c));
        if (missing.length > 0) {
            throw new Error(`Chunk missing required fields: ${missing.join(', ')}`);
        }
    }
    validate(chunks) {
        const ids = new Set(chunks.map((c) => c.id));
        // Check all dependency references exist
        for (const chunk of chunks) {
            for (const dep of chunk.dependencies) {
                if (!ids.has(dep)) {
                    throw new Error(`Chunk '${chunk.id}' depends on '${dep}' which does not exist in the chunk list`);
                }
            }
        }
        // Check for cycles using DFS
        this.detectCycles(chunks);
    }
    detectCycles(chunks) {
        const adj = new Map();
        for (const c of chunks) {
            adj.set(c.id, c.dependencies);
        }
        const visited = new Set();
        const inStack = new Set();
        const dfs = (id) => {
            if (inStack.has(id)) {
                throw new Error(`Cyclic dependency detected involving chunk '${id}'`);
            }
            if (visited.has(id))
                return;
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
    /** Sanitize chunk ID: only alphanumeric, underscores, hyphens. */
    sanitizeId(id) {
        return id.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }
    buildGraph(chunks) {
        if (chunks.length === 0) {
            return { tasks: [] };
        }
        // Map original IDs to sanitized IDs
        const idMap = new Map();
        for (const chunk of chunks) {
            idMap.set(chunk.id, this.sanitizeId(chunk.id));
        }
        const tasks = [];
        for (const chunk of chunks) {
            const chunkId = idMap.get(chunk.id);
            const implId = `impl:${chunkId}`;
            const hardenId = `harden:${chunkId}`;
            // impl depends on harden tasks of its chunk dependencies
            const implDeps = chunk.dependencies.map((dep) => `harden:${idMap.get(dep)}`);
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
    buildImplPrompt(chunkId, chunk) {
        return (`Implement chunk '${chunkId}': ${chunk.objective}\n` +
            `Files: ${chunk.files.join(', ')}\n` +
            `Success criteria: ${chunk.successCriteria}\n` +
            `Verification: ${chunk.verificationCommand}\n\n` +
            `Use TDD: write failing tests first, then implement, then commit atomically. ` +
            `Output <promise>IMPL_${chunkId}_DONE</promise> when all success criteria are met and verification passes.`);
    }
    buildHardenPrompt(chunkId, chunk) {
        return (`You are hardening chunk '${chunkId}'. ` +
            `Do NOT invoke any skills or do code reviews. Follow these steps exactly:\n` +
            `1. Review the implementation for chunk: ${chunk.objective}\n` +
            `2. Run the verification command: ${chunk.verificationCommand}\n` +
            `3. Fix any failing tests or type errors\n` +
            `4. Ensure all success criteria are met: ${chunk.successCriteria}\n` +
            `Output <promise>HARDEN_${chunkId}_DONE</promise> when all success criteria are met and verification passes.`);
    }
}
//# sourceMappingURL=llm-graph-builder.js.map