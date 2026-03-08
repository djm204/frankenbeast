/**
 * Builds a PlanGraph for a single GitHub issue.
 *
 * One-shot issues get a single impl+harden task pair.
 * Chunked issues use LLM decomposition to produce multiple task pairs
 * with a linear dependency chain.
 */
export class IssueGraphBuilder {
    complete;
    constructor(complete) {
        this.complete = complete;
    }
    async buildForIssue(issue, triage) {
        if (triage.complexity === 'one-shot') {
            return this.buildOneShotGraph(issue);
        }
        return this.buildChunkedGraph(issue);
    }
    buildOneShotGraph(issue) {
        const implId = `impl:issue-${issue.number}`;
        const hardenId = `harden:issue-${issue.number}`;
        const tasks = [
            {
                id: implId,
                objective: `Fix issue #${issue.number}: ${issue.title}\n\n${issue.body}`,
                requiredSkills: [],
                dependsOn: [],
            },
            {
                id: hardenId,
                objective: `Review and verify the fix for issue #${issue.number}. ` +
                    `Run tests. Check acceptance criteria.`,
                requiredSkills: [],
                dependsOn: [implId],
            },
        ];
        return { tasks };
    }
    async buildChunkedGraph(issue) {
        const prompt = this.buildDecompositionPrompt(issue);
        const raw = await this.complete(prompt);
        const chunks = this.parseResponse(raw);
        return this.buildGraph(issue.number, chunks);
    }
    buildDecompositionPrompt(issue) {
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
    buildGraph(issueNumber, chunks) {
        const tasks = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkNum = i + 1;
            const implId = `impl:issue-${issueNumber}/chunk-${chunkNum}`;
            const hardenId = `harden:issue-${issueNumber}/chunk-${chunkNum}`;
            // Linear dependency: impl of chunk N+1 depends on harden of chunk N
            const implDeps = i > 0 ? [`harden:issue-${issueNumber}/chunk-${i}`] : [];
            tasks.push({
                id: implId,
                objective: chunk.objective,
                requiredSkills: [],
                dependsOn: implDeps,
            });
            tasks.push({
                id: hardenId,
                objective: `Review and verify chunk ${chunkNum} for issue #${issueNumber}. ` +
                    `Run verification: ${chunk.verificationCommand}. ` +
                    `Check success criteria: ${chunk.successCriteria}`,
                requiredSkills: [],
                dependsOn: [implId],
            });
        }
        return { tasks };
    }
}
//# sourceMappingURL=issue-graph-builder.js.map