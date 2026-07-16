#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const NODE_RANGE = '>=22.13.0 <23 || >=24.0.0 <26';
const EXPECTED_GIT_USER = 'David Mendez';
const EXPECTED_GIT_EMAIL = 'me@davidmendez.dev';

function parseArgs(argv) {
  const options = {
    json: false,
    skipGithubAuth: false,
    root: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--skip-github-auth') {
      options.skipGithubAuth = true;
      continue;
    }
    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value) throw new Error('--root requires a path');
      options.root = value;
      i += 1;
      continue;
    }
    if (arg?.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (!value) throw new Error('--root requires a path');
      options.root = value;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.info(`Usage: npm run new-worker:preflight -- [--json] [--skip-github-auth] [--root <path>]

Checks a fresh issue worker environment before coding:
  - supported Node.js runtime (${NODE_RANGE})
  - npm version matches the root packageManager pin
  - git, gh, and jq are available
  - GitHub CLI is authenticated unless --skip-github-auth is set
  - git user.name/user.email match the project worker identity
  - command is running inside a Frankenbeast checkout

Human output uses stable badges: [new-worker-preflight:<check-id>] ok|warn|fail - detail.
JSON output is { ok, checks: [{ id, status, detail, action? }] }.`);
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  return {
    status: result.status,
    error: result.error,
    stdout,
    stderr,
    ok: !result.error && result.status === 0,
    detail: result.error?.message ?? stderr ?? stdout,
  };
}

function nodeMeetsRange(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return (major === 22 && (minor > 13 || (minor === 13 && patch >= 0)))
    || (major >= 24 && major < 26);
}

function rootManifest(root) {
  try {
    return JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
  } catch {
    return undefined;
  }
}

function packageManagerNpmVersion(root) {
  const manifest = rootManifest(root);
  return typeof manifest?.packageManager === 'string'
    ? manifest.packageManager.match(/^npm@(\d+\.\d+\.\d+)$/u)?.[1]
    : undefined;
}

function commandVersion(command, args = ['--version']) {
  const result = run(command, args);
  return result.ok
    ? { id: `${command}-command`, status: 'ok', detail: `${command} available: ${result.stdout.split(/\r?\n/u)[0]}` }
    : { id: `${command}-command`, status: 'fail', detail: `${command} is not available`, action: `Install ${command} and ensure it is on PATH. ${result.detail}` };
}

function preflight(options) {
  const checks = [];

  checks.push(nodeMeetsRange(process.versions.node)
    ? { id: 'node-version', status: 'ok', detail: `Node.js v${process.versions.node} satisfies ${NODE_RANGE}` }
    : { id: 'node-version', status: 'fail', detail: `Node.js v${process.versions.node} does not satisfy ${NODE_RANGE}`, action: 'Install the version in .nvmrc or another supported Node.js release before taking a worker card.' });

  const expectedNpm = packageManagerNpmVersion(options.root);
  const npmVersion = run('npm', ['--version'], { cwd: options.root });
  if (!expectedNpm) {
    checks.push({ id: 'npm-package-manager', status: 'fail', detail: 'root package.json is missing packageManager npm@x.y.z', action: 'Run from the Frankenbeast repository root or restore the packageManager field.' });
  } else if (!npmVersion.ok) {
    checks.push({ id: 'npm-package-manager', status: 'fail', detail: 'npm is not available', action: `Activate Corepack npm@${expectedNpm}. ${npmVersion.detail}` });
  } else if (npmVersion.stdout !== expectedNpm) {
    checks.push({ id: 'npm-package-manager', status: 'fail', detail: `expected npm ${expectedNpm}, found ${npmVersion.stdout}`, action: `Run: corepack enable npm && corepack prepare npm@${expectedNpm} --activate` });
  } else {
    checks.push({ id: 'npm-package-manager', status: 'ok', detail: `npm ${npmVersion.stdout} matches packageManager` });
  }

  checks.push(commandVersion('git'));
  checks.push(commandVersion('gh'));
  checks.push(commandVersion('jq'));

  const repoRoot = run('git', ['rev-parse', '--show-toplevel'], { cwd: options.root });
  if (!repoRoot.ok) {
    checks.push({ id: 'repository-root', status: 'fail', detail: 'not inside a git checkout', action: 'Clone djm204/frankenbeast and run this command from the repository root or issue worktree.' });
  } else if (!existsSync(`${repoRoot.stdout}/package.json`) || rootManifest(repoRoot.stdout)?.name !== 'frankenbeast') {
    checks.push({ id: 'repository-root', status: 'fail', detail: `${repoRoot.stdout} is not the Frankenbeast repository root`, action: 'Run from the Frankenbeast repository root or an isolated issue worktree.' });
  } else {
    checks.push({ id: 'repository-root', status: 'ok', detail: repoRoot.stdout });
  }

  const gitName = run('git', ['config', 'user.name'], { cwd: options.root });
  const gitEmail = run('git', ['config', 'user.email'], { cwd: options.root });
  if (gitName.stdout === EXPECTED_GIT_USER && gitEmail.stdout === EXPECTED_GIT_EMAIL) {
    checks.push({ id: 'git-identity', status: 'ok', detail: `${EXPECTED_GIT_USER} <${EXPECTED_GIT_EMAIL}>` });
  } else {
    checks.push({ id: 'git-identity', status: 'fail', detail: `found ${gitName.stdout || '<unset>'} <${gitEmail.stdout || '<unset>'}>`, action: `Run: git config user.name '${EXPECTED_GIT_USER}' && git config user.email '${EXPECTED_GIT_EMAIL}'` });
  }

  if (options.skipGithubAuth) {
    checks.push({ id: 'github-auth', status: 'warn', detail: 'skipped by --skip-github-auth', action: 'Run without --skip-github-auth before opening PRs or reading private issues.' });
  } else {
    const auth = run('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd: options.root });
    checks.push(auth.ok
      ? { id: 'github-auth', status: 'ok', detail: 'gh auth status succeeded' }
      : { id: 'github-auth', status: 'fail', detail: 'gh auth status failed', action: `Run: gh auth login. ${auth.detail}` });
  }

  const status = run('git', ['status', '--porcelain'], { cwd: options.root });
  if (!status.ok) {
    checks.push({ id: 'worktree-clean', status: 'fail', detail: 'unable to read git worktree status', action: `Repair the git checkout or start from a fresh isolated worktree. ${status.detail}` });
  } else if (status.stdout.length > 0) {
    checks.push({ id: 'worktree-clean', status: 'warn', detail: 'worktree has uncommitted files', action: 'Start each issue from a fresh isolated worktree, or intentionally continue the existing scoped branch.' });
  } else {
    checks.push({ id: 'worktree-clean', status: 'ok', detail: 'worktree is clean' });
  }

  return { ok: checks.every((check) => check.status !== 'fail'), checks };
}

function printHuman(report) {
  for (const check of report.checks) {
    const suffix = check.action ? ` Action: ${check.action}` : '';
    console.info(`[new-worker-preflight:${check.id}] ${check.status} - ${check.detail}${suffix}`);
  }
  console.info(report.ok
    ? 'New-worker preflight passed. Environment is ready for an issue worktree.'
    : 'New-worker preflight failed. Fix failed checks before taking or continuing an issue worker card.');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = preflight(options);
  if (options.json) {
    console.info(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`new-worker preflight failed before checks: ${message}`);
  process.exit(2);
}
