#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { verifyExternalHelperInvocation } from './lib/external-helper-allowlist.mjs';

const DEFAULT_REPO = 'djm204/frankenbeast';
const DEFAULT_REMOTE = 'origin';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_WORKTREE_ROOT = '../resolve-wt';

export function slugifyTitle(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-{2,}/gu, '-');

  return slug || 'issue-worktree';
}

export function parseIssueNumber(value) {
  const text = String(value ?? '').trim().replace(/^#/u, '');
  if (!/^\d+$/u.test(text)) {
    throw new Error('Issue number must be a positive integer, optionally prefixed with #.');
  }
  const issue = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(issue) || issue <= 0) {
    throw new Error('Issue number must be a positive integer.');
  }
  return issue;
}

export function buildIssueWorktreePlan(options) {
  const issue = parseIssueNumber(options.issue);
  const titleSlug = slugifyTitle(options.title ?? `issue-${issue}`).slice(0, 96).replace(/-+$/u, '') || 'issue-worktree';
  const branch = options.branch ?? `resolve/issue-${issue}-${titleSlug}`;
  const remote = options.remote ?? DEFAULT_REMOTE;
  const base = options.base ?? `${remote}/${DEFAULT_BASE_BRANCH}`;
  const repo = options.repo ?? DEFAULT_REPO;
  const worktreeRoot = options.worktreeRoot ?? DEFAULT_WORKTREE_ROOT;
  const worktreePath = resolve(options.cwd ?? process.cwd(), worktreeRoot, `issue-${issue}`);
  const reuse = Boolean(options.reuse);

  if (!/^[A-Za-z0-9_.-]+$/u.test(remote)) {
    throw new Error(`Unsafe remote name: ${remote}`);
  }
  if (!/^[-./A-Za-z0-9_]+$/u.test(base) || base.includes('..') || base.startsWith('-') || base.endsWith('/')) {
    throw new Error(`Unsafe base ref: ${base}`);
  }
  if (!/^[-./A-Za-z0-9_]+$/u.test(branch) || branch.includes('..') || branch.startsWith('-') || branch.endsWith('/')) {
    throw new Error(`Unsafe branch name for issue #${issue}: ${branch}`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) {
    throw new Error(`Repository must be OWNER/REPO, got: ${repo}`);
  }

  const preflight = [
    ['git', 'rev-parse', '--is-inside-work-tree'],
    ['git', 'fetch', remote, base.replace(new RegExp(`^${remote}/`, 'u'), '')],
    ['git', 'fetch', remote, `+refs/heads/*:refs/remotes/${remote}/*`],
  ];
  const duplicateChecks = [
    ['gh', 'pr', 'list', '--repo', repo, '--state', 'open', '--search', `${issue} in:body`, '--json', 'number,title,headRefName,url'],
    ['git', 'branch', '--all', '--list', branch, `remotes/${remote}/${branch}`],
  ];
  const create = reuse
    ? [['git', 'worktree', 'add', worktreePath, branch]]
    : [['git', 'worktree', 'add', '-b', branch, worktreePath, base]];
  const verify = [
    ['git', '-C', worktreePath, 'status', '--short', '--branch'],
    ['git', '-C', worktreePath, 'config', 'extensions.worktreeConfig', 'true'],
    ['git', '-C', worktreePath, 'config', '--worktree', 'user.name', 'David Mendez'],
    ['git', '-C', worktreePath, 'config', '--worktree', 'user.email', 'me@davidmendez.dev'],
  ];

  return {
    issue,
    titleSlug,
    repo,
    branch,
    remote,
    base,
    worktreePath,
    reuse,
    commands: {
      preflight,
      duplicateChecks,
      create,
      verify,
    },
  };
}

function quote(arg) {
  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(arg)) return arg;
  return `'${arg.replace(/'/gu, `'"'"'`)}'`;
}

function formatCommand(command) {
  return command.map((arg) => quote(String(arg))).join(' ');
}

async function runCommand(command, cwd) {
  await verifyExternalHelperInvocation({
    helperId: 'issue-worktree-bootstrap',
    command,
    repoRoot: cwd,
  });
  const result = spawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`Command failed (${formatCommand(command)}): ${detail}`);
  }
  return result.stdout.trim();
}

export function findConflictingIssuePrs(plan, openPrs) {
  if (!Array.isArray(openPrs)) return [];
  return plan.reuse
    ? openPrs.filter((pr) => pr.headRefName !== plan.branch)
    : openPrs;
}

async function assertNoDuplicateIssueWork(plan) {
  const [openPrCommand, branchCommand] = plan.commands.duplicateChecks;
  const openPrOutput = await runCommand(openPrCommand, process.cwd());
  const openPrs = JSON.parse(openPrOutput || '[]');
  const conflictingPrs = findConflictingIssuePrs(plan, openPrs);
  if (conflictingPrs.length > 0) {
    const summary = conflictingPrs
      .map((pr) => `#${pr.number ?? '?'} ${pr.headRefName ?? ''} ${pr.url ?? ''}`.trim())
      .join('; ');
    throw new Error(`Issue #${plan.issue} already appears in an open PR: ${summary}`);
  }

  const existingBranches = await runCommand(branchCommand, process.cwd());
  if (existingBranches && !plan.reuse) {
    throw new Error(`Branch already exists for issue #${plan.issue}: ${plan.branch}. Use --reuse to attach a worktree to it.`);
  }
}

export function renderPlan(plan) {
  return [
    `Issue: #${plan.issue}`,
    `Repository: ${plan.repo}`,
    `Branch: ${plan.branch}`,
    `Worktree: ${plan.worktreePath}`,
    `Base: ${plan.base}`,
    `Reuse existing branch: ${plan.reuse ? 'yes' : 'no'}`,
    '',
    'Commands:',
    ...Object.entries(plan.commands).flatMap(([section, commands]) => [
      `## ${section}`,
      ...commands.map((command) => formatCommand(command)),
    ]),
  ].join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--issue': options.issue = readValue(); break;
      case '--title': options.title = readValue(); break;
      case '--repo': options.repo = readValue(); break;
      case '--branch': options.branch = readValue(); break;
      case '--base': options.base = readValue(); break;
      case '--remote': options.remote = readValue(); break;
      case '--worktree-root': options.worktreeRoot = readValue(); break;
      case '--reuse': options.reuse = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--json': options.json = true; break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/issue-worktree-bootstrap.mjs --issue <number> --title <issue title> [options]\n\nCreates a deterministic issue branch/worktree for one-issue/one-PR workers.\n\nOptions:\n  --dry-run               Print planned commands without executing them.\n  --json                  Print structured JSON instead of human text.\n  --repo OWNER/REPO       Repository used for duplicate-PR checks (default: ${DEFAULT_REPO}).\n  --branch NAME           Override generated branch name.\n  --base REF              Base ref for new worktrees (default: <remote>/${DEFAULT_BASE_BRANCH}).\n  --remote NAME           Git remote to fetch (default: ${DEFAULT_REMOTE}).\n  --worktree-root PATH    Directory that receives issue-<number> (default: ${DEFAULT_WORKTREE_ROOT}).\n  --reuse                 Add a worktree for an existing local branch instead of creating a branch.\n  -h, --help              Show this help.\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const plan = buildIssueWorktreePlan({ ...options, cwd: process.cwd() });
    if (options.dryRun) {
      if (options.json) {
        console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2));
      } else {
        console.log(renderPlan(plan));
      }
      return;
    }
    if (!options.json) {
      console.log(renderPlan(plan));
    }

    if (existsSync(plan.worktreePath) && !plan.reuse) {
      throw new Error(`Refusing to overwrite existing worktree path: ${plan.worktreePath}. Use --reuse only for an existing branch.`);
    }
    mkdirSync(resolve(plan.worktreePath, '..'), { recursive: true });

    for (const command of plan.commands.preflight) await runCommand(command, process.cwd());
    await assertNoDuplicateIssueWork(plan);
    for (const command of plan.commands.create) await runCommand(command, process.cwd());
    for (const command of plan.commands.verify) await runCommand(command, process.cwd());
    if (options.json) {
      console.log(JSON.stringify({ status: 'ready', dryRun: false, ...plan }, null, 2));
    } else {
      console.log(`[issue-worktree] ready: ${plan.worktreePath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[issue-worktree] ERROR: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
