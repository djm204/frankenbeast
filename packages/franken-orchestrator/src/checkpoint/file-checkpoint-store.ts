import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { ICheckpointStore } from '../deps.js';

const LOCK_RETRY_MS = 5;
const LOCK_TIMEOUT_MS = 5000;
// Lock holders only do a read + atomic rename, so anything older than this is a dead process.
const STALE_LOCK_MS = 1000;
const MAX_ENTRY_LENGTH = 4096;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isValidEntry(line: string): boolean {
  if (line.length === 0 || line.length > MAX_ENTRY_LENGTH) {
    return false;
  }
  // Corrupted regions (interleaved or torn writes) surface as NUL bytes or control chars.
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(line);
}

export class FileCheckpointStore implements ICheckpointStore {
  private writeCounter = 0;

  constructor(public readonly checkpointPath: string) {}

  has(key: string): boolean {
    return this.readAll().has(key);
  }

  write(key: string): void {
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
    if (!existsSync(this.checkpointPath)) {
      return;
    }
    this.withLock(() => {
      this.atomicReplace([]);
    });
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

  /** Write-to-temp + rename so readers never observe a partially written file. */
  private atomicReplace(entries: string[]): void {
    const tmpPath = `${this.checkpointPath}.tmp.${process.pid}.${this.writeCounter++}`;
    const fd = openSync(tmpPath, 'w');
    try {
      const payload = entries.length > 0 ? entries.join('\n') + '\n' : '';
      writeSync(fd, payload);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, this.checkpointPath);
  }

  private withLock(fn: () => void): void {
    const lockPath = `${this.checkpointPath}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const fd = openSync(lockPath, 'wx');
        closeSync(fd);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
            unlinkSync(lockPath);
            continue;
          }
        } catch {
          // Lock vanished between checks — retry acquisition.
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out acquiring checkpoint lock: ${lockPath}`);
        }
        sleepSync(LOCK_RETRY_MS);
      }
    }
    try {
      fn();
    } finally {
      try {
        unlinkSync(lockPath);
      } catch {
        // Already removed (e.g. broken as stale by a peer) — nothing to release.
      }
    }
  }
}
