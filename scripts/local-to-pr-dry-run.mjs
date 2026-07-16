#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { buildIssueWorktreePlan, slugifyTitle } from './issue-worktree-bootstrap.mjs';

const DEFAULT_REPO = 'djm204/frankenbeast';
const DEFAULT_ISSUE_TITLE = 'local-to-PR dry run rehearsal';
const NODE_RANGE = '>=22.13.0 <23 || >=24.0.0 <26';

function usage() {
  console.info(`Usage: npm run local-to-pr:dry-run -- --issue <number> --title <title> [--json] [--root <path>] [--repo OWNER/REPO]

Guides a contributor or coding agent through a complete local-to-PR rehearsal without publishing anything.
The command runs read-only prerequisite checks, then prints every planned side effect as simulated or skipped.
It never runs git push, gh pr create, gh pr comment, gh pr merge, npm install, or file-writing cleanup commands.

Examples:
  npm run local-to-pr:dry-run -- --issue 1700 --title "feat(onboarding): add guided local-to-PR dry run mode"
  npm --silent run local-to-pr:dry-run -- --issue 1700 --title "feat(onboarding): add guided local-to-PR dry run mode" --json`);
}

function parseArgs(argv) {
  const options = {
    json: false,
    root: process.cwd(),
    repo: DEFAULT_REPO,
    title: DEFAULT_ISSUE_TITLE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--json': options.json = true; break;
      case '--issue': options.issue = readValue(); break;
      case '--title': options.title = readValue(); break;
      case '--root': options.root = readValue(); break;
      case '--repo': options.repo = readValue(); break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg?.startsWith('--root=')) options.root = arg.slice('--root='.length);
        else if (arg?.startsWith('--repo=')) options.repo = arg.slice('--repo='.length);
        else if (arg?.startsWith('--issue=')) options.issue = arg.slice('--issue='.length);
        else if (arg?.startsWith('--title=')) options.title = arg.slice('--title='.length);
        else throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.help && options.issue === undefined) {
    throw new Error('--issue is required so the rehearsal cannot target the sample issue by accident');
  }
  return options;
}

function run(command, args = [], cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    ok: !result.error && result.status === 0,
    stdout,
    stderr,
    detail: result.error?.message ?? stderr ?? stdout,
  };
}

function nodeMeetsRange(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return (major === 22 && (minor > 13 || (minor === 13 && patch >= 0))) || (major >= 24 && major < 26);
}

function readManifest(root) {
  try {
    return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

function npmPin(manifest) {
  return typeof manifest?.packageManager === 'string'
    ? manifest.packageManager.match(/^npm@(\d+\.\d+\.\d+)$/u)?.[1]
    : undefined;
}

function check(id, status, detail, remediation, command) {
  return { id, status, detail, remediation, command };
}

function quoteShell(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(text)) return text;
  return `'${text.replace(/'/gu, `'"'"'`)}'`;
}

function formatCommand(command) {
  return command.map((part) => quoteShell(part)).join(' ');
}

export function buildPrerequisiteChecks(options, runner = run) {
  const root = resolve(options.root ?? process.cwd());
  const manifest = readManifest(root);
  const checks = [];

  checks.push(manifest?.name === 'frankenbeast'
    ? check('repository-root', 'ok', `${root} is a Frankenbeast checkout`, undefined, 'read package.json')
    : check('repository-root', 'fail', `${root} is not a Frankenbeast checkout`, 'Run from the repository root or pass --root <path> to a fresh Frankenbeast checkout.', 'read package.json'));

  checks.push(nodeMeetsRange(process.versions.node)
    ? check('node-version', 'ok', `Node.js v${process.versions.node} satisfies ${NODE_RANGE}`, undefined, 'node --version')
    : check('node-version', 'fail', `Node.js v${process.versions.node} does not satisfy ${NODE_RANGE}`, 'Install the version in .nvmrc or another supported Node.js release before rehearsing the PR path.', 'node --version'));

  const expectedNpm = npmPin(manifest);
  const npmVersion = runner('npm', ['--version'], root);
  if (!expectedNpm) {
    checks.push(check('npm-install', 'fail', 'package.json is missing packageManager npm@x.y.z', 'Restore the packageManager field or run from the Frankenbeast root.', 'npm --version'));
  } else if (!npmVersion.ok) {
    checks.push(check('npm-install', 'fail', 'npm is not available', `Activate Corepack npm@${expectedNpm}: corepack enable npm && corepack prepare npm@${expectedNpm} --activate. ${npmVersion.detail}`, 'npm --version'));
  } else if (npmVersion.stdout !== expectedNpm) {
    checks.push(check('npm-install', 'fail', `expected npm ${expectedNpm}, found ${npmVersion.stdout}`, `Run: corepack enable npm && corepack prepare npm@${expectedNpm} --activate`, 'npm --version'));
  } else if (!existsSync(resolve(root, 'node_modules'))) {
    checks.push(check('npm-install', 'warn', `npm ${npmVersion.stdout} matches, but node_modules is missing`, 'Run npm ci before executing real tests; this dry run will only simulate install/test side effects.', 'npm --version'));
  } else {
    checks.push(check('npm-install', 'ok', `npm ${npmVersion.stdout} and node_modules are present`, undefined, 'npm --version'));
  }

  for (const commandName of ['git', 'gh', 'jq']) {
    const result = runner(commandName, ['--version'], root);
    checks.push(result.ok
      ? check(`${commandName}-command`, 'ok', `${commandName} available: ${result.stdout.split(/\r?\n/u)[0]}`, undefined, `${commandName} --version`)
      : check(`${commandName}-command`, 'fail', `${commandName} is not available`, `Install ${commandName} and ensure it is on PATH. ${result.detail}`, `${commandName} --version`));
  }

  const auth = runner('gh', ['auth', 'status', '--hostname', 'github.com'], root);
  checks.push(auth.ok
    ? check('github-auth', 'ok', 'gh auth status succeeded for github.com', undefined, 'gh auth status --hostname github.com')
    : check('github-auth', 'fail', 'gh auth status failed for github.com', `Run gh auth login before opening a real PR. ${auth.detail}`, 'gh auth status --hostname github.com'));

  const gitRoot = runner('git', ['rev-parse', '--show-toplevel'], root);
  const status = runner('git', ['status', '--porcelain'], root);
  if (!gitRoot.ok) {
    checks.push(check('git-state', 'fail', 'not inside a git checkout', `Clone ${options.repo ?? DEFAULT_REPO} and run from a fresh issue worktree. ${gitRoot.detail}`, 'git rev-parse --show-toplevel'));
  } else if (!status.ok) {
    checks.push(check('git-state', 'fail', 'unable to read git status', `Repair the checkout before real branch/PR work. ${status.detail}`, 'git status --porcelain'));
  } else if (status.stdout.length > 0) {
    checks.push(check('git-state', 'warn', 'worktree has uncommitted files', 'Start the real issue from a clean isolated worktree or intentionally commit/stash scoped changes before pushing.', 'git status --porcelain'));
  } else {
    checks.push(check('git-state', 'ok', 'worktree is clean', undefined, 'git status --porcelain'));
  }

  return checks;
}

function step(id, title, command, effect, dryRunAction, reason, phase = 'workflow') {
  return { id, phase, title, command, effect, dryRunAction, reason };
}

export function buildLocalToPrDryRun(options) {
  const root = resolve(options.root ?? process.cwd());
  if (options.issue === undefined) {
    throw new Error('issue is required');
  }
  const issue = options.issue;
  const title = options.title ?? DEFAULT_ISSUE_TITLE;
  const repo = options.repo ?? DEFAULT_REPO;
  const worktreePlan = buildIssueWorktreePlan({ issue, title, repo, cwd: root });
  const issueNumber = worktreePlan.issue;
  const branch = worktreePlan.branch;
  const prTitle = `feat(onboarding): rehearse local-to-PR dry run (#${issueNumber})`;
  const prBody = [
    `Closes #${issueNumber}`,
    '',
    '## Summary',
    '- Rehearsed checkout, branch, no-op change, test selection, PR body, and cleanup locally.',
    '- No remote mutations were executed during the dry run.',
    '',
    '## Test plan',
    '- npm --silent run local-to-pr:dry-run -- --issue <number> --title "<title>" --json',
  ].join('\n');

  const steps = [
    step('checkout', 'Fetch and verify the default branch for a current checkout', 'git fetch origin main', 'network-read', 'check', 'Read-only network fetch exposes auth/connectivity problems without mutating remotes.', 'checkout'),
    step('duplicate-check', 'Check for existing PRs and branches for this issue', worktreePlan.commands.duplicateChecks.map(formatCommand).join(' && '), 'network-read', 'check', 'Read-only duplicate checks preserve the one-issue/one-PR invariant before any branch is created.', 'checkout'),
    step('branch', 'Create the issue branch/worktree', worktreePlan.commands.create.map(formatCommand).join(' && '), 'local-write', 'simulate', 'A real run creates a local worktree; the dry run prints the exact command only.', 'branch'),
    step('enter-worktree', 'Run follow-up commands inside the new issue worktree', `cd ${quoteShell(worktreePlan.worktreePath)}`, 'local-read', 'simulate', 'Every subsequent command is rooted at the scoped issue worktree so edits land on the new branch.', 'branch'),
    step('noop-change', 'Create a no-op rehearsal change', `cd ${quoteShell(worktreePlan.worktreePath)} && printf '\n' >> docs/onboarding/local-to-pr-dry-run.rehearsal.md`, 'local-write', 'simulate', 'No file is written; this represents the contributor making a harmless scoped edit inside the issue worktree.', 'change'),
    step('test-selection', 'Select focused and broader verification commands', `cd ${quoteShell(worktreePlan.worktreePath)} && npm run test:root -- tests/unit/local-to-pr-dry-run.test.ts && npm run typecheck`, 'local-read/compute', 'simulate', 'Tests are listed but not executed so the rehearsal remains fast and side-effect free.', 'test'),
    step('commit', 'Commit the rehearsal change locally', `cd ${quoteShell(worktreePlan.worktreePath)} && git add docs/onboarding/local-to-pr-dry-run.rehearsal.md && git commit -m ${quoteShell('docs(onboarding): rehearse local-to-PR workflow')}`, 'local-write', 'simulate', 'The real path needs a commit before any push or PR can have a diff; dry-run mode does not write the index or history.', 'change'),
    step('push', 'Publish the branch after the local commit exists', `cd ${quoteShell(worktreePlan.worktreePath)} && git push -u origin ${quoteShell(branch)}`, 'remote-mutation', 'skip', 'Pushing mutates the remote branch namespace and is forbidden in the dry run.', 'pr'),
    step('pr-body', 'Generate the PR title/body without opening a PR', `cd ${quoteShell(worktreePlan.worktreePath)} && cat > /tmp/frankenbeast-local-to-pr-body.md <<'EOF'\n${prBody}\nEOF\ngh pr create --repo ${quoteShell(repo)} --head ${quoteShell(branch)} --title ${quoteShell(prTitle)} --body-file /tmp/frankenbeast-local-to-pr-body.md --draft`, 'remote-mutation', 'skip', 'Opening a PR publishes to GitHub; dry-run mode only prints the generated title/body after the branch would already be pushed.', 'pr'),
    step('codex', 'Request Codex review after the real PR exists', 'gh pr comment <PR_NUMBER> --body "@codex review"', 'remote-mutation', 'skip', 'Review comments mutate GitHub and require a real PR; skipped in rehearsal.', 'review'),
    step('cleanup', 'Clean up rehearsal branch/worktree', `git worktree remove ${quoteShell(worktreePlan.worktreePath)} && git branch -D ${quoteShell(branch)}`, 'local-write', 'simulate', 'Cleanup is printed for operators to run after a real local rehearsal; this dry run does not delete anything.', 'cleanup'),
  ];

  return {
    ok: true,
    dryRun: true,
    wouldMutateRemote: false,
    issue: issueNumber,
    title,
    repo,
    root,
    branch,
    worktreePath: worktreePlan.worktreePath,
    prerequisites: [],
    steps,
    generatedPr: { title: prTitle, body: prBody },
    summary: 'Dry run complete: remote side effects were skipped; local writes were simulated.',
  };
}

export function buildReport(options, runner = run) {
  const report = buildLocalToPrDryRun(options);
  const prerequisites = buildPrerequisiteChecks(options, runner);
  const hasFailures = prerequisites.some((item) => item.status === 'fail');
  return {
    ...report,
    ok: !hasFailures,
    prerequisites,
    summary: hasFailures
      ? 'Dry run found prerequisite failures; fix the remediation items before running a real local-to-PR workflow.'
      : report.summary,
  };
}

function renderHuman(report) {
  const lines = [
    `# Local-to-PR dry run for ${report.repo} issue #${report.issue}`,
    `root: ${report.root}`,
    `branch: ${report.branch}`,
    `worktree: ${report.worktreePath}`,
    '',
    '## Prerequisite checks',
  ];
  for (const item of report.prerequisites) {
    const remediation = item.remediation ? ` Remediation: ${item.remediation}` : '';
    lines.push(`- [${item.status}] ${item.id}: ${item.detail}${remediation}`);
  }
  lines.push('', '## Planned side effects', 'Every remote mutation is skipped; local writes are simulated unless marked check.');
  for (const planned of report.steps) {
    lines.push(`- ${planned.phase}/${planned.id}: ${planned.dryRunAction.toUpperCase()} (${planned.effect})`);
    lines.push(`  command: ${planned.command}`);
    lines.push(`  reason: ${planned.reason}`);
  }
  lines.push('', '## Generated PR body preview', `title: ${report.generatedPr.title}`, 'body:', report.generatedPr.body, '', report.summary);
  return lines.join('\n');
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
      return;
    }
    const report = buildReport(options);
    console.info(options.json ? JSON.stringify(report, null, 2) : renderHuman(report));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`local-to-PR dry run failed before checks: ${message}`);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
