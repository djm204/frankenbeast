import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type GitRunner = (args: readonly string[], cwd: string) => string;

export interface GitWorktreeIsolationConfig {
  readonly enabled: boolean;
  readonly projectRoot?: string | undefined;
  readonly worktreesDir?: string | undefined;
  readonly branchPrefix?: string | undefined;
  readonly runGit?: GitRunner | undefined;
}

export interface BeastWorktreeAllocation {
  readonly agentId: string;
  readonly branchName: string;
  readonly projectRoot: string;
  readonly worktreePath: string;
}

const DEFAULT_WORKTREES_DIR = join('.frankenbeast', '.worktrees');
const DEFAULT_BRANCH_PREFIX = 'beast/';

function defaultRunGit(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sanitizeAgentId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/^-+|-+$/g, '');
  return safe.length > 0 ? safe : 'agent';
}

function branchExists(runGit: GitRunner, projectRoot: string, branchName: string): boolean {
  return runGit(['branch', '--list', branchName], projectRoot).length > 0;
}

export function createBeastWorktree(
  config: GitWorktreeIsolationConfig | undefined,
  agentId: string,
  baseCwd: string | undefined,
): BeastWorktreeAllocation | undefined {
  if (!config?.enabled) return undefined;

  const safeAgentId = sanitizeAgentId(agentId);
  const projectRoot = resolve(config.projectRoot ?? baseCwd ?? process.env.FBEAST_ROOT ?? process.cwd());
  const worktreesRoot = resolve(projectRoot, config.worktreesDir ?? DEFAULT_WORKTREES_DIR);
  const worktreePath = join(worktreesRoot, safeAgentId);
  const branchName = `${config.branchPrefix ?? DEFAULT_BRANCH_PREFIX}${safeAgentId}`;
  const runGit = config.runGit ?? defaultRunGit;

  mkdirSync(worktreesRoot, { recursive: true });

  const allocation: BeastWorktreeAllocation = {
    agentId: safeAgentId,
    branchName,
    projectRoot,
    worktreePath,
  };

  if (existsSync(worktreePath)) {
    return allocation;
  }

  if (branchExists(runGit, projectRoot, branchName)) {
    runGit(['worktree', 'add', worktreePath, branchName], projectRoot);
  } else {
    runGit(['worktree', 'add', '-b', branchName, worktreePath], projectRoot);
  }

  return allocation;
}

export function removeBeastWorktree(allocation: BeastWorktreeAllocation, runGit: GitRunner = defaultRunGit): void {
  if (existsSync(allocation.worktreePath)) {
    runGit(['worktree', 'remove', '--force', allocation.worktreePath], allocation.projectRoot);
  }
  if (branchExists(runGit, allocation.projectRoot, allocation.branchName)) {
    runGit(['branch', '-D', allocation.branchName], allocation.projectRoot);
  }
}
