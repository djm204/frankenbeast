import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { TrackedAgent } from '../agent-types.js';
import type { BeastRun } from '../types.js';

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
  readonly branchCreated: boolean;
  readonly created: boolean;
  readonly executionCwd: string;
  readonly gitTopLevel: string;
  readonly projectRoot: string;
  readonly worktreePath: string;
}

export interface GitWorktreeRecord {
  readonly locked?: boolean | undefined;
  readonly path: string;
  readonly branch?: string | undefined;
}

export type BeastWorktreeCleanupReason = 'agent-deleted' | 'no-active-run' | 'orphaned-worktree';

export interface BeastWorktreeCleanupCandidate {
  readonly agentId: string;
  readonly branchName: string;
  readonly lastActivityAt?: string | undefined;
  readonly linkedCard?: string | undefined;
  readonly linkedPr?: string | undefined;
  readonly owner?: string | undefined;
  readonly path: string;
  readonly reason: BeastWorktreeCleanupReason;
}

export interface BeastWorktreeCleanupPlanInput {
  readonly agents: readonly TrackedAgent[];
  readonly branchPrefix?: string | undefined;
  readonly projectRoot: string;
  readonly runs: readonly BeastRun[];
  readonly worktrees: readonly GitWorktreeRecord[];
  readonly worktreesDir?: string | undefined;
}

export interface BeastWorktreeCleanupInput extends Omit<BeastWorktreeCleanupPlanInput, 'worktrees'> {
  readonly dryRun?: boolean | undefined;
  readonly runGit?: GitRunner | undefined;
}

const DEFAULT_WORKTREES_DIR = join('.frankenbeast', '.worktrees');
const DEFAULT_BRANCH_PREFIX = 'beast/';
const ACTIVE_RUN_STATUSES = new Set(['queued', 'interviewing', 'running', 'pending_approval']);

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

function branchNameFromRef(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

export function parseGitWorktreePorcelain(output: string): GitWorktreeRecord[] {
  const records: GitWorktreeRecord[] = [];
  let current: { path?: string; branch?: string | undefined; locked?: boolean | undefined } = {};
  const flush = () => {
    if (current.path) {
      records.push({
        path: current.path,
        ...(current.branch ? { branch: current.branch } : {}),
        ...(current.locked ? { locked: true } : {}),
      });
    }
    current = {};
  };

  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) {
      flush();
      continue;
    }
    const [key, ...rest] = line.split(' ');
    const value = rest.join(' ');
    if (key === 'worktree') current.path = value;
    if (key === 'branch') current.branch = branchNameFromRef(value);
    if (key === 'locked') current.locked = true;
  }
  flush();
  return records;
}

function safeRelativePath(parent: string, child: string): string | undefined {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)
    ? relativePath
    : undefined;
}

function worktreeAgentId(worktreesRoot: string, worktreePath: string): string | undefined {
  const relativePath = safeRelativePath(worktreesRoot, worktreePath);
  if (!relativePath || relativePath.includes('/') || relativePath.includes('\\')) return undefined;
  return relativePath;
}

function isActiveRun(run: BeastRun): boolean {
  return ACTIVE_RUN_STATUSES.has(run.status);
}

function runActivityTime(run: BeastRun): string | undefined {
  return run.lastHeartbeatAt ?? run.finishedAt ?? run.startedAt ?? run.createdAt;
}

function newestTime(values: readonly (string | undefined)[]): string | undefined {
  return values.filter((value): value is string => value !== undefined).sort().at(-1);
}

function metadataString(metadata: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function planAbandonedBeastWorktreeCleanup(
  input: BeastWorktreeCleanupPlanInput,
): BeastWorktreeCleanupCandidate[] {
  const branchPrefix = input.branchPrefix ?? DEFAULT_BRANCH_PREFIX;
  const worktreesRoot = resolve(input.projectRoot, input.worktreesDir ?? DEFAULT_WORKTREES_DIR);
  const agentsById = new Map(input.agents.map((agent) => [agent.id, agent]));
  const runsByAgentId = new Map<string, BeastRun[]>();
  for (const run of input.runs) {
    if (!run.trackedAgentId) continue;
    const runs = runsByAgentId.get(run.trackedAgentId) ?? [];
    runs.push(run);
    runsByAgentId.set(run.trackedAgentId, runs);
  }
  const activeRunAgentIds = new Set(
    input.runs
      .filter((run) => run.trackedAgentId && isActiveRun(run))
      .map((run) => run.trackedAgentId as string),
  );
  return input.worktrees
    .map((worktree): BeastWorktreeCleanupCandidate | undefined => {
      if (!worktree.branch?.startsWith(branchPrefix)) return undefined;
      if (worktree.locked) return undefined;
      const agentId = worktreeAgentId(worktreesRoot, worktree.path);
      if (!agentId) return undefined;
      if (worktree.branch !== `${branchPrefix}${agentId}`) return undefined;
      const agent = agentsById.get(agentId);
      if (activeRunAgentIds.has(agentId)) return undefined;
      const agentRuns = runsByAgentId.get(agentId) ?? [];
      const lastActivityAt = newestTime(agentRuns.map(runActivityTime));
      const latestRun = [...agentRuns].sort((left, right) => runActivityTime(right)?.localeCompare(runActivityTime(left) ?? '') ?? 0)[0];
      const evidence = {
        lastActivityAt,
        linkedCard:
          metadataString(latestRun?.configSnapshot, ['cardId', 'kanbanTaskId', 'taskId']) ??
          metadataString(agent?.initConfig, ['cardId', 'kanbanTaskId', 'taskId']),
        linkedPr:
          metadataString(latestRun?.configSnapshot, ['pr', 'prNumber', 'pullRequest', 'pullRequestNumber']) ??
          metadataString(agent?.initConfig, ['pr', 'prNumber', 'pullRequest', 'pullRequestNumber']),
        owner: agent?.createdByUser ?? agentId,
      };
      if (!agent) {
        return { agentId, branchName: worktree.branch, path: resolve(worktree.path), reason: 'orphaned-worktree', ...evidence };
      }
      if (agent.status === 'deleted') {
        return { agentId, branchName: worktree.branch, path: resolve(worktree.path), reason: 'agent-deleted', ...evidence };
      }
      return undefined;
    })
    .filter((candidate): candidate is BeastWorktreeCleanupCandidate => candidate !== undefined)
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function cleanupAbandonedBeastWorktrees(input: BeastWorktreeCleanupInput): BeastWorktreeCleanupCandidate[] {
  const runGit = input.runGit ?? defaultRunGit;
  if (!isGitRepository(runGit, input.projectRoot)) return [];
  const worktrees = parseGitWorktreePorcelain(runGit(['worktree', 'list', '--porcelain'], input.projectRoot));
  const plan = planAbandonedBeastWorktreeCleanup({ ...input, worktrees });

  if (input.dryRun !== false) return plan;

  const cleaned: BeastWorktreeCleanupCandidate[] = [];
  for (const candidate of plan) {
    try {
      if (runGit(['status', '--porcelain', '--ignored'], candidate.path).length > 0) continue;
      runGit(['worktree', 'remove', '--force', candidate.path], input.projectRoot);
      if (branchExists(runGit, input.projectRoot, candidate.branchName)) {
        runGit(['branch', '-D', candidate.branchName], input.projectRoot);
      }
      cleaned.push(candidate);
    } catch {
      continue;
    }
  }

  return cleaned;
}

function isGitRepository(runGit: GitRunner, projectRoot: string): boolean {
  try {
    return runGit(['rev-parse', '--is-inside-work-tree'], projectRoot) === 'true';
  } catch {
    return false;
  }
}

function gitTopLevel(runGit: GitRunner, projectRoot: string): string {
  return resolve(runGit(['rev-parse', '--show-toplevel'], projectRoot));
}

function isolatedExecutionCwd(gitRoot: string, worktreePath: string, baseCwd: string | undefined): string {
  if (!baseCwd) return worktreePath;
  const resolvedBaseCwd = resolve(baseCwd);
  const relativeBaseCwd = relative(gitRoot, resolvedBaseCwd);
  if (!relativeBaseCwd || relativeBaseCwd.startsWith('..') || isAbsolute(relativeBaseCwd)) {
    return worktreePath;
  }
  return join(worktreePath, relativeBaseCwd);
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

  if (!isGitRepository(runGit, projectRoot)) return undefined;
  const root = gitTopLevel(runGit, projectRoot);

  mkdirSync(worktreesRoot, { recursive: true });
  const alreadyExists = existsSync(worktreePath);
  const branchAlreadyExists = branchExists(runGit, projectRoot, branchName);

  const allocation: BeastWorktreeAllocation = {
    agentId: safeAgentId,
    branchName,
    branchCreated: !alreadyExists && !branchAlreadyExists,
    created: !alreadyExists,
    executionCwd: isolatedExecutionCwd(root, worktreePath, baseCwd),
    gitTopLevel: root,
    projectRoot,
    worktreePath,
  };

  if (alreadyExists) {
    return allocation;
  }

  if (branchAlreadyExists) {
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
  if (allocation.branchCreated && branchExists(runGit, allocation.projectRoot, allocation.branchName)) {
    runGit(['branch', '-D', allocation.branchName], allocation.projectRoot);
  }
}
