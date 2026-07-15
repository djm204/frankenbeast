#!/usr/bin/env node

import { chmod, chown, lstat, open, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SNAPSHOT_LIMITS = Object.freeze({
  maxBytes: 1_048_576,
  maxDepth: 64,
  maxContainers: 10_000,
  maxObjectKeys: 20_000,
  maxArrayItems: 50_000,
});

const ROLLBACK_HELPER_MODULE = import.meta.url;

export async function readFileNoFollow(filePath, encoding) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return await handle.readFile(encoding == null ? undefined : { encoding });
  } finally {
    await handle.close();
  }
}

export async function fileSha256(filePath) {
  return createHash('sha256').update(await readFileNoFollow(filePath)).digest('hex');
}

export async function writeFileNoFollow(filePath, data, mode = 0o600, owner) {
  const resolvedFilePath = resolve(filePath);
  await assertExistingPathIsNotSymlinkOrParent(resolvedFilePath);
  const tempPath = join(dirname(resolvedFilePath), `.${basename(resolvedFilePath)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  let renamed = false;
  try {
    await chmod(tempPath, mode);
    if (owner && Number.isInteger(owner.uid) && Number.isInteger(owner.gid)) {
      await chown(tempPath, owner.uid, owner.gid);
    }
    await rename(tempPath, resolvedFilePath);
    renamed = true;
    await chmod(resolvedFilePath, mode);
  } catch (error) {
    if (!renamed) await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function copyFileNoFollow(sourcePath, destinationPath, mode = 0o600) {
  await writeFileNoFollow(destinationPath, await readFileNoFollow(sourcePath), mode);
}

async function assertExistingPathIsNotSymlinkOrParent(filePath) {
  const absolute = resolve(filePath);
  const parsed = parse(absolute);
  let current = parsed.root;
  const parts = relative(parsed.root, absolute).split(sep).filter(Boolean);

  for (const part of parts) {
    current = resolve(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new Error(`Refusing symlinked path component: ${current}`);
      }
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function loadRuntimeConfigSnapshot(filePath) {
  return (await loadRuntimeConfigSnapshotWithDigest(filePath)).snapshot;
}

export async function loadRuntimeConfigSnapshotWithDigest(filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error(`Runtime config snapshot ${filePath} must be a regular file`);
  }
  if (info.size > SNAPSHOT_LIMITS.maxBytes) {
    throw new Error(`Runtime config snapshot ${filePath} exceeds maxBytes: ${info.size} > ${SNAPSHOT_LIMITS.maxBytes}`);
  }
  const rawBuffer = await readFileNoFollow(filePath);
  const rawBytes = rawBuffer.byteLength;
  if (rawBytes > SNAPSHOT_LIMITS.maxBytes) {
    throw new Error(`Runtime config snapshot ${filePath} exceeds maxBytes: ${rawBytes} > ${SNAPSHOT_LIMITS.maxBytes}`);
  }
  const raw = rawBuffer.toString('utf8');
  const snapshot = parseRuntimeConfigSnapshot(raw, filePath);
  return {
    snapshot,
    sha256: createHash('sha256').update(rawBuffer).digest('hex'),
  };
}

function parseRuntimeConfigSnapshot(raw, filePath) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Runtime config snapshot ${filePath} is not valid JSON: ${reason}`);
  }
  validateSnapshotShape(parsed, filePath);
  if (!isPlainObject(parsed)) {
    throw new Error(`Runtime config snapshot ${filePath} must contain a JSON object`);
  }
  validateRuntimeConfigSchema(parsed, filePath);
  return parsed;
}

export function diffRuntimeConfig(before, after) {
  return diffValues(before, after, '').sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
}

export function defaultEvidenceDir(targetPath) {
  assertSafePath(targetPath, 'targetPath');
  const targetName = basename(targetPath).replace(/[^A-Za-z0-9_.-]+/gu, '-').replace(/^-+/u, '') || 'runtime-config';
  const digest = createHash('sha256').update(targetPath).digest('hex').slice(0, 12);
  return resolve(`rollback-evidence/runtime-config-${targetName}-${digest}`);
}

export function buildRuntimeConfigRollbackPlan(options) {
  const {
    beforePath,
    afterPath,
    targetPath,
    before,
    after,
    approvalCop = 'approval-cop run --',
  } = options;
  const evidenceDir = options.evidenceDir ?? defaultEvidenceDir(targetPath);

  assertSafePath(beforePath, 'beforePath');
  assertSafePath(afterPath, 'afterPath');
  assertSafePath(targetPath, 'targetPath');
  assertSafePath(evidenceDir, 'evidenceDir');
  const approvalPrefix = splitCommandPrefix(approvalCop);
  if (approvalPrefix.length === 0) {
    throw new Error('approvalCop must name the approval-cop/HITL command; blank overrides are not allowed');
  }

  validateRuntimeConfigSchema(before, beforePath);
  validateRuntimeConfigSchema(after, afterPath);
  const detailedChanges = diffRuntimeConfig(before, after);
  const changes = detailedChanges.map(({ path, type }) => ({ path, type }));
  if (changes.length === 0) {
    throw new Error('No runtime config changes detected; rollback plan would be a no-op');
  }
  if (!options.beforeSha256 || !options.afterSha256) {
    throw new Error('beforeSha256 and afterSha256 are required so rollback approval verifies the captured snapshot file bytes');
  }

  const rollbackConfigPath = `${evidenceDir}/rollback-config.json`;
  const afterConfigPath = `${evidenceDir}/after-config.json`;
  const changesPath = `${evidenceDir}/runtime-config-changes.json`;
  const rollbackCommentPath = `${evidenceDir}/rollback-comment.md`;
  const changedPaths = changes.map(change => change.path);
  const beforeSha256 = options.beforeSha256;
  const afterSha256 = options.afterSha256;
  const helperImport = JSON.stringify(ROLLBACK_HELPER_MODULE);

  return {
    summary: `Dry-run runtime config rollback plan for ${targetPath}`,
    evidenceDir,
    beforePath,
    afterPath,
    targetPath,
    changedPaths,
    changes,
    readOnlyCapture: [
      [
        'node',
        '--input-type=module',
        '-e',
        'import { chmod, lstat, mkdir } from "node:fs/promises"; import { parse, relative, resolve, sep } from "node:path"; const [dir]=process.argv.slice(1); async function assertNoSymlinkExisting(path){ const absolute=resolve(path); const parsed=parse(absolute); let current=parsed.root; const parts=relative(parsed.root, absolute).split(sep).filter(Boolean); for (const part of parts){ current=resolve(current, part); try { const info=await lstat(current); if (info.isSymbolicLink()) throw new Error(`Refusing symlinked evidence path component: ${current}`); } catch (error) { if (error && error.code === "ENOENT") break; throw error; } } } await assertNoSymlinkExisting(dir); const created=await mkdir(dir, { recursive: true }); await assertNoSymlinkExisting(dir); const info=await lstat(dir); if (!info.isDirectory()) throw new Error(`Evidence path is not a directory: ${dir}`); if (created !== undefined) await chmod(dir, 0o700);',
        evidenceDir,
      ],
      [
        'node',
        '--input-type=module',
        '-e',
        `import { copyFileNoFollow } from ${helperImport}; await copyFileNoFollow(process.argv[1], process.argv[2]);`,
        beforePath,
        rollbackConfigPath,
      ],
      [
        'node',
        '--input-type=module',
        '-e',
        `import { copyFileNoFollow } from ${helperImport}; await copyFileNoFollow(process.argv[1], process.argv[2]);`,
        afterPath,
        afterConfigPath,
      ],
      [
        'node',
        '--input-type=module',
        '-e',
        `import { buildRuntimeConfigRollbackPlan, loadRuntimeConfigSnapshotWithDigest, writeFileNoFollow } from ${helperImport}; const [out,rollbackPath,afterCapturePath,targetPath,evidenceDir]=process.argv.slice(1); const beforeResult=await loadRuntimeConfigSnapshotWithDigest(rollbackPath); const afterResult=await loadRuntimeConfigSnapshotWithDigest(afterCapturePath); const plan=buildRuntimeConfigRollbackPlan({ beforePath: rollbackPath, afterPath: afterCapturePath, targetPath, evidenceDir, before: beforeResult.snapshot, after: afterResult.snapshot, beforeSha256: beforeResult.sha256, afterSha256: afterResult.sha256 }); await writeFileNoFollow(out, JSON.stringify(plan.changes, null, 2) + "\\n");`,
        changesPath,
        rollbackConfigPath,
        afterConfigPath,
        targetPath,
        evidenceDir,
      ],
      [
        'node',
        '--input-type=module',
        '-e',
        `import { writeFileNoFollow } from ${helperImport}; await writeFileNoFollow(process.argv[1], \`## Runtime config rollback postmortem\\n\\n- Target config: \${process.argv[2]}\\n- Before snapshot: \${process.argv[3]}\\n- After snapshot: \${process.argv[4]}\\n- Changed paths: \${process.argv[5]}\\n- Approval-cop outcome/token: <fill before posting>\\n- Verification: compare the target to rollback-config.json and rerun the affected beast/runtime config launch path before resuming.\\n\`);`,
        rollbackCommentPath,
        targetPath,
        beforePath,
        afterPath,
        changedPaths.map(formatChangedPath).join(', '),
      ],
    ],
    requiredDecisions: [
      `Confirm ${beforePath} is the last-known-good runtime config snapshot.`,
      `Confirm ${afterPath} captures the currently deployed or failed runtime config state.`,
      `Review changed paths before rollback: ${changedPaths.map(formatChangedPath).join(', ')}.`,
      `Fill ${rollbackCommentPath} with the approval-cop outcome and verification results before posting it to a PR or Kanban card.`,
    ],
    approvalGatedActions: [
      [
        ...approvalPrefix,
        'node',
        '--input-type=module',
        '-e',
        `import { createHash } from "node:crypto"; import { lstat, stat } from "node:fs/promises"; import { dirname, parse, relative, resolve, sep } from "node:path"; import { readFileNoFollow, writeFileNoFollow } from ${helperImport}; const [rollback,target,after,expectedRollbackSha,expectedAfterSha]=process.argv.slice(1); const sha=data=>createHash("sha256").update(data).digest("hex"); async function assertNoSymlink(path){ const absolute=resolve(path); const parsed=parse(absolute); let current=parsed.root; const parts=relative(parsed.root, absolute).split(sep).filter(Boolean); for (const part of parts){ current=resolve(current, part); const info=await lstat(current); if (info.isSymbolicLink()) throw new Error(\`Refusing symlinked runtime config path component: \${current}\`); } } await assertNoSymlink(dirname(target)); await assertNoSymlink(target); const targetInfo=await stat(target); const [rollbackRaw,targetRaw,afterRaw]=await Promise.all([readFileNoFollow(rollback), readFileNoFollow(target), readFileNoFollow(after)]); if (sha(rollbackRaw)!==expectedRollbackSha) throw new Error("Refusing rollback: rollback snapshot no longer matches approved before snapshot"); if (sha(afterRaw)!==expectedAfterSha) throw new Error("Refusing rollback: captured after snapshot no longer matches reviewed after snapshot"); if (!targetRaw.equals(afterRaw)) throw new Error("Refusing rollback: target runtime config no longer matches after snapshot"); await writeFileNoFollow(target, rollbackRaw, targetInfo.mode & 0o777, { uid: targetInfo.uid, gid: targetInfo.gid });`,
        rollbackConfigPath,
        targetPath,
        afterConfigPath,
        beforeSha256,
        afterSha256,
      ],
    ],
    postRollbackVerification: [
      ['cmp', '-s', rollbackConfigPath, targetPath],
      ['node', '-e', 'const fs=require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8")); JSON.parse(fs.readFileSync(process.argv[2], "utf8"));', rollbackConfigPath, targetPath],
      ['bash', '-lc', '[ -f "$1" ] && ! grep -Eq "<(fill before posting)>" "$1"', '--', rollbackCommentPath],
    ],
    notes: [
      'This helper is dry-run only; it never writes the target runtime config or executes approval-gated commands.',
      'The generated rollback action copies the captured before snapshot back over the target config through approval-cop/HITL.',
      'Treat runtime config rollback as operationally risky: verify the affected run/beast launch path after approval-cop applies the copy.',
      'Use this for JSON runtime config snapshots, not arbitrary source-code rewrites or branch rollbacks.',
      `Snapshot parsing is bounded to ${SNAPSHOT_LIMITS.maxBytes} bytes, depth ${SNAPSHOT_LIMITS.maxDepth}, ${SNAPSHOT_LIMITS.maxContainers} containers, ${SNAPSHOT_LIMITS.maxObjectKeys} object keys, and ${SNAPSHOT_LIMITS.maxArrayItems} array items.`,
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
    ...plan.changes.map(change => `- ${formatChangedPath(change.path)}: ${change.type}`),
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

function validateRuntimeConfigSchema(value, filePath) {
  assertOptionalString(value.provider, 'provider', filePath);
  assertOptionalString(value.objective, 'objective', filePath);
  assertOptionalString(value.chunkDirectory, 'chunkDirectory', filePath);
  assertOptionalString(value.model, 'model', filePath);
  assertOptionalPositiveInteger(value.maxDurationMs, 'maxDurationMs', filePath);
  assertOptionalNumber(value.maxTotalTokens, 'maxTotalTokens', filePath);
  assertOptionalBoolean(value.reflection, 'reflection', filePath);
  assertOptionalStringArray(value.skills, 'skills', filePath);
  assertOptionalObject(value.llmConfig, 'llmConfig', filePath, validateLlmConfig);
  assertOptionalObject(value.modules, 'modules', filePath, validateModulesConfig);
  assertOptionalObject(value.gitConfig, 'gitConfig', filePath, validateGitConfig);
  assertOptionalObject(value.promptConfig, 'promptConfig', filePath, validatePromptConfig);
}

function validateLlmConfig(value, path, filePath) {
  assertKnownKeys(value, ['default', 'overrides'], path, filePath);
  assertOptionalObject(value.default, `${path}.default`, filePath, validateLlmOverride);
  if (value.overrides !== undefined) {
    assertPlainObjectAt(value.overrides, `${path}.overrides`, filePath);
    for (const [name, override] of Object.entries(value.overrides)) {
      assertPlainObjectAt(override, `${path}.overrides.${name}`, filePath);
      validateLlmOverride(override, `${path}.overrides.${name}`, filePath);
    }
  }
}

function validateLlmOverride(value, path, filePath) {
  assertKnownKeys(value, ['provider', 'model'], path, filePath);
  assertOptionalString(value.provider, `${path}.provider`, filePath);
  assertOptionalString(value.model, `${path}.model`, filePath);
}

function validateModulesConfig(value, path, filePath) {
  assertKnownKeys(value, ['firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat'], path, filePath);
  for (const key of Object.keys(value)) assertOptionalBoolean(value[key], `${path}.${key}`, filePath);
}

function validateGitConfig(value, path, filePath) {
  assertKnownKeys(value, ['preset', 'baseBranch', 'branchPattern', 'prCreation', 'disableBranding', 'mergeStrategy', 'commitConvention'], path, filePath);
  assertOptionalString(value.preset, `${path}.preset`, filePath);
  assertOptionalString(value.baseBranch, `${path}.baseBranch`, filePath);
  assertOptionalString(value.branchPattern, `${path}.branchPattern`, filePath);
  assertOptionalEnum(value.prCreation, ['auto', 'manual', 'disabled'], `${path}.prCreation`, filePath);
  assertOptionalBoolean(value.disableBranding, `${path}.disableBranding`, filePath);
  assertOptionalEnum(value.mergeStrategy, ['merge', 'squash', 'rebase'], `${path}.mergeStrategy`, filePath);
  assertOptionalString(value.commitConvention, `${path}.commitConvention`, filePath);
}

function validatePromptConfig(value, path, filePath) {
  assertKnownKeys(value, ['text', 'files'], path, filePath);
  assertOptionalString(value.text, `${path}.text`, filePath);
  assertOptionalStringArray(value.files, `${path}.files`, filePath);
}

function assertKnownKeys(value, keys, path, filePath) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Runtime config snapshot ${filePath} has unsupported ${path}.${key}`);
  }
}

function assertOptionalObject(value, path, filePath, validator) {
  if (value === undefined) return;
  assertPlainObjectAt(value, path, filePath);
  validator(value, path, filePath);
}

function assertPlainObjectAt(value, path, filePath) {
  if (!isPlainObject(value)) throw new Error(`Runtime config snapshot ${filePath} field ${path} must be an object`);
}

function assertOptionalString(value, path, filePath) {
  if (value !== undefined && typeof value !== 'string') throw new Error(`Runtime config snapshot ${filePath} field ${path} must be a string`);
}

function assertOptionalBoolean(value, path, filePath) {
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`Runtime config snapshot ${filePath} field ${path} must be a boolean`);
}

function assertOptionalNumber(value, path, filePath) {
  if (value !== undefined && typeof value !== 'number') throw new Error(`Runtime config snapshot ${filePath} field ${path} must be a number`);
}

function assertOptionalPositiveInteger(value, path, filePath) {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new Error(`Runtime config snapshot ${filePath} field ${path} must be a positive integer`);
  }
}

function assertOptionalStringArray(value, path, filePath) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Runtime config snapshot ${filePath} field ${path} must be an array of strings`);
  }
}

function assertOptionalEnum(value, allowed, path, filePath) {
  if (value !== undefined && !allowed.includes(value)) {
    throw new Error(`Runtime config snapshot ${filePath} field ${path} must be one of: ${allowed.join(', ')}`);
  }
}

function validateSnapshotShape(value, filePath) {
  const stack = [{ value, depth: 1 }];
  let containers = 0;
  let objectKeys = 0;
  let arrayItems = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !isContainer(current.value)) continue;
    containers += 1;
    if (containers > SNAPSHOT_LIMITS.maxContainers) {
      throw new Error(`Runtime config snapshot ${filePath} exceeds maxContainers: ${containers} > ${SNAPSHOT_LIMITS.maxContainers}`);
    }
    if (current.depth > SNAPSHOT_LIMITS.maxDepth) {
      throw new Error(`Runtime config snapshot ${filePath} exceeds maxDepth: ${current.depth} > ${SNAPSHOT_LIMITS.maxDepth}`);
    }

    if (Array.isArray(current.value)) {
      arrayItems += current.value.length;
      if (arrayItems > SNAPSHOT_LIMITS.maxArrayItems) {
        throw new Error(`Runtime config snapshot ${filePath} exceeds maxArrayItems: ${arrayItems} > ${SNAPSHOT_LIMITS.maxArrayItems}`);
      }
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }

    const values = Object.values(current.value);
    objectKeys += values.length;
    if (objectKeys > SNAPSHOT_LIMITS.maxObjectKeys) {
      throw new Error(`Runtime config snapshot ${filePath} exceeds maxObjectKeys: ${objectKeys} > ${SNAPSHOT_LIMITS.maxObjectKeys}`);
    }
    for (const item of values) stack.push({ value: item, depth: current.depth + 1 });
  }
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
  if (value.startsWith('-') || /[\x00-\x1F\x7F]/u.test(value)) {
    throw new Error(`${label} is not safe for argv or Markdown usage: ${value}`);
  }
}

function formatChangedPath(value) {
  return JSON.stringify(String(value)).replace(/\u2028/gu, '\\u2028').replace(/\u2029/gu, '\\u2029');
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
  const beforePath = resolve(options.beforePath);
  const afterPath = resolve(options.afterPath);
  const targetPath = resolve(options.targetPath);
  const evidenceDir = options.evidenceDir === undefined ? defaultEvidenceDir(targetPath) : resolve(options.evidenceDir);
  const [beforeResult, afterResult] = await Promise.all([
    loadRuntimeConfigSnapshotWithDigest(beforePath),
    loadRuntimeConfigSnapshotWithDigest(afterPath),
  ]);
  const plan = buildRuntimeConfigRollbackPlan({
    ...options,
    beforePath,
    afterPath,
    targetPath,
    evidenceDir,
    before: beforeResult.snapshot,
    after: afterResult.snapshot,
    beforeSha256: beforeResult.sha256,
    afterSha256: afterResult.sha256,
  });
  console.info(options.format === 'json' ? JSON.stringify(plan, null, 2) : renderPlan(plan));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
