import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { deserialize, serialize } from 'node:v8';
import type { ICheckpointStore } from '../deps.js';

const LOCK_RETRY_MS = 5;
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
// A lock whose owner cannot be identified (crash between create and write of
// the owner record) can only be reaped by age. The create-to-write window is
// microseconds, so anything unreadable past this age is abandoned. Kept well
// under the acquisition timeout so waiters can recover instead of timing out.
const UNREADABLE_LOCK_REAP_MS = 2000;
// Last-resort backstop where PID-reuse detection is unavailable (non-Linux):
// a real holder's critical section is one small read + write + fsync, so a
// lock this old is abandoned regardless of the recorded PID's apparent state.
const LIVE_LOCK_AGE_CEILING_MS = 60_000;
const MAX_ENTRY_LENGTH = 4096;

export type CheckpointLockStatus = 'absent' | 'held' | 'stale';

export interface CheckpointLockDiagnostic {
  readonly lockPath: string;
  readonly status: CheckpointLockStatus;
  readonly safeToRemove: boolean;
  readonly ageMs?: number | undefined;
  readonly ownerPid?: number | undefined;
  readonly ownerAlive?: boolean | undefined;
  readonly reason: string;
  readonly unlockHint: string;
}

export interface DetectCheckpointLockOptions {
  readonly lockTimeoutMs?: number | undefined;
  readonly nowMs?: number | undefined;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isValidEntry(line: string): boolean {
  if (line.length === 0 || line.length > MAX_ENTRY_LENGTH) {
    return false;
  }
  // Corrupted regions (interleaved or torn writes) surface as NUL bytes or control chars.
  return !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(line);
}

/** Process start time from /proc (Linux); '0' where unsupported. Detects PID reuse. */
function processStartTime(pid: number): string {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    // comm (field 2) may contain spaces/parens — fields resume after the last ')'.
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return afterComm[19] ?? '0'; // starttime is overall field 22
  } catch {
    return '0';
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function writeAll(fd: number, payload: string): void {
  const buf = Buffer.from(payload, 'utf8');
  let written = 0;
  while (written < buf.length) {
    written += writeSync(fd, buf, written, buf.length - written);
  }
}

function formatLockAge(ageMs: number | undefined): string {
  if (ageMs === undefined) return 'unknown age';
  return `${Math.max(0, Math.round(ageMs))}ms old`;
}

function staleDiagnostic(
  lockPath: string,
  reason: string,
  ageMs: number | undefined,
  ownerPid?: number | undefined,
  ownerAlive?: boolean | undefined,
): CheckpointLockDiagnostic {
  const ownerText = ownerPid === undefined ? 'no verified owner' : `owner pid ${ownerPid}${ownerAlive ? ' is not the recorded process' : ' is not running'}`;
  return {
    lockPath,
    status: 'stale',
    safeToRemove: true,
    ageMs,
    ownerPid,
    ownerAlive,
    reason,
    unlockHint: `Safe unlock hint: ${ownerText}; the lock is ${formatLockAge(ageMs)}. Remove only this lock file with: rm -- ${JSON.stringify(lockPath)}`,
  };
}

/**
 * Read-only detector for checkpoint lock files. It mirrors FileCheckpointStore's
 * reap rules but never mutates the filesystem, so PM/liveness tooling can show
 * operators whether a lock is held or safely removable before a manual unlock.
 */
export function detectCheckpointLock(
  checkpointPath: string,
  options: DetectCheckpointLockOptions = {},
): CheckpointLockDiagnostic {
  const lockPath = `${checkpointPath}.lock`;
  let owner: string;
  let ageMs: number | undefined;
  try {
    owner = readFileSync(lockPath, 'utf-8');
    ageMs = (options.nowMs ?? Date.now()) - statSync(lockPath).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        lockPath,
        status: 'absent',
        safeToRemove: false,
        reason: 'checkpoint lock file is absent',
        unlockHint: 'No unlock action is needed; retry the checkpoint operation normally.',
      };
    }
    throw error;
  }

  const ownerMatch = owner.match(/^(\d+):(\d+):[0-9a-f]{16}$/);
  if (!ownerMatch) {
    const reapAgeMs = Math.min(UNREADABLE_LOCK_REAP_MS, (options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS) / 2);
    if ((ageMs ?? 0) >= reapAgeMs) {
      return staleDiagnostic(lockPath, 'lock owner record is missing, truncated, or malformed', ageMs);
    }
    return {
      lockPath,
      status: 'held',
      safeToRemove: false,
      ageMs,
      reason: 'lock owner record is not readable yet, but it is still inside the crash-recovery grace window',
      unlockHint: `Do not remove yet. Wait until the lock is at least ${reapAgeMs}ms old, then re-run the detector before unlocking.`,
    };
  }

  const pid = Number.parseInt(ownerMatch[1]!, 10);
  const recordedStart = ownerMatch[2]!;
  const ownerAlive = isProcessAlive(pid);
  if (!ownerAlive) {
    return staleDiagnostic(lockPath, 'recorded owner process is no longer running', ageMs, pid, false);
  }

  const currentStart = processStartTime(pid);
  if (recordedStart !== '0' && currentStart === recordedStart) {
    return {
      lockPath,
      status: 'held',
      safeToRemove: false,
      ageMs,
      ownerPid: pid,
      ownerAlive: true,
      reason: 'recorded owner process is alive and matches the lock start time',
      unlockHint: `Do not remove this lock. Inspect the live owner first, for example: ps -p ${pid} -o pid,ppid,etime,command`,
    };
  }

  if (recordedStart === '0' && (ageMs ?? 0) < LIVE_LOCK_AGE_CEILING_MS) {
    return {
      lockPath,
      status: 'held',
      safeToRemove: false,
      ageMs,
      ownerPid: pid,
      ownerAlive: true,
      reason: 'owner process is alive but this platform cannot verify process start time yet',
      unlockHint: `Do not remove this lock unless process ${pid} exits or the lock exceeds ${LIVE_LOCK_AGE_CEILING_MS}ms; then re-run the detector.`,
    };
  }

  return staleDiagnostic(
    lockPath,
    recordedStart === '0'
      ? 'owner process start time is unverifiable and the lock exceeded the live-owner age ceiling'
      : 'recorded PID has been reused by a different process',
    ageMs,
    pid,
    true,
  );
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

export class FileCheckpointStore implements ICheckpointStore {
  private writeCounter = 0;
  private readonly lockToken = randomBytes(8).toString('hex');
  private readonly lockTimeoutMs: number;

  constructor(
    public readonly checkpointPath: string,
    options?: { lockTimeoutMs?: number },
  ) {
    this.lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  }

  has(key: string): boolean {
    return this.readAll().has(key);
  }

  write(key: string): void {
    // Newlines never survive the line-oriented format, and isValidEntry is the
    // exact filter readAll applies — rejecting here keeps write/read symmetric.
    if (key.includes('\n') || !isValidEntry(key)) {
      throw new Error(
        `Invalid checkpoint key (empty, too long, newline, or control characters): ${key.slice(0, 80)}`,
      );
    }
    mkdirSync(dirname(this.checkpointPath), { recursive: true });
    this.withLock(() => {
      const entries = this.readEntries();
      entries.push(key);
      this.atomicReplace(entries);
    });
  }

  readAll(): Set<string> {
    return new Set(this.readEntries());
  }

  clear(): void {
    if (!existsSync(this.checkpointPath) && !existsSync(this.taskOutputDir)) {
      return;
    }
    mkdirSync(dirname(this.checkpointPath), { recursive: true });
    this.withLock(() => {
      if (existsSync(this.checkpointPath)) {
        this.atomicReplace([]);
      }
      rmSync(this.taskOutputDir, { recursive: true, force: true });
    });
  }

  writeTaskOutput(taskId: string, output: unknown): void {
    const outputPath = this.taskOutputPath(taskId);
    let payload: string;
    try {
      const serialized = serialize(output);
      const rehydrated = deserialize(serialized);
      if (!isDeepStrictEqual(rehydrated, output)) {
        this.promoteTaskOutputToStale(outputPath);
        return;
      }
      payload = serialized.toString('base64');
    } catch {
      // Checkpoint markers must never fail a successful task just because its
      // output cannot be cloned or faithfully rehydrated. Persist what can be
      // safely rehydrated and fall back to the last known-good dependency cache
      // otherwise. That preserves availability for downstream resume paths while
      // keeping the primary cache honest for future writes.
      this.promoteTaskOutputToStale(outputPath);
      return;
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    this.withLock(() => {
      this.copyTaskOutputToStale(outputPath);
      this.atomicWriteFile(outputPath, payload);
    });
  }

  readTaskOutput(taskId: string): { found: boolean; output?: unknown; stale?: boolean | undefined; staleReason?: 'missing-primary' | 'corrupt-primary' | undefined } {
    let payload: string;
    try {
      payload = readFileSync(this.taskOutputPath(taskId), 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.readStaleTaskOutput(taskId, 'missing-primary');
      }
      throw error;
    }
    try {
      return { found: true, output: deserialize(Buffer.from(payload, 'base64')) };
    } catch {
      return this.readStaleTaskOutput(taskId, 'corrupt-primary');
    }
  }

  recordCommit(taskId: string, stage: string, iteration: number, commitHash: string): void {
    this.write(`${taskId}:${stage}:iter_${iteration}:commit_${commitHash}`);
  }

  lastCommit(taskId: string, stage: string): string | undefined {
    const prefix = `${taskId}:${stage}:iter_`;
    const all = this.readAll();
    let last: string | undefined;
    for (const entry of all) {
      if (entry.startsWith(prefix)) {
        const commitMatch = entry.match(/:commit_(.+)$/);
        if (commitMatch?.[1]) {
          last = commitMatch[1];
        }
      }
    }
    return last;
  }

  /** Reads entries, dropping corrupted lines so a damaged file degrades instead of poisoning recovery. */
  private readEntries(): string[] {
    let content: string;
    try {
      content = readFileSync(this.checkpointPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    return content.split('\n').filter(isValidEntry);
  }

  private taskOutputPath(taskId: string): string {
    const outputKey = createHash('sha256').update(taskId).digest('hex');
    return join(this.taskOutputDir, `${outputKey}.v8`);
  }

  private staleTaskOutputPath(taskId: string): string {
    return `${this.taskOutputPath(taskId)}.stale`;
  }

  private readStaleTaskOutput(
    taskId: string,
    staleReason: 'missing-primary' | 'corrupt-primary',
  ): { found: boolean; output?: unknown; stale?: boolean | undefined; staleReason?: 'missing-primary' | 'corrupt-primary' | undefined } {
    try {
      const payload = readFileSync(this.staleTaskOutputPath(taskId), 'utf-8');
      return {
        found: true,
        output: deserialize(Buffer.from(payload, 'base64')),
        stale: true,
        staleReason,
      };
    } catch {
      return { found: false };
    }
  }

  private get taskOutputDir(): string {
    return `${this.checkpointPath}.outputs`;
  }

  private copyTaskOutputToStale(outputPath: string): void {
    let payload: string;
    try {
      payload = readFileSync(outputPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      return;
    }
    try {
      deserialize(Buffer.from(payload, 'base64'));
    } catch {
      // Do not replace a known-good stale cache with an unreadable primary.
      return;
    }
    this.atomicWriteFile(`${outputPath}.stale`, payload);
  }

  private promoteTaskOutputToStale(outputPath: string): void {
    mkdirSync(dirname(outputPath), { recursive: true });
    this.withLock(() => {
      this.copyTaskOutputToStale(outputPath);
      this.deleteTaskOutput(outputPath);
    });
  }

  private deleteTaskOutput(outputPath: string): void {
    try {
      unlinkSync(outputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /** Write-to-temp + fsync + rename + dir fsync so readers never observe a torn file. */
  private atomicReplace(entries: string[]): void {
    const payload = entries.length > 0 ? entries.join('\n') + '\n' : '';
    this.atomicWriteFile(this.checkpointPath, payload);
  }

  /** Write-to-temp + fsync + rename + dir fsync so readers never observe a torn file. */
  private atomicWriteFile(targetPath: string, payload: string): void {
    const tmpPath = `${targetPath}.tmp.${this.writeCounter++}.${this.lockToken}`;
    try {
      const fd = openSync(tmpPath, 'w');
      try {
        writeAll(fd, payload);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmpPath, targetPath);
    } catch (error) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Temp file never created or already renamed.
      }
      throw error;
    }
    fsyncDir(dirname(targetPath));
  }

  private get lockOwnerRecord(): string {
    return `${process.pid}:${processStartTime(process.pid)}:${this.lockToken}`;
  }

  /**
   * Reaps a lock only when its owner is provably gone. The rename makes the
   * reap atomic: of several waiters that all observed the dead owner, exactly
   * one wins the rename and removes the lock; the rest retry acquisition.
   */
  private tryReapLock(lockPath: string): void {
    let owner: string;
    try {
      owner = readFileSync(lockPath, 'utf-8');
    } catch {
      return; // Lock vanished — retry acquisition.
    }

    // Only a complete pid:starttime:token record proves a checkable owner.
    // Truncated records (crash mid-write, e.g. "1") must not pin the lock to
    // an unrelated live PID forever.
    const ownerMatch = owner.match(/^(\d+):(\d+):[0-9a-f]{16}$/);
    if (ownerMatch) {
      const pid = Number.parseInt(ownerMatch[1]!, 10);
      const recordedStart = ownerMatch[2]!;
      if (isProcessAlive(pid)) {
        if (recordedStart !== '0' && processStartTime(pid) === recordedStart) {
          // Verified live owner (PID + start time match rules out reuse) —
          // never break its lock, however long it holds it.
          return;
        }
        if (recordedStart === '0') {
          // Owner identity cannot be verified (no start time available):
          // the age ceiling is the only backstop against PID reuse.
          try {
            if (Date.now() - statSync(lockPath).mtimeMs < LIVE_LOCK_AGE_CEILING_MS) {
              return;
            }
          } catch {
            return;
          }
        }
        // Live PID with a mismatched start time is a reused PID — reap.
      }
      // Dead owner, reused PID, or unverifiable past the ceiling — reap.
    } else {
      // Unreadable owner record: only the age fallback applies. Cap it below
      // the acquisition timeout so a post-crash writer recovers rather than
      // timing out before the fallback can fire.
      const reapAgeMs = Math.min(UNREADABLE_LOCK_REAP_MS, this.lockTimeoutMs / 2);
      try {
        if (Date.now() - statSync(lockPath).mtimeMs < reapAgeMs) {
          return;
        }
      } catch {
        return;
      }
    }

    // Filename-safe (no colons — they are invalid on Windows outside the drive prefix).
    const reapPath = `${lockPath}.reap.${this.lockToken}`;
    try {
      renameSync(lockPath, reapPath);
      unlinkSync(reapPath);
    } catch {
      // Another waiter won the reap race — retry acquisition.
    }
  }

  private withLock(fn: () => void): void {
    const lockPath = `${this.checkpointPath}.lock`;
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      try {
        const fd = openSync(lockPath, 'wx');
        try {
          writeAll(fd, this.lockOwnerRecord);
        } finally {
          closeSync(fd);
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        this.tryReapLock(lockPath);
        if (Date.now() >= deadline) {
          throw new Error(`Timed out acquiring checkpoint lock: ${lockPath}`);
        }
        sleepSync(LOCK_RETRY_MS);
      }
    }
    try {
      fn();
    } finally {
      // Release only a lock we still own; live locks are never reaped by
      // peers, so a mismatch means we should leave it alone.
      try {
        if (readFileSync(lockPath, 'utf-8') === this.lockOwnerRecord) {
          unlinkSync(lockPath);
        }
      } catch {
        // Lock already gone.
      }
    }
  }
}
