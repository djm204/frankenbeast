#!/usr/bin/env node
import Database from 'better-sqlite3';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { createEncryptedStateBackup, restoreEncryptedStateBackup } from '../packages/franken-orchestrator/src/dr/state-backup.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');

const EXPECTED = Object.freeze({
  taskId: 'fixture-task-restore-rehearsal',
  taskTitle: 'fixture restore rehearsal task',
  commentBody: 'fixture comment survives restore',
  approvalId: 'approval-fixture-001',
  approvalCommand: 'git merge --squash fixture',
  workerId: 'worker-fixture-001',
  dispatchStaleTimeout: 14400,
  heartbeatIntervalSeconds: 300,
});

function isSameOrParent(candidate, child) {
  const parent = resolve(candidate);
  const target = resolve(child);
  return target === parent || target.startsWith(`${parent}${sep}`);
}

async function resolveExistingOrParent(path) {
  const target = resolve(path);
  if (await pathExists(target)) {
    return realpath(target);
  }
  return join(await realpath(dirname(target)), parse(target).base);
}

async function assertSafeIsolatedRoot(path, label) {
  const target = resolve(path);
  const realTarget = await resolveExistingOrParent(target);
  const home = process.env.HOME ? resolve(process.env.HOME) : undefined;
  const realHome = home && await pathExists(home) ? await realpath(home) : undefined;
  const root = parse(target).root;
  const realRepoRoot = await realpath(REPO_ROOT);
  const unsafeExact = new Set([
    root,
    home,
    realHome,
    process.cwd(),
    dirname(process.cwd()),
    REPO_ROOT,
    dirname(REPO_ROOT),
    realRepoRoot,
    dirname(realRepoRoot),
  ].filter(Boolean));
  if (
    unsafeExact.has(target)
    || unsafeExact.has(realTarget)
    || target.split(sep).filter(Boolean).length < 2
    || realTarget.split(sep).filter(Boolean).length < 2
    || isSameOrParent(target, REPO_ROOT)
    || isSameOrParent(REPO_ROOT, target)
    || isSameOrParent(realTarget, realRepoRoot)
    || isSameOrParent(realRepoRoot, realTarget)
  ) {
    throw new Error(`${label} must be an isolated scratch directory, not a home, repository, or filesystem root`);
  }
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

function writeKanbanFixture(dbPath) {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        assignee TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    db.prepare('INSERT INTO tasks (id, title, status, assignee, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(EXPECTED.taskId, EXPECTED.taskTitle, 'blocked', 'fixture-worker', 1_783_000_000);
    db.prepare('INSERT INTO comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)')
      .run(EXPECTED.taskId, 'fixture-worker', EXPECTED.commentBody, 1_783_000_100);
  } finally {
    db.close();
  }
}

async function buildFixtureState(sourceRoot) {
  const profileRoot = join(sourceRoot, 'profiles', 'default');
  const approvalDir = join(profileRoot, 'approvals');
  await ensureDir(approvalDir);
  await ensureDir(join(profileRoot, 'cron'));
  await ensureDir(join(sourceRoot, 'runs', 'fixture-run-001'));

  writeKanbanFixture(join(profileRoot, 'kanban.db'));
  await writeFile(join(approvalDir, 'ledger.json'), `${JSON.stringify({
    schemaVersion: 1,
    entries: [
      {
        id: EXPECTED.approvalId,
        status: 'approved',
        command: EXPECTED.approvalCommand,
        approver: 'restore-rehearsal',
        createdAt: '2026-07-16T00:00:00.000Z',
      },
    ],
  }, null, 2)}\n`);
  await writeFile(join(profileRoot, 'config.yaml'), [
    'kanban:',
    `  dispatch_stale_timeout_seconds: ${EXPECTED.dispatchStaleTimeout}`,
    'liveness:',
    `  heartbeat_interval_seconds: ${EXPECTED.heartbeatIntervalSeconds}`,
    '  worker_ids:',
    `    - ${EXPECTED.workerId}`,
    'notification_sources:',
    '  - default',
    '',
  ].join('\n'));
  await writeFile(join(sourceRoot, 'runs', 'fixture-run-001', 'metadata.json'), `${JSON.stringify({
    taskId: EXPECTED.taskId,
    workerId: EXPECTED.workerId,
  }, null, 2)}\n`);
  await writeFile(join(sourceRoot, 'manifest.json'), `${JSON.stringify({
    fixture: 'restore-rehearsal',
    createdBy: 'scripts/restore-rehearsal.mjs',
    includes: [
      'profiles/default/kanban.db',
      'profiles/default/approvals/ledger.json',
      'profiles/default/config.yaml',
      'runs/fixture-run-001/metadata.json',
    ],
  }, null, 2)}\n`);
}

async function backupState(sourceRoot, backupRoot, keyFilePath) {
  await ensureDir(backupRoot);
  const backupPath = join(backupRoot, 'fixture-source.franken-dr.json');
  await createEncryptedStateBackup({
    stateDir: sourceRoot,
    outputPath: backupPath,
    keyFilePath,
    generatedAt: '2026-07-16T00:00:00.000Z',
  });
  return backupPath;
}

async function restoreState(backupPath, restoreRoot, keyFilePath) {
  if (!(await pathExists(backupPath))) {
    throw new Error(`backup artifact missing from ${backupPath}`);
  }
  await restoreEncryptedStateBackup({
    backupPath,
    targetDir: restoreRoot,
    keyFilePath,
  });
  return restoreRoot;
}

function readKanbanState(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const task = db.prepare('SELECT id, title, status, assignee FROM tasks WHERE id = ?').get(EXPECTED.taskId);
    const comments = db.prepare('SELECT task_id, author, body FROM comments WHERE task_id = ? ORDER BY id').all(EXPECTED.taskId);
    return { task, comments };
  } finally {
    db.close();
  }
}

async function assertRestoredState(restoreRoot) {
  const profileRoot = join(restoreRoot, 'profiles', 'default');
  const kanban = readKanbanState(join(profileRoot, 'kanban.db'));
  if (!kanban.task || kanban.task.title !== EXPECTED.taskTitle || kanban.task.status !== 'blocked') {
    throw new Error('restored Kanban task does not match fixture task');
  }
  if (!kanban.comments.some((comment) => comment.body === EXPECTED.commentBody)) {
    throw new Error('restored Kanban comments do not include fixture comment');
  }

  let ledger;
  const restoredApprovalLedgerPath = join(restoreRoot, '_quarantine', 'approvals', 'profiles', 'default', 'approvals', 'ledger.json');
  try {
    ledger = JSON.parse(await readFile(restoredApprovalLedgerPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`approval ledger is not valid JSON: ${message}`);
  }
  const approval = Array.isArray(ledger.entries)
    ? ledger.entries.find((entry) => entry.id === EXPECTED.approvalId)
    : undefined;
  if (!approval || approval.command !== EXPECTED.approvalCommand || approval.status !== 'approved') {
    throw new Error('restored approval entries do not include expected approval ledger row');
  }

  const config = parseYaml(await readFile(join(profileRoot, 'config.yaml'), 'utf8'));
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('restored config.yaml did not parse to an object');
  }
  const record = config;
  if (record.kanban?.dispatch_stale_timeout_seconds !== EXPECTED.dispatchStaleTimeout) {
    throw new Error('restored liveness config lost kanban.dispatch_stale_timeout_seconds');
  }
  if (record.liveness?.heartbeat_interval_seconds !== EXPECTED.heartbeatIntervalSeconds) {
    throw new Error('restored liveness config lost heartbeat interval');
  }
  if (!Array.isArray(record.liveness?.worker_ids) || !record.liveness.worker_ids.includes(EXPECTED.workerId)) {
    throw new Error('restored liveness config lost worker_ids');
  }

  return {
    task: kanban.task,
    comments: kanban.comments.length,
    approvalId: approval.id,
    workerIds: record.liveness.worker_ids,
  };
}

async function runCorruptedFixtureCase(root) {
  const sourceRoot = join(root, 'corrupt-source');
  const backupRoot = join(root, 'corrupt-backups');
  const restoreRoot = join(root, 'corrupt-restore');
  const keyFilePath = join(root, 'corrupt-backup.key');
  await writeFile(keyFilePath, 'restore rehearsal corrupt fixture key material', { mode: 0o600 });
  await buildFixtureState(sourceRoot);
  await writeFile(join(sourceRoot, 'profiles', 'default', 'approvals', 'ledger.json'), '{"entries": [');
  const backupPath = await backupState(sourceRoot, backupRoot, keyFilePath);
  await restoreState(backupPath, restoreRoot, keyFilePath);
  try {
    await assertRestoredState(restoreRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('approval ledger is not valid JSON')) {
      throw new Error(`corrupted fixture failed with unclear error: ${message}`);
    }
    return message;
  }
  throw new Error('corrupted fixture unexpectedly passed restore assertions');
}

export async function runRestoreRehearsal(options = {}) {
  const cleanup = options.cleanup !== false;
  const root = options.root
    ? resolve(options.root)
    : await mkdtemp(join(tmpdir(), 'frankenbeast-restore-rehearsal-'));
  if (options.root) {
    await assertSafeIsolatedRoot(root, 'restore rehearsal root');
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  }

  try {
    const sourceRoot = join(root, 'fixture-source');
    const backupRoot = join(root, 'backups');
    const restoreRoot = join(root, 'restore-target');
    const keyFilePath = join(root, 'restore-rehearsal.key');
    await writeFile(keyFilePath, 'restore rehearsal fixture key material', { mode: 0o600 });
    await buildFixtureState(sourceRoot);
    const backupPath = await backupState(sourceRoot, backupRoot, keyFilePath);
    await restoreState(backupPath, restoreRoot, keyFilePath);
    const restored = await assertRestoredState(restoreRoot);
    const corruptError = options.includeCorruptCase === false
      ? undefined
      : await runCorruptedFixtureCase(root);

    return {
      ok: true,
      root,
      backupPath,
      restoreRoot,
      restored,
      corruptFixture: corruptError ? { ok: true, error: corruptError } : { ok: 'skipped' },
    };
  } finally {
    if (cleanup) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

function parseArgs(argv) {
  const options = { cleanup: true, includeCorruptCase: true, format: 'human' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--root': options.root = readValue(); break;
      case '--keep-temp': options.cleanup = false; break;
      case '--skip-corrupt-case': options.includeCorruptCase = false; break;
      case '--format': options.format = readValue(); break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.info(`Usage: tsx scripts/restore-rehearsal.mjs [--root TMP_DIR] [--keep-temp] [--skip-corrupt-case] [--format human|json]\n\nBuilds synthetic Kanban, approval-ledger, and liveness config fixture state, backs it up through the encrypted DR backup path, restores it into an isolated temporary root, and verifies the expected records survive. The default run also corrupts a fixture approval ledger and requires a clear restore assertion error.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await runRestoreRehearsal(options);
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.format === 'human') {
    console.log('[restore-rehearsal] ok - encrypted fixture backup restored into isolated temp root');
    console.log(`[restore-rehearsal] task=${result.restored.task.id} comments=${result.restored.comments} approval=${result.restored.approvalId} workers=${result.restored.workerIds.join(',')}`);
    if (result.corruptFixture.ok === true) {
      console.log(`[restore-rehearsal] corrupt-fixture ok - ${result.corruptFixture.error}`);
    }
  } else {
    throw new Error(`Unsupported format: ${options.format}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
