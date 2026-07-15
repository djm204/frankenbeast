import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { deterministicUuid, now as deterministicNow } from '@franken/types';
import { basename, dirname, join, resolve } from 'node:path';

const STALE_JOURNAL_AGE_MS = 5 * 60_000;
const JOURNAL_REFRESH_INTERVAL_MS = 5_000;
const WRITE_CHUNK_BYTES = 1024 * 1024;
let writeCounter = 0;

export type StateWriteJournalPhase = 'preparing' | 'writing-temp' | 'renaming';

export interface StateWriteTransactionJournal {
  readonly schemaVersion: 1;
  readonly targetPath: string;
  readonly tempPath: string;
  readonly phase: StateWriteJournalPhase;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface StateWriteJournalRecovery {
  readonly journalPath: string;
  readonly targetPath?: string | undefined;
  readonly tempPath?: string | undefined;
  readonly quarantinePath?: string | undefined;
  readonly action:
    | 'removed-stale-temp'
    | 'removed-completed-journal'
    | 'quarantined-invalid-journal'
    | 'retained-active-journal';
  readonly reason: string;
}

function writeAll(fd: number, payload: string, onProgress?: () => void): void {
  const buf = Buffer.from(payload, 'utf8');
  let written = 0;
  while (written < buf.length) {
    const bytesToWrite = Math.min(WRITE_CHUNK_BYTES, buf.length - written);
    written += writeSync(fd, buf, written, bytesToWrite);
    onProgress?.();
  }
}

/** Best-effort directory fsync so a rename survives power loss; ignored where unsupported. */
function fsyncDir(dirPath: string): void {
  try {
    const fd = openSync(dirPath, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Directory fsync is not supported on all platforms — durability is best-effort there.
  }
}

export function stateWriteJournalPath(filePath: string): string {
  return `${filePath}.journal`;
}

function journalTimestamp(): string {
  return new Date().toISOString();
}

function writeStateWriteJournal(filePath: string, entry: Omit<StateWriteTransactionJournal, 'updatedAt'>): void {
  const updatedEntry: StateWriteTransactionJournal = {
    ...entry,
    updatedAt: journalTimestamp(),
  };
  const journalPath = stateWriteJournalPath(filePath);
  const payload = JSON.stringify(updatedEntry, null, 2);
  let journalTempPath = `${journalPath}.tmp.${writeCounter++}.${deterministicUuid('state-write-journal')}`;
  let fd: number;
  for (;;) {
    try {
      fd = openSync(journalTempPath, 'wx', 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      journalTempPath = `${journalPath}.tmp.${writeCounter++}.${deterministicUuid('state-write-journal')}`;
    }
  }
  try {
    writeAll(fd, payload);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(journalTempPath, journalPath);
  fsyncDir(dirname(filePath));
}

function parseStateWriteJournal(raw: string, journalPath: string): StateWriteTransactionJournal {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`state write journal ${journalPath} must be a JSON object`);
  }
  const value = parsed as Partial<StateWriteTransactionJournal>;
  if (value.schemaVersion !== 1) {
    throw new Error(`state write journal ${journalPath} has unsupported schemaVersion`);
  }
  if (typeof value.targetPath !== 'string' || value.targetPath.length === 0) {
    throw new Error(`state write journal ${journalPath} targetPath must be a non-empty string`);
  }
  if (typeof value.tempPath !== 'string' || value.tempPath.length === 0) {
    throw new Error(`state write journal ${journalPath} tempPath must be a non-empty string`);
  }
  if (value.phase !== 'preparing' && value.phase !== 'writing-temp' && value.phase !== 'renaming') {
    throw new Error(`state write journal ${journalPath} phase is unsupported`);
  }
  if (typeof value.startedAt !== 'string' || value.startedAt.length === 0) {
    throw new Error(`state write journal ${journalPath} startedAt must be a non-empty string`);
  }
  if (!Number.isFinite(Date.parse(value.startedAt))) {
    throw new Error(`state write journal ${journalPath} startedAt must be a valid ISO timestamp`);
  }
  if (typeof value.updatedAt !== 'string' || value.updatedAt.length === 0) {
    throw new Error(`state write journal ${journalPath} updatedAt must be a non-empty string`);
  }
  if (!Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error(`state write journal ${journalPath} updatedAt must be a valid ISO timestamp`);
  }
  return {
    schemaVersion: 1,
    targetPath: value.targetPath,
    tempPath: value.tempPath,
    phase: value.phase,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
  };
}

export function readStateWriteTransactionJournal(filePath: string): StateWriteTransactionJournal | undefined {
  const journalPath = stateWriteJournalPath(filePath);
  try {
    return parseStateWriteJournal(readFileSync(journalPath, 'utf8'), journalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function pathsReferenceSameFile(left: string, right: string): boolean {
  if (resolve(left) === resolve(right)) {
    return true;
  }
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    // Fall back to comparing the canonical parent directory when the target
    // file itself does not exist yet.
  }
  try {
    return join(realpathSync.native(dirname(left)), basename(left)) === join(realpathSync.native(dirname(right)), basename(right));
  } catch {
    return false;
  }
}

function journalTempPathBelongsToTarget(tempPath: string, filePath: string): boolean {
  const resolvedTempPath = resolve(tempPath);
  const resolvedTargetPath = resolve(filePath);
  if (dirname(resolvedTempPath) !== dirname(resolvedTargetPath)) {
    return false;
  }
  if (!resolvedTempPath.startsWith(`${resolvedTargetPath}.tmp.`)) {
    return false;
  }
  try {
    return statSync(resolvedTempPath).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true;
    }
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupStaleJournalTempFiles(filePath: string): void {
  const journalPath = stateWriteJournalPath(filePath);
  const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const journalTempPattern = new RegExp(
    `^${escapeRegExp(basename(journalPath))}\\.tmp\\.[0-9]+\\.${uuidPattern}$`,
  );
  let removed = false;
  try {
    for (const entry of readdirSync(dirname(journalPath))) {
      if (!journalTempPattern.test(entry)) {
        continue;
      }
      const tempPath = join(dirname(journalPath), entry);
      try {
        if (Date.now() - statSync(tempPath).mtimeMs >= STALE_JOURNAL_AGE_MS) {
          rmSync(tempPath, { force: true });
          removed = true;
        }
      } catch {
        // The temp may have been renamed or removed by another recovery attempt.
      }
    }
  } catch {
    return;
  }
  if (removed) {
    fsyncDir(dirname(filePath));
  }
}

function isStaleJournal(journal: StateWriteTransactionJournal): boolean {
  const updatedAtMs = Date.parse(journal.updatedAt);
  return Date.now() - updatedAtMs >= STALE_JOURNAL_AGE_MS;
}

function sameStateWriteTransaction(
  left: StateWriteTransactionJournal,
  right: Omit<StateWriteTransactionJournal, 'updatedAt' | 'phase'>,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    pathsReferenceSameFile(left.targetPath, right.targetPath) &&
    pathsReferenceSameFile(left.tempPath, right.tempPath) &&
    left.startedAt === right.startedAt
  );
}

function removeStateWriteJournalIfCurrent(
  filePath: string,
  expected: Omit<StateWriteTransactionJournal, 'updatedAt' | 'phase'>,
): void {
  const journalPath = stateWriteJournalPath(filePath);
  try {
    const journal = parseStateWriteJournal(readFileSync(journalPath, 'utf8'), journalPath);
    if (!sameStateWriteTransaction(journal, expected)) {
      return;
    }
    rmSync(journalPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

/**
 * Recovers an interrupted state write transaction recorded by the sidecar journal.
 * A leftover temp file is always discarded because the target path is either still
 * the last complete state or has already been atomically replaced by rename().
 */
export function recoverStateWriteTransaction(filePath: string): StateWriteJournalRecovery | undefined {
  cleanupStaleJournalTempFiles(filePath);
  const journalPath = stateWriteJournalPath(filePath);
  let journal: StateWriteTransactionJournal;
  try {
    journal = parseStateWriteJournal(readFileSync(journalPath, 'utf8'), journalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    const quarantinePath = quarantineFile(journalPath);
    return {
      journalPath,
      ...(quarantinePath === undefined ? {} : { quarantinePath }),
      action: 'quarantined-invalid-journal',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const targetMatches = pathsReferenceSameFile(journal.targetPath, filePath);
  if (targetMatches && !journalTempPathBelongsToTarget(journal.tempPath, filePath)) {
    const quarantinePath = quarantineFile(journalPath);
    return {
      journalPath,
      targetPath: journal.targetPath,
      tempPath: journal.tempPath,
      ...(quarantinePath === undefined ? {} : { quarantinePath }),
      action: 'quarantined-invalid-journal',
      reason: `State write journal tempPath ${journal.tempPath} is not an expected sidecar for ${filePath}.`,
    };
  }

  if (targetMatches && journal.phase === 'preparing') {
    if (!isStaleJournal(journal)) {
      return {
        journalPath,
        targetPath: journal.targetPath,
        tempPath: journal.tempPath,
        action: 'retained-active-journal',
        reason: `State write journal ${journalPath} is still preparing; refusing to remove live journal for ${journal.tempPath}.`,
      };
    }
    rmSync(journalPath, { force: true });
    fsyncDir(dirname(filePath));
    return {
      journalPath,
      targetPath: journal.targetPath,
      tempPath: journal.tempPath,
      action: 'removed-completed-journal',
      reason: `Removed stale preparing state write journal without deleting ${journal.tempPath}; preparing journals do not prove ownership of an existing temp file.`,
    };
  }

  if (targetMatches && existsSync(journal.tempPath)) {
    if (!isStaleJournal(journal)) {
      return {
        journalPath,
        targetPath: journal.targetPath,
        tempPath: journal.tempPath,
        action: 'retained-active-journal',
        reason: `State write journal ${journalPath} is still active; refusing to remove live temp file ${journal.tempPath}.`,
      };
    }
    rmSync(journal.tempPath, { force: true });
    rmSync(journalPath, { force: true });
    fsyncDir(dirname(filePath));
    return {
      journalPath,
      targetPath: journal.targetPath,
      tempPath: journal.tempPath,
      action: 'removed-stale-temp',
      reason: `Recovered interrupted ${journal.phase} state write by removing the journaled temp file; target remains the last complete file or the already-renamed replacement.`,
    };
  }

  rmSync(journalPath, { force: true });
  fsyncDir(dirname(filePath));
  return {
    journalPath,
    targetPath: journal.targetPath,
    tempPath: journal.tempPath,
    action: 'removed-completed-journal',
    reason: targetMatches
      ? 'Recovered completed state write by removing a journal whose temp file was already gone.'
      : 'Removed state write journal because it does not belong to this target path.',
  };
}

/**
 * Write-to-temp + fsync + rename + dir fsync so readers never observe a
 * torn/partial file, mirroring the pattern used by FileCheckpointStore.
 * The parent directory must already exist. A sidecar `<target>.journal` records
 * the in-flight state write so the next writer can remove interrupted temp files
 * and operators can tell whether a stale temp file is from an incomplete write.
 */
export function atomicWriteFileSync(
  filePath: string,
  contents: string,
  options: { mode?: number } = {},
): void {
  const recovery = recoverStateWriteTransaction(filePath);
  if (recovery?.action === 'retained-active-journal') {
    throw new Error(recovery.reason);
  }
  let tmpPath = `${filePath}.tmp.${writeCounter++}.${deterministicUuid('atomic-file-write')}`;
  const startedAt = journalTimestamp();
  const journalBase = {
    schemaVersion: 1 as const,
    targetPath: resolve(filePath),
    tempPath: resolve(tmpPath),
    startedAt,
  };
  try {
    let fd: number;
    for (;;) {
      try {
        writeStateWriteJournal(filePath, { ...journalBase, tempPath: resolve(tmpPath), phase: 'preparing' });
        fd = openSync(tmpPath, 'wx', options.mode);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        tmpPath = `${filePath}.tmp.${writeCounter++}.${deterministicUuid('atomic-file-write')}`;
      }
    }
    try {
      const writingJournal = { ...journalBase, tempPath: resolve(tmpPath), phase: 'writing-temp' as const };
      let lastJournalRefreshMs = Date.now();
      const refreshWritingJournal = (): void => {
        const nowMs = Date.now();
        if (nowMs - lastJournalRefreshMs < JOURNAL_REFRESH_INTERVAL_MS) {
          return;
        }
        writeStateWriteJournal(filePath, writingJournal);
        lastJournalRefreshMs = nowMs;
      };
      writeStateWriteJournal(filePath, writingJournal);
      writeAll(fd, contents, refreshWritingJournal);
      writeStateWriteJournal(filePath, writingJournal);
      fsyncSync(fd);
      writeStateWriteJournal(filePath, writingJournal);
    } finally {
      closeSync(fd);
    }
    writeStateWriteJournal(filePath, { ...journalBase, tempPath: resolve(tmpPath), phase: 'renaming' });
    renameSync(tmpPath, filePath);
    fsyncDir(dirname(filePath));
    removeStateWriteJournalIfCurrent(filePath, { ...journalBase, tempPath: resolve(tmpPath) });
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Temp file never created or already renamed.
    }
    removeStateWriteJournalIfCurrent(filePath, { ...journalBase, tempPath: resolve(tmpPath) });
    throw error;
  }
  fsyncDir(dirname(filePath));
}

/** Moves a file aside so a corrupt payload cannot poison future reads or list scans. */
export function quarantineFile(filePath: string): string | undefined {
  const quarantinePath = `${filePath}.corrupt.${deterministicNow()}.${deterministicUuid('atomic-file-quarantine')}`;
  try {
    renameSync(filePath, quarantinePath);
    return quarantinePath;
  } catch {
    // Already moved/removed by a concurrent quarantine attempt — nothing to do.
    return undefined;
  }
}

/**
 * Reads and parses a JSON file. Returns undefined when the file is missing.
 * When the file exists but cannot be parsed — corruption from a torn write,
 * disk error, truncation, etc. — the bad file is quarantined (renamed aside,
 * never deleted) and undefined is returned so callers (list/load) can
 * degrade gracefully instead of throwing.
 */
export function readJsonFileOrQuarantine<T>(filePath: string): T | undefined {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    quarantineFile(filePath);
    return undefined;
  }
}
