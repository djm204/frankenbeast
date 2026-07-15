#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function loadRuntimeConfigSnapshot(filePath) {
  const raw = await readFile(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Runtime config snapshot ${filePath} is not valid JSON: ${reason}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Runtime config snapshot ${filePath} must contain a JSON object`);
  }
  return parsed;
}

export function diffRuntimeConfig(before, after) {
  return diffValues(before, after, '').sort((left, right) => left.path.localeCompare(right.path));
}

export function buildRuntimeConfigRollbackPlan(options) {
  const {
    beforePath,
    afterPath,
    targetPath,
    before,
    after,
    evidenceDir = 'rollback-evidence/runtime-config',
    approvalCop = 'approval-cop run --',
  } = options;

  assertSafePath(beforePath, 'beforePath');
  assertSafePath(afterPath, 'afterPath');
  assertSafePath(targetPath, 'targetPath');
  assertSafePath(evidenceDir, 'evidenceDir');
  const approvalPrefix = splitCommandPrefix(approvalCop);
  if (approvalPrefix.length === 0) {
    throw new Error('approvalCop must name the approval-cop/HITL command; blank overrides are not allowed');
  }

  const changes = diffRuntimeConfig(before, after);
  if (changes.length === 0) {
    throw new Error('No runtime config changes detected; rollback plan would be a no-op');
  }

  const rollbackConfigPath = `${evidenceDir}/rollback-config.json`;
  const changesPath = `${evidenceDir}/runtime-config-changes.json`;
  const rollbackCommentPath = `${evidenceDir}/rollback-comment.md`;
  const changedPaths = changes.map(change => change.path);

  return {
    summary: `Dry-run runtime config rollback plan for ${targetPath}`,
    evidenceDir,
    beforePath,
    afterPath,
    targetPath,
    changedPaths,
    changes,
    readOnlyCapture: [
      ['mkdir', '-p', evidenceDir],
      ['cp', beforePath, rollbackConfigPath],
      ['node', '-e', 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify(JSON.parse(process.argv[2]), null, 2) + "\\n")', changesPath, JSON.stringify(changes)],
      ['node', '-e', 'require("node:fs").writeFileSync(process.argv[1], `## Runtime config rollback postmortem\\n\\n- Target config: ${process.argv[2]}\\n- Before snapshot: ${process.argv[3]}\\n- After snapshot: ${process.argv[4]}\\n- Changed paths: ${process.argv[5]}\\n- Approval-cop outcome/token: <fill before posting>\\n- Verification: compare the target to rollback-config.json and rerun the affected beast/runtime config launch path before resuming.\\n`)', rollbackCommentPath, targetPath, beforePath, afterPath, changedPaths.join(', ')],
    ],
    requiredDecisions: [
      `Confirm ${beforePath} is the last-known-good runtime config snapshot.`,
      `Confirm ${afterPath} captures the currently deployed or failed runtime config state.`,
      `Review changed paths before rollback: ${changedPaths.join(', ')}.`,
      `Fill ${rollbackCommentPath} with the approval-cop outcome and verification results before posting it to a PR or Kanban card.`,
    ],
    approvalGatedActions: [
      [
        ...approvalPrefix,
        'cp', rollbackConfigPath, targetPath,
      ],
    ],
    postRollbackVerification: [
      ['cmp', '-s', rollbackConfigPath, targetPath],
      ['node', '-e', 'const fs=require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8")); JSON.parse(fs.readFileSync(process.argv[2], "utf8"));', rollbackConfigPath, targetPath],
      ['bash', '-lc', '! grep -Eq "<(fill before posting)>" "$1"', '--', rollbackCommentPath],
    ],
    notes: [
      'This helper is dry-run only; it never writes the target runtime config or executes approval-gated commands.',
      'The generated rollback action copies the captured before snapshot back over the target config through approval-cop/HITL.',
      'Treat runtime config rollback as operationally risky: verify the affected run/beast launch path after approval-cop applies the copy.',
      'Use this for JSON runtime config snapshots, not arbitrary source-code rewrites or branch rollbacks.',
    ],
  };
}

export function renderPlan(plan) {
  const lines = [
    `# ${plan.summary}`,
    '',
    `Evidence directory: ${plan.evidenceDir}`,
    `Before snapshot: ${plan.beforePath}`,
    `After snapshot: ${plan.afterPath}`,
    `Target config: ${plan.targetPath}`,
    '',
    '## Changed runtime config paths',
    ...plan.changes.map(change => `- ${change.path}: ${change.type}`),
    '',
    '## 1. Capture read-only rollback evidence',
    ...plan.readOnlyCapture.map(command => `- ${quoteCommand(command)}`),
    '',
    '## 2. Operator decisions before rollback',
    ...plan.requiredDecisions.map(item => `- ${item}`),
    '',
    '## 3. Approval-gated rollback action',
    ...plan.approvalGatedActions.map(command => `- ${quoteCommand(command)}`),
    '',
    '## 4. Verify rollback',
    ...plan.postRollbackVerification.map(command => `- ${quoteCommand(command)}`),
    '',
    '## Safety notes',
    ...plan.notes.map(item => `- ${item}`),
    '',
  ];
  return lines.join('\n');
}

function diffValues(before, after, path) {
  if (Object.is(before, after)) return [];

  const beforeIsContainer = isContainer(before);
  const afterIsContainer = isContainer(after);
  if (!beforeIsContainer || !afterIsContainer || Array.isArray(before) !== Array.isArray(after)) {
    return [buildChange(path, before, after)];
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];
  for (const key of keys) {
    const childPath = `${path}/${escapeJsonPointer(key)}`;
    if (!Object.hasOwn(before, key)) {
      changes.push({ path: childPath, type: 'added', after: after[key] });
    } else if (!Object.hasOwn(after, key)) {
      changes.push({ path: childPath, type: 'removed', before: before[key] });
    } else {
      changes.push(...diffValues(before[key], after[key], childPath));
    }
  }
  return changes;
}

function buildChange(path, before, after) {
  if (before === undefined) return { path: path || '/', type: 'added', after };
  if (after === undefined) return { path: path || '/', type: 'removed', before };
  return { path: path || '/', type: 'changed', before, after };
}

function isContainer(value) {
  return Array.isArray(value) || isPlainObject(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeJsonPointer(value) {
  return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function splitCommandPrefix(command) {
  return String(command ?? '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function assertSafePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new Error(`${label} must be a non-empty path`);
  }
  if (value.startsWith('-') || /\x00/u.test(value)) {
    throw new Error(`${label} is not safe for argv usage: ${value}`);
  }
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
  const options = { dryRun: false, format: 'markdown' };
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
      case '--before': options.beforePath = readValue(); break;
      case '--after': options.afterPath = readValue(); break;
      case '--target': options.targetPath = readValue(); break;
      case '--evidence-dir': options.evidenceDir = readValue(); break;
      case '--approval-cop': options.approvalCop = readValue(); break;
      case '--format': options.format = readValue(); break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.info(`Usage: node scripts/runtime-config-rollback-plan.mjs --dry-run --before BEFORE.json --after AFTER.json --target TARGET.json [--evidence-dir DIR] [--format markdown|json]\n\nGenerate a dry-run rollback plan for JSON runtime config changes. The helper compares a last-known-good before snapshot with the changed/failed after snapshot, writes commands for capturing rollback evidence, and routes the target restore copy through approval-cop/HITL. It never mutates the target config itself.`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.dryRun) {
    throw new Error('Refusing to run without --dry-run; this helper only generates plans and never applies rollbacks');
  }
  if (!['markdown', 'json'].includes(options.format)) {
    throw new Error('--format must be markdown or json');
  }
  const before = await loadRuntimeConfigSnapshot(options.beforePath);
  const after = await loadRuntimeConfigSnapshot(options.afterPath);
  const plan = buildRuntimeConfigRollbackPlan({ ...options, before, after });
  console.info(options.format === 'json' ? JSON.stringify(plan, null, 2) : renderPlan(plan));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
