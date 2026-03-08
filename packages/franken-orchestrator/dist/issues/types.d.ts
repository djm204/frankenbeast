/** A GitHub issue with essential fields for triage and processing. */
export interface GithubIssue {
    readonly number: number;
    readonly title: string;
    readonly body: string;
    readonly labels: string[];
    readonly state: string;
    readonly url: string;
}
/** Options for fetching GitHub issues. */
export interface IssueFetchOptions {
    readonly repo?: string | undefined;
    readonly label?: string[] | undefined;
    readonly milestone?: string | undefined;
    readonly search?: string | undefined;
    readonly assignee?: string | undefined;
    readonly limit?: number | undefined;
}
/** Complexity classification for an issue. */
export type IssueComplexity = 'one-shot' | 'chunked';
/** Result of triaging a single issue. */
export interface TriageResult {
    readonly issueNumber: number;
    readonly complexity: IssueComplexity;
    readonly rationale: string;
    readonly estimatedScope: string;
}
/** Outcome of processing a single issue. */
export interface IssueOutcome {
    readonly issueNumber: number;
    readonly issueTitle: string;
    readonly status: 'fixed' | 'failed' | 'skipped';
    readonly prUrl?: string | undefined;
    readonly tokensUsed: number;
    readonly error?: string | undefined;
}
/** Port interface for fetching GitHub issues. */
export interface IIssueFetcher {
    fetch(options: IssueFetchOptions): Promise<GithubIssue[]>;
    inferRepo(): Promise<string>;
}
/** Port interface for triaging GitHub issues by complexity. */
export interface IIssueTriage {
    triage(issues: GithubIssue[]): Promise<TriageResult[]>;
}
//# sourceMappingURL=types.d.ts.map