import { execSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GitIsolationConfig, MergeResult } from './cli-types.js';

const SAFE_ID = /^[a-zA-Z0-9_\-./]+$/;

// Directories whose contents are always regenerable build artifacts.
// Files here can be safely removed to unblock a git checkout.
const EXPENDABLE_DIRS = ['.build'];

function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Unsafe chunkId: "${id}"`);
  }
}

/**
 * Parse git checkout error to extract conflicting file paths.
 * Git outputs lines like:
 *   "error: The following untracked working tree files would be overwritten by checkout:"
 *   "\tpath/to/file"
 */
function parseConflictingFiles(stderr: string): string[] {
  const lines = stderr.split('\n');
  return lines
    .map(l => l.trim())
    .filter(l => l.startsWith('\t') || (l.length > 0 && !l.startsWith('error:') && !l.startsWith('Please ') && !l.startsWith('Aborting') && !l.startsWith('hint:')))
    .map(l => l.replace(/^\t/, ''));
}

/**
 * Check if a file path is inside an expendable directory.
 */
function isExpendable(filePath: string): boolean {
  const parts = filePath.split('/');
  return parts.some(part => EXPENDABLE_DIRS.includes(part));
}

/**
 * Parse `git status --porcelain` output and return submodule paths that have
 * modified content. Porcelain format for dirty submodules:
 *   " m franken-orchestrator"  (space + m = modified content in submodule)
 * Note: the leading space may be stripped if the output was trimmed (e.g. by
 * execSync().trim()), so we also match "m " at the start of a line.
 */
export function parseDirtySubmodules(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter(line => /^ ?m /.test(line))
    .map(line => line.replace(/^ ?m /, '').trim());
}

export class GitBranchIsolator {
  private readonly config: GitIsolationConfig;

  constructor(config: GitIsolationConfig) {
    this.config = config;
  }

  private git(cmd: string): string {
    return execSync(`git ${cmd}`, {
      encoding: 'utf-8',
      cwd: this.config.workingDir,
    }).trim();
  }

  private branchName(chunkId: string): string {
    return `${this.config.branchPrefix}${chunkId}`;
  }

  /**
   * Safe checkout: try normal checkout first. On failure, parse the error
   * to identify conflicting files. If ALL are expendable (.build/ artifacts),
   * remove them and retry. If any real file conflicts, re-throw.
   */
  private safeCheckout(target: string): void {
    try {
      this.git(`checkout ${target}`);
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err);
      const conflicts = parseConflictingFiles(stderr);

      if (conflicts.length === 0 || !conflicts.every(isExpendable)) {
        throw err; // Real conflict — don't swallow it
      }

      // All conflicting files are expendable — remove and retry
      for (const file of conflicts) {
        try { unlinkSync(resolve(this.config.workingDir, file)); } catch { /* already gone */ }
      }
      this.git(`checkout ${target}`);
    }
  }

  isolate(chunkId: string): void {
    assertSafeId(chunkId);
    const branch = this.branchName(chunkId);
    this.ensureBranch(this.config.baseBranch);
    const exists = this.git(`branch --list ${branch}`);
    if (exists.length > 0) {
      this.safeCheckout(branch);
      return;
    }
    this.git(`checkout -b ${branch}`);
  }

  /**
   * Ensure a branch exists and check it out.
   * If the branch doesn't exist locally, create it from current HEAD.
   */
  private ensureBranch(branchName: string): void {
    const exists = this.git(`branch --list ${branchName}`);
    if (exists.length === 0) {
      this.git(`checkout -b ${branchName}`);
      return;
    }
    try {
      this.safeCheckout(branchName);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('resolve your current index') || msg.includes('Unmerged')) {
        this.abortMerge();
        this.safeCheckout(branchName);
      } else {
        throw err;
      }
    }
  }

  autoCommit(chunkId: string, stage: string, iteration: number): boolean {
    assertSafeId(chunkId);
    assertSafeId(stage);
    const status = this.git('status --porcelain');
    if (status.length === 0) return false;
    try {
      const msg = `auto: ${stage} ${chunkId} iter ${iteration}`;
      this.commitDirtySubmodules(status, msg);
      this.git('add -A');
      this.git(`commit -m "${msg}"`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect submodules with dirty content and commit inside them before
   * the root repo commit. Without this, `git add -A` from the root only
   * stages the gitlink pointer update, orphaning the actual file changes
   * inside the submodule's working directory.
   */
  private commitDirtySubmodules(porcelainStatus: string, message: string): void {
    const dirtySubmodules = parseDirtySubmodules(porcelainStatus);
    for (const sub of dirtySubmodules) {
      try {
        execSync(`git add -A`, {
          encoding: 'utf-8',
          cwd: resolve(this.config.workingDir, sub),
        });
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          cwd: resolve(this.config.workingDir, sub),
        });
      } catch {
        // Submodule commit failed (nothing to commit, etc.) — continue
      }
    }
  }

  merge(chunkId: string, commitMessage?: string): MergeResult {
    assertSafeId(chunkId);
    const branch = this.branchName(chunkId);
    const count = parseInt(
      this.git(`rev-list --count ${this.config.baseBranch}..${branch}`),
      10,
    ) || 0;

    if (count === 0) {
      return { merged: false, commits: 0 };
    }

    this.safeCheckout(this.config.baseBranch);
    try {
      if (commitMessage) {
        const safeMsg = commitMessage.replace(/"/g, '\\"');
        this.git(`merge --squash ${branch}`);
        this.git(`commit -m "${safeMsg}"`);
      } else {
        this.git(`merge ${branch} --no-edit`);
      }
      return { merged: true, commits: count };
    } catch {
      // Check if this is a merge conflict (files with unresolved markers)
      const conflictFiles = this.getConflictedFiles();
      if (conflictFiles.length > 0) {
        // Leave conflicts in place for caller to resolve via LLM
        return { merged: false, commits: count, conflicted: true, conflictFiles };
      }
      // Not a conflict — some other git error. Abort and report.
      this.abortMerge();
      return { merged: false, commits: count };
    }
  }

  getConflictedFiles(): string[] {
    try {
      const output = this.git('diff --name-only --diff-filter=U');
      return output.split('\n').filter(f => f.length > 0);
    } catch {
      return [];
    }
  }

  getConflictDiff(): string {
    return this.git('diff');
  }

  completeMerge(commitMessage: string): void {
    const safeMsg = commitMessage.replace(/"/g, '\\"');
    this.git('add -A');
    this.git(`commit -m "${safeMsg}"`);
  }

  abortMerge(): void {
    try {
      this.git('merge --abort');
    } catch {
      // MERGE_HEAD may be missing — force-clean the index
      this.git('reset --hard HEAD');
    }
  }

  hasMeaningfulChange(previousHead: string): boolean {
    const status = this.git('status --porcelain');
    if (status.length > 0) return true;
    const head = this.git('rev-parse HEAD');
    return head !== previousHead;
  }

  getCurrentHead(): string {
    return this.git('rev-parse HEAD');
  }

  getDiffStat(chunkId: string): string {
    assertSafeId(chunkId);
    const branch = this.branchName(chunkId);
    return this.git(`diff --stat ${this.config.baseBranch}..${branch}`);
  }

  getStatus(): string {
    return this.git('status --porcelain');
  }

  resetHard(commitHash: string): void {
    this.git(`reset --hard ${commitHash}`);
  }

  getWorkingDir(): string {
    return this.config.workingDir;
  }
}
