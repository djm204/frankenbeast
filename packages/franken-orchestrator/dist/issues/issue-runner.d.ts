import type { ICheckpointStore, ILogger } from '../deps.js';
import type { GithubIssue, TriageResult, IssueOutcome } from './types.js';
import type { IssueGraphBuilder } from './issue-graph-builder.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import type { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import type { PrCreator } from '../closure/pr-creator.js';
export interface IssueRunnerConfig {
    readonly issues: readonly GithubIssue[];
    readonly triageResults: readonly TriageResult[];
    readonly graphBuilder: IssueGraphBuilder;
    readonly executor: CliSkillExecutor;
    readonly git: GitBranchIsolator;
    readonly prCreator?: PrCreator | undefined;
    readonly checkpoint?: ICheckpointStore | undefined;
    readonly logger?: ILogger | undefined;
    readonly budget: number;
    readonly baseBranch: string;
    readonly noPr: boolean;
    readonly repo: string;
}
export declare class IssueRunner {
    run(config: IssueRunnerConfig): Promise<IssueOutcome[]>;
    private processIssue;
}
//# sourceMappingURL=issue-runner.d.ts.map