import type { PlanGraph } from '../deps.js';
import type { GithubIssue, TriageResult } from './types.js';
type CompleteFn = (prompt: string) => Promise<string>;
/**
 * Builds a PlanGraph for a single GitHub issue.
 *
 * One-shot issues get a single impl+harden task pair.
 * Chunked issues use LLM decomposition to produce multiple task pairs
 * with a linear dependency chain.
 */
export declare class IssueGraphBuilder {
    private readonly complete;
    constructor(complete: CompleteFn);
    buildForIssue(issue: GithubIssue, triage: TriageResult): Promise<PlanGraph>;
    private buildOneShotGraph;
    private buildChunkedGraph;
    private buildDecompositionPrompt;
    private parseResponse;
    private validateChunkShape;
    private buildGraph;
}
export {};
//# sourceMappingURL=issue-graph-builder.d.ts.map