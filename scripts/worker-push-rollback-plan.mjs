#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/iu;
const REF_FORBIDDEN_CHAR_RE = /[\x00-\x20\x7f~^:?*[\\]/u;
const REF_FORBIDDEN_SEQ_RE = /\.\.|@\{|\/{2,}|^[./]|[./]$|\/\.|\.lock(?:\/|$)/u;
const PROTECTED_BRANCHES = new Set(['main', 'master', 'trunk', 'develop', 'development', 'staging', 'production']);

export function parseLsRemoteHeads(output) {
  return String(output ?? '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [oid, ref, ...extra] = line.split(/\s+/u);
      if (!SHA_RE.test(oid ?? '') || !ref?.startsWith('refs/heads/') || extra.length > 0) {
        throw new Error(`Invalid ls-remote head line: ${line}`);
      }
      return {
        oid: oid.toLowerCase(),
        ref,
        branch: ref.slice('refs/heads/'.length),
      };
    });
}

export function findRemoteHead(output, branch) {
  assertSafeBranch(branch, 'branch');
  const heads = parseLsRemoteHeads(output);
  return heads.find(head => head.branch === branch) ?? null;
}

export function assertSafeBranch(value, label = 'branch') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new Error(`${label} must be a non-empty git branch name`);
  }
  if (value.startsWith('-') || REF_FORBIDDEN_CHAR_RE.test(value) || REF_FORBIDDEN_SEQ_RE.test(value)) {
    throw new Error(`${label} is not a safe git branch name: ${value}`);
  }
}

export function assertRollbackBranch(value) {
  assertSafeBranch(value, 'branch');
  if (PROTECTED_BRANCHES.has(value) || value.startsWith('release/')) {
    throw new Error(`branch is protected and cannot be rolled back by this helper: ${value}`);
  }
}

export function assertSafeRemote(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('remote must be a non-empty git remote name or URL');
  }
  if (value.startsWith('-') || /[\x00-\x20\x7f]/u.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*::/u.test(value)) {
    throw new Error(`remote is not safe for git argv usage: ${value}`);
  }
}

export function buildRollbackPlan(options) {
  const {
    branch,
    lastGood,
    remote = 'origin',
    repo,
    pr,
    evidenceDir = `rollback-evidence/${sanitizePathSegment(branch)}`,
    approvalCop = 'approval-cop run --',
    remoteHeadOid,
    lastGoodOid,
  } = options;

  assertRollbackBranch(branch);
  assertSafeRemote(remote);
  if (!lastGood || String(lastGood).startsWith('-')) {
    throw new Error('lastGood must be supplied as a ref or commit to roll back to');
  }
  if (remoteHeadOid != null && !SHA_RE.test(remoteHeadOid)) {
    throw new Error('remoteHeadOid must be a 40-character SHA-1');
  }
  if (lastGoodOid != null && !SHA_RE.test(lastGoodOid)) {
    throw new Error('lastGoodOid must be a 40-character SHA-1');
  }

  const branchRef = `refs/heads/${branch}`;
  const remoteTrackingRef = `refs/remotes/${remote}/${branch}`;
  const remoteHead = remoteHeadOid?.toLowerCase() ?? '<captured-remote-head-oid>';
  const goodOid = lastGoodOid?.toLowerCase() ?? '<resolved-last-good-oid>';
  const prSelector = pr != null ? String(pr) : '<pr-number>';
  const repoArgs = repo ? ['--repo', repo] : [];
  const approvalPrefix = splitCommandPrefix(approvalCop);
  const remoteHeadPath = `${evidenceDir}/remote-head.txt`;
  const lastGoodPath = `${evidenceDir}/last-good-oid.txt`;
  const commitsPath = `${evidenceDir}/commits-to-remove.txt`;
  const prStatePath = `${evidenceDir}/pr-state.json`;
  const rollbackCommentPath = `${evidenceDir}/rollback-comment.md`;

  return {
    summary: `Dry-run rollback plan for ${branch}`,
    evidenceDir,
    readOnlyCapture: [
      ['mkdir', '-p', evidenceDir],
      ['bash', '-lc', 'git ls-remote --heads "$1" "$2" | tee "$3"', '--', remote, branchRef, remoteHeadPath],
      ['bash', '-lc', 'git rev-parse --verify "$1^{commit}" | tee "$2"', '--', lastGood, lastGoodPath],
      ['git', 'fetch', '--no-tags', remote, `${branchRef}:${remoteTrackingRef}`],
      ['bash', '-lc', 'git log --oneline --decorate --graph "$1..$2" > "$3"', '--', lastGood, remoteTrackingRef, commitsPath],
      ['bash', '-lc', 'gh pr view "$1" "${@:3}" --json number,title,state,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup,url > "$2"', '--', prSelector, prStatePath, ...repoArgs],
      ['node', '-e', 'require("node:fs").writeFileSync(process.argv[1], `## Worker branch rollback postmortem\n\n- Branch: ${process.argv[2]}\n- Remote head before rollback: ${process.argv[3]}\n- Selected last-good commit: ${process.argv[4]}\n- Evidence directory: ${process.argv[5]}\n- Approval-cop outcome/token: <fill before posting>\n- Verification: rerun ls-remote, pr view, checks, and Codex on the new head before merging.\n`)', rollbackCommentPath, branchRef, remoteHead, goodOid, evidenceDir],
    ],
    requiredDecisions: [
      `Confirm ${remoteHead} is the current remote head for ${branchRef}.`,
      `Confirm ${goodOid} is the intended last-good commit for ${lastGood}.`,
      'Preserve read-only command output in the evidence directory before requesting approval.',
    ],
    approvalGatedActions: [
      [
        ...approvalPrefix,
        'git', 'push', `--force-with-lease=${branchRef}:${remoteHead}`, remote, `${goodOid}:${branchRef}`,
      ],
    ],
    postRollbackVerification: [
      ['git', 'ls-remote', '--heads', remote, branchRef],
      ['gh', 'pr', 'view', prSelector, ...repoArgs, '--json', 'headRefOid,mergeStateStatus,statusCheckRollup,url'],
      ['gh', 'pr', 'comment', prSelector, ...repoArgs, '--body-file', rollbackCommentPath],
    ],
    notes: [
      'This helper is dry-run only; it never executes push, force-push, or GitHub mutation commands.',
      'The force-with-lease value pins the expected remote head so concurrent worker pushes are not overwritten silently.',
      'Run the approval-gated command only through approval-cop/HITL after evidence and last-good selection are reviewed.',
    ],
  };
}

export function renderPlan(plan) {
  const lines = [
    `# ${plan.summary}`,
    '',
    `Evidence directory: ${plan.evidenceDir}`,
    '',
    '## 1. Capture read-only evidence',
    ...plan.readOnlyCapture.map(command => `- ${quoteCommand(command)}`),
    '',
    '## 2. Operator decisions before rollback',
    ...plan.requiredDecisions.map(item => `- ${item}`),
    '',
    '## 3. Approval-gated rollback action',
    ...plan.approvalGatedActions.map(command => `- ${quoteCommand(command)}`),
    '',
    '## 4. Verify and update the PR',
    ...plan.postRollbackVerification.map(command => `- ${quoteCommand(command)}`),
    '',
    '## Safety notes',
    ...plan.notes.map(item => `- ${item}`),
    '',
  ];
  return lines.join('\n');
}

function splitCommandPrefix(command) {
  return String(command ?? '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function sanitizePathSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'branch';
}

function quoteCommand(args) {
  return args.map(quoteArg).join(' ');
}

function quoteArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+,-]+$/u.test(text)) return text;
  return `'${text.replace(/'/gu, `'"'"'`)}'`;
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--dry-run': options.dryRun = true; break;
      case '--branch': options.branch = readValue(); break;
      case '--remote': options.remote = readValue(); break;
      case '--last-good': options.lastGood = readValue(); break;
      case '--repo': options.repo = readValue(); break;
      case '--pr': options.pr = readValue(); break;
      case '--evidence-dir': options.evidenceDir = readValue(); break;
      case '--approval-cop': options.approvalCop = readValue(); break;
      case '--remote-head-oid': options.remoteHeadOid = readValue(); break;
      case '--last-good-oid': options.lastGoodOid = readValue(); break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/worker-push-rollback-plan.mjs --dry-run --branch <branch> --last-good <ref> [--remote origin] [--repo OWNER/REPO] [--pr N]\n\nPrints a rollback runbook plan only. It does not execute git push, force-with-lease, gh comment, or approval-cop commands.`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    if (!options.dryRun) {
      throw new Error('Refusing to run without --dry-run; rollback side effects must go through approval-cop/HITL manually.');
    }
    if (!options.branch || !options.lastGood) {
      throw new Error('--branch and --last-good are required');
    }
    const plan = buildRollbackPlan(options);
    console.log(renderPlan(plan));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
