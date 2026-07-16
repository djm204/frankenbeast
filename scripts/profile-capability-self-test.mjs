#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_GIT_USER = 'David Mendez';
const DEFAULT_GIT_EMAIL = 'me@davidmendez.dev';
const WRITE_PERMISSIONS = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  const options = {
    json: false,
    root: process.cwd(),
    profile: undefined,
    provider: undefined,
    model: undefined,
    actualProvider: process.env.HERMES_PROVIDER,
    actualModel: process.env.HERMES_MODEL,
    requiredToolsets: [],
    repo: undefined,
    requireRepoWrite: false,
    skipGithubAuth: false,
    gitUser: DEFAULT_GIT_USER,
    gitEmail: DEFAULT_GIT_EMAIL,
    approvalCop: undefined,
    deliveryTargets: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--root') {
      options.root = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--root=')) {
      options.root = arg.slice('--root='.length);
    } else if (arg === '--profile') {
      options.profile = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length);
    } else if (arg === '--provider') {
      options.provider = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length);
    } else if (arg === '--model') {
      options.model = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg === '--actual-provider') {
      options.actualProvider = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--actual-provider=')) {
      options.actualProvider = arg.slice('--actual-provider='.length);
    } else if (arg === '--actual-model') {
      options.actualModel = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--actual-model=')) {
      options.actualModel = arg.slice('--actual-model='.length);
    } else if (arg === '--toolset') {
      options.requiredToolsets.push(...splitList(readValue(argv, i, arg)));
      i += 1;
    } else if (arg?.startsWith('--toolset=')) {
      options.requiredToolsets.push(...splitList(arg.slice('--toolset='.length)));
    } else if (arg === '--repo') {
      options.repo = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length);
    } else if (arg === '--require-repo-write') {
      options.requireRepoWrite = true;
    } else if (arg === '--skip-github-auth') {
      options.skipGithubAuth = true;
    } else if (arg === '--git-user') {
      options.gitUser = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--git-user=')) {
      options.gitUser = arg.slice('--git-user='.length);
    } else if (arg === '--git-email') {
      options.gitEmail = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--git-email=')) {
      options.gitEmail = arg.slice('--git-email='.length);
    } else if (arg === '--approval-cop') {
      options.approvalCop = readValue(argv, i, arg);
      i += 1;
    } else if (arg?.startsWith('--approval-cop=')) {
      options.approvalCop = arg.slice('--approval-cop='.length);
    } else if (arg === '--delivery-target') {
      options.deliveryTargets.push(...splitList(readValue(argv, i, arg)));
      i += 1;
    } else if (arg?.startsWith('--delivery-target=')) {
      options.deliveryTargets.push(...splitList(arg.slice('--delivery-target='.length)));
    } else if (arg === '--expect') {
      Object.assign(options, readExpectationFile(readValue(argv, i, arg)));
      i += 1;
    } else if (arg?.startsWith('--expect=')) {
      Object.assign(options, readExpectationFile(arg.slice('--expect='.length)));
    } else if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readExpectationFile(path) {
  const value = JSON.parse(readFileSync(resolve(path), 'utf8'));
  return {
    profile: value.profile,
    provider: value.provider,
    model: value.model,
    requiredToolsets: value.requiredToolsets ?? value.toolsets ?? [],
    repo: value.repo,
    requireRepoWrite: Boolean(value.requireRepoWrite),
    gitUser: value.gitIdentity?.name ?? value.gitUser ?? DEFAULT_GIT_USER,
    gitEmail: value.gitIdentity?.email ?? value.gitEmail ?? DEFAULT_GIT_EMAIL,
    approvalCop: value.approvalCop,
    deliveryTargets: value.deliveryTargets ?? [],
  };
}

function printUsage() {
  console.info(`Usage: npm run profile:capability-self-test -- [--json] [--expect profile-capabilities.json]
       [--profile LABEL] [--provider PROVIDER] [--model MODEL]
       [--toolset terminal,file] [--repo owner/name] [--require-repo-write]
       [--approval-cop approval-cop] [--delivery-target discord:channel]

Runs a read-only capability self-test for an agent profile. It checks expected
model/provider labels, required toolsets, gh auth, git identity, optional repo
write permission, approval-cop route, and delivery target wiring.

JSON output is { ok, profile, checks: [{ id, status, detail, action? }] }.`);
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  return {
    status: result.status,
    error: result.error,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    ok: !result.error && result.status === 0,
    detail: result.error?.message ?? result.stderr?.trim() ?? result.stdout?.trim() ?? '',
  };
}

function checkLabel(id, label, expected, actual, envName) {
  if (!expected) {
    return { id, status: 'warn', detail: `no expected ${label} configured`, action: `Pass --${label} or include ${label} in the expectation schema.` };
  }
  if (actual === expected) {
    return { id, status: 'ok', detail: `${label} ${actual}` };
  }
  return {
    id,
    status: 'fail',
    detail: `expected ${label} ${expected}, found ${actual || '<unset>'}`,
    action: `Set ${envName} or pass --actual-${label} from the profile runtime before dispatching work.`,
  };
}

function checkToolsets(required) {
  if (required.length === 0) {
    return { id: 'required-toolsets', status: 'warn', detail: 'no required toolsets configured', action: 'Pass --toolset or include requiredToolsets in the expectation schema.' };
  }
  const actual = new Set(splitList(process.env.HERMES_ENABLED_TOOLSETS || process.env.HERMES_TOOLSETS || process.env.HERMES_TOOLS));
  const missing = required.filter((toolset) => !actual.has(toolset));
  return missing.length === 0
    ? { id: 'required-toolsets', status: 'ok', detail: `available: ${required.join(', ')}` }
    : { id: 'required-toolsets', status: 'fail', detail: `missing: ${missing.join(', ')}; available: ${[...actual].join(', ') || '<none>'}`, action: 'Enable the required Hermes toolsets for this profile before dispatching the card.' };
}

function checkRepositoryRoot(root) {
  const repoRoot = run('git', ['rev-parse', '--show-toplevel'], { cwd: root });
  if (!repoRoot.ok) {
    return { id: 'repository-root', status: 'fail', detail: 'not inside a git checkout', action: 'Run from a Frankenbeast checkout or pass --root.' };
  }
  return existsSync(resolve(repoRoot.stdout, 'package.json'))
    ? { id: 'repository-root', status: 'ok', detail: repoRoot.stdout }
    : { id: 'repository-root', status: 'fail', detail: `${repoRoot.stdout} has no package.json`, action: 'Run from the repository root or an isolated issue worktree.' };
}

function checkGitIdentity(root, expectedUser, expectedEmail) {
  const name = run('git', ['config', 'user.name'], { cwd: root }).stdout;
  const email = run('git', ['config', 'user.email'], { cwd: root }).stdout;
  return name === expectedUser && email === expectedEmail
    ? { id: 'git-identity', status: 'ok', detail: `${expectedUser} <${expectedEmail}>` }
    : { id: 'git-identity', status: 'fail', detail: `expected ${expectedUser} <${expectedEmail}>, found ${name || '<unset>'} <${email || '<unset>'}>`, action: `Run: git config user.name '${expectedUser}' && git config user.email '${expectedEmail}'` };
}

function checkGithubAuth(root, skip) {
  if (skip) {
    return { id: 'github-auth', status: 'warn', detail: 'skipped by --skip-github-auth', action: 'Run without --skip-github-auth before opening PRs or reading private issues.' };
  }
  const result = run('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd: root });
  return result.ok
    ? { id: 'github-auth', status: 'ok', detail: 'gh auth status succeeded' }
    : { id: 'github-auth', status: 'fail', detail: 'gh auth status failed', action: `Run: gh auth login. ${result.detail}` };
}

function checkRepoWrite(root, repo, required) {
  if (!required) {
    return { id: 'repo-write-access', status: 'warn', detail: 'not required by schema', action: 'Pass --require-repo-write for workers that must push branches or open PRs.' };
  }
  if (!repo) {
    return { id: 'repo-write-access', status: 'fail', detail: 'repo write access required but no repo configured', action: 'Pass --repo owner/name.' };
  }
  const result = run('gh', ['repo', 'view', repo, '--json', 'viewerPermission'], { cwd: root });
  if (!result.ok) {
    return { id: 'repo-write-access', status: 'fail', detail: 'unable to read viewerPermission via gh repo view', action: `Verify gh auth and repo access. ${result.detail}` };
  }
  try {
    const permission = JSON.parse(result.stdout).viewerPermission;
    return WRITE_PERMISSIONS.has(permission)
      ? { id: 'repo-write-access', status: 'ok', detail: `viewerPermission=${permission}` }
      : { id: 'repo-write-access', status: 'fail', detail: `viewerPermission=${permission || '<unknown>'}`, action: `Grant write access to ${repo} before assigning PR-producing work.` };
  } catch (error) {
    return { id: 'repo-write-access', status: 'fail', detail: `could not parse gh repo view output: ${error instanceof Error ? error.message : String(error)}`, action: 'Retry after updating gh or inspect the repository permissions manually.' };
  }
}

function checkApprovalCop(command) {
  if (!command) {
    return { id: 'approval-cop-route', status: 'warn', detail: 'no approval-cop route required by schema', action: 'Pass --approval-cop for profiles that need approval-gated side effects.' };
  }
  const result = run(command, ['--help']);
  return result.ok
    ? { id: 'approval-cop-route', status: 'ok', detail: `${command} is available` }
    : { id: 'approval-cop-route', status: 'fail', detail: `${command} is not available`, action: `Install or expose ${command} on PATH for this profile. ${result.detail}` };
}

function checkDeliveryTargets(required) {
  if (required.length === 0) {
    return { id: 'delivery-targets', status: 'warn', detail: 'no delivery targets required by schema', action: 'Pass --delivery-target for profiles that must report to Discord/Telegram/etc.' };
  }
  const actual = new Set(splitList(process.env.HERMES_DELIVER_TARGETS || process.env.HERMES_DELIVERY_TARGETS || process.env.HERMES_DELIVER));
  const missing = required.filter((target) => !actual.has(target));
  return missing.length === 0
    ? { id: 'delivery-targets', status: 'ok', detail: `available: ${required.join(', ')}` }
    : { id: 'delivery-targets', status: 'fail', detail: `missing: ${missing.join(', ')}; available: ${[...actual].join(', ') || '<none>'}`, action: 'Configure the profile gateway delivery target before dispatching reporting work.' };
}

function buildReport(options) {
  const root = resolve(options.root);
  const checks = [
    checkLabel('provider-label', 'provider', options.provider, options.actualProvider, 'HERMES_PROVIDER'),
    checkLabel('model-label', 'model', options.model, options.actualModel, 'HERMES_MODEL'),
    checkToolsets(options.requiredToolsets),
    checkRepositoryRoot(root),
    checkGitIdentity(root, options.gitUser, options.gitEmail),
    checkGithubAuth(root, options.skipGithubAuth),
    checkRepoWrite(root, options.repo, options.requireRepoWrite),
    checkApprovalCop(options.approvalCop),
    checkDeliveryTargets(options.deliveryTargets),
  ];
  return {
    ok: checks.every((check) => check.status !== 'fail'),
    profile: options.profile ?? process.env.HERMES_PROFILE ?? '<unknown>',
    checks,
  };
}

function printHuman(report) {
  for (const check of report.checks) {
    const suffix = check.action ? ` Action: ${check.action}` : '';
    console.info(`[profile-capability-self-test:${check.id}] ${check.status} - ${check.detail}${suffix}`);
  }
  console.info(report.ok
    ? 'Profile capability self-test passed. Profile is ready for matching worker assignments.'
    : 'Profile capability self-test failed. Fix failed checks before dispatching matching worker assignments.');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  if (options.json) {
    console.info(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`profile capability self-test failed before checks: ${message}`);
  process.exit(2);
}
