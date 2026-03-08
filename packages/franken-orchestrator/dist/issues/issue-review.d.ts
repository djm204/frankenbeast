import type { GithubIssue, TriageResult } from './types.js';
/** IO abstraction for user interaction during review. */
export interface ReviewIO {
    read(): Promise<string>;
    write(text: string): void;
}
/** Result of the HITL triage review step. */
export interface ReviewDecision {
    readonly approved: TriageResult[];
    readonly action: 'execute' | 'abort';
}
/** Options for IssueReview. */
export interface IssueReviewOptions {
    readonly dryRun?: boolean | undefined;
}
export declare class IssueReview {
    private readonly io;
    private readonly dryRun;
    constructor(io: ReviewIO, options?: IssueReviewOptions);
    review(issues: GithubIssue[], triage: TriageResult[]): Promise<ReviewDecision>;
    private buildEntries;
    private extractSeverity;
    private truncateTitle;
    private displayTable;
    private editLoop;
}
//# sourceMappingURL=issue-review.d.ts.map