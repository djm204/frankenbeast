import type { InterviewIO } from '../planning/interview-loop.js';
import type { BeastResult } from '../types.js';
import type { ProjectPaths } from './project-root.js';
export type SessionPhase = 'interview' | 'plan' | 'execute';
export interface SessionConfig {
    paths: ProjectPaths;
    baseBranch: string;
    budget: number;
    provider: string;
    providers?: string[] | undefined;
    providersConfig?: Record<string, {
        command?: string | undefined;
        model?: string | undefined;
        extraArgs?: string[] | undefined;
    }> | undefined;
    noPr: boolean;
    verbose: boolean;
    reset: boolean;
    io: InterviewIO;
    /** Entry phase — determined by CLI args */
    entryPhase: SessionPhase;
    /** Exit after this phase (subcommand mode) or run to completion (default mode) */
    exitAfter?: SessionPhase;
    /** Pre-existing design doc path (--design-doc flag) */
    designDocPath?: string;
    /** Pre-existing plan dir (--plan-dir flag) */
    planDirOverride?: string;
    /** Maximum plan-critique iterations before escalation */
    maxCritiqueIterations?: number | undefined;
    /** Maximum execution time in milliseconds */
    maxDurationMs?: number | undefined;
    /** Whether to emit observability spans */
    enableTracing?: boolean | undefined;
    /** Whether to run a heartbeat pulse after execution */
    enableHeartbeat?: boolean | undefined;
    /** Minimum critique score to pass (0-1) */
    minCritiqueScore?: number | undefined;
    /** Maximum total tokens before budget breaker trips */
    maxTotalTokens?: number | undefined;
    issueLabel?: string[] | undefined;
    issueMilestone?: string | undefined;
    issueSearch?: string | undefined;
    issueAssignee?: string | undefined;
    issueLimit?: number | undefined;
    issueRepo?: string | undefined;
    dryRun?: boolean | undefined;
}
export declare class Session {
    private readonly config;
    constructor(config: SessionConfig);
    start(): Promise<BeastResult | undefined>;
    runIssues(): Promise<void>;
    private runInterview;
    private runPlan;
    private runExecute;
    private extractChunkDefinitions;
    private displaySummary;
    private displayIssueSummary;
    private buildDepOptions;
}
//# sourceMappingURL=session.d.ts.map