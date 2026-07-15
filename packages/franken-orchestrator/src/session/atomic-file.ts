import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { deterministicUuid, now as deterministicNow } from '@franken/types';
import { dirname } from 'node:path';

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
  readonly action: 'removed-stale-temp' | 'removed-completed-journal' | 'quarantined-invalid-journal';
  readonly reason: string;
}

function writeAll(fd: number, payload: string): void {
  const buf = Buffer.from(payload, 'utf8');
  let written = 0;
  while (written < buf.length) {
    written += writeSync(fd, buf, written, buf.length - written);
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
  return new Date(deterministicNow()).toISOString();
}

function writeStateWriteJournal(filePath: string, entry: Omit<StateWriteTransactionJournal, 'updatedAt'>): void {
  const updatedEntry: StateWriteTransactionJournal = {
    ...entry,
    updatedAt: journalTimestamp(),
  };
  writeFileSync(stateWriteJournalPath(filePath), JSON.stringify(updatedEntry, null, 2), 'utf8');
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
  if (typeof value.updatedAt !== 'string' || value.updatedAt.length === 0) {
    throw new Error(`state write journal ${journalPath} updatedAt must be a non-empty string`);
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

/**
 * Recovers an interrupted state write transaction recorded by the sidecar journal.
 * A leftover temp file is always discarded because the target path is either still
 * the last complete state or has already been atomically replaced by rename().
 */
export function recoverStateWriteTransaction(filePath: string): StateWriteJournalRecovery | undefined {
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

  const targetMatches = journal.targetPath === filePath;
  if (targetMatches && existsSync(journal.tempPath)) {
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
  recoverStateWriteTransaction(filePath);
  let tmpPath = `${filePath}.tmp.${writeCounter++}.${deterministicUuid('atomic-file-write')}`;
  const startedAt = journalTimestamp();
  const journalBase = {
    schemaVersion: 1 as const,
    targetPath: filePath,
    tempPath: tmpPath,
    startedAt,
  };
  try {
    let fd: number;
    for (;;) {
      try {
        writeStateWriteJournal(filePath, { ...journalBase, tempPath: tmpPath, phase: 'preparing' });
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
      writeStateWriteJournal(filePath, { ...journalBase, tempPath: tmpPath, phase: 'writing-temp' });
      writeAll(fd, contents);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    writeStateWriteJournal(filePath, { ...journalBase, tempPath: tmpPath, phase: 'renaming' });
    renameSync(tmpPath, filePath);
    rmSync(stateWriteJournalPath(filePath), { force: true });
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Temp file never created or already renamed.
    }
    try {
      rmSync(stateWriteJournalPath(filePath), { force: true });
    } catch {
      // The journal was never written or has already been recovered.
    }
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
