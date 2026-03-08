import type { GithubIssue, IIssueTriage, TriageResult } from './types.js';
type CompleteFn = (prompt: string) => Promise<string>;
export declare class IssueTriage implements IIssueTriage {
    private readonly complete;
    constructor(complete: CompleteFn);
    triage(issues: GithubIssue[]): Promise<TriageResult[]>;
    private buildPrompt;
    private extractAndParse;
    private toTriageResults;
}
export {};
//# sourceMappingURL=issue-triage.d.ts.map