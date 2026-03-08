import type { GitIsolationConfig, MergeResult } from './cli-types.js';
/**
 * Parse `git status --porcelain` output and return submodule paths that have
 * modified content. Porcelain format for dirty submodules:
 *   " m franken-orchestrator"  (space + m = modified content in submodule)
 * Note: the leading space may be stripped if the output was trimmed (e.g. by
 * execSync().trim()), so we also match "m " at the start of a line.
 */
export declare function parseDirtySubmodules(porcelain: string): string[];
export declare class GitBranchIsolator {
    private readonly config;
    constructor(config: GitIsolationConfig);
    private git;
    private branchName;
    /**
     * Safe checkout: try normal checkout first. On failure, parse the error
     * to identify conflicting files. If ALL are expendable (.build/ artifacts),
     * remove them and retry. If any real file conflicts, re-throw.
     */
    private safeCheckout;
    isolate(chunkId: string): void;
    /**
     * Ensure a branch exists and check it out.
     * If the branch doesn't exist locally, create it from current HEAD.
     */
    private ensureBranch;
    autoCommit(chunkId: string, stage: string, iteration: number): boolean;
    /**
     * Detect submodules with dirty content and commit inside them before
     * the root repo commit. Without this, `git add -A` from the root only
     * stages the gitlink pointer update, orphaning the actual file changes
     * inside the submodule's working directory.
     */
    private commitDirtySubmodules;
    merge(chunkId: string, commitMessage?: string): MergeResult;
    getConflictedFiles(): string[];
    getConflictDiff(): string;
    completeMerge(commitMessage: string): void;
    abortMerge(): void;
    hasMeaningfulChange(previousHead: string): boolean;
    getCurrentHead(): string;
    getDiffStat(chunkId: string): string;
    getStatus(): string;
    resetHard(commitHash: string): void;
    getWorkingDir(): string;
}
//# sourceMappingURL=git-branch-isolator.d.ts.map