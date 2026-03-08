import type { InterviewIO } from '../planning/interview-loop.js';
/**
 * Detects the current git branch.
 * Returns undefined if not in a git repo.
 */
export declare function detectCurrentBranch(workingDir: string): string | undefined;
/**
 * Resolves the base branch to use for git isolation.
 *
 * 1. If --base-branch flag provided, use it (no prompt).
 * 2. If current branch is 'main' or 'master', use it silently.
 * 3. Otherwise, prompt user for confirmation.
 */
export declare function resolveBaseBranch(workingDir: string, cliOverride: string | undefined, io: InterviewIO): Promise<string>;
//# sourceMappingURL=base-branch.d.ts.map