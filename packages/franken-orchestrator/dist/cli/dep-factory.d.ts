import { BeastLogger } from '../logging/beast-logger.js';
import { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import { CliLlmAdapter } from '../adapters/cli-llm-adapter.js';
import { CliObserverBridge } from '../adapters/cli-observer-bridge.js';
import { FileCheckpointStore } from '../checkpoint/file-checkpoint-store.js';
import { PrCreator } from '../closure/pr-creator.js';
import { IssueFetcher } from '../issues/issue-fetcher.js';
import { IssueTriage } from '../issues/issue-triage.js';
import { IssueGraphBuilder } from '../issues/issue-graph-builder.js';
import { IssueReview } from '../issues/issue-review.js';
import type { ReviewIO } from '../issues/issue-review.js';
import { IssueRunner } from '../issues/issue-runner.js';
import type { BeastLoopDeps } from '../deps.js';
import type { ProjectPaths } from './project-root.js';
export interface CliDepOptions {
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
    planDirOverride?: string | undefined;
    /** When provided, issue-specific deps will be created. */
    issueIO?: ReviewIO | undefined;
    /** Dry-run flag for IssueReview. */
    dryRun?: boolean | undefined;
}
export interface IssueCliDeps {
    fetcher: IssueFetcher;
    triage: IssueTriage;
    graphBuilder: IssueGraphBuilder;
    review: IssueReview;
    runner: IssueRunner;
    executor: CliSkillExecutor;
    git: GitBranchIsolator;
    prCreator?: PrCreator | undefined;
    checkpoint: FileCheckpointStore;
}
export interface CliDeps {
    deps: BeastLoopDeps;
    cliLlmAdapter: CliLlmAdapter;
    observerBridge: CliObserverBridge;
    logger: BeastLogger;
    finalize: () => Promise<void>;
    issueDeps?: IssueCliDeps | undefined;
}
export declare function createCliDeps(options: CliDepOptions): Promise<CliDeps>;
//# sourceMappingURL=dep-factory.d.ts.map