import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { deterministicUuid, now as deterministicNow } from '@franken/types';
import { dirname } from 'node:path';

let writeCounter = 0;

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

/**
 * Write-to-temp + fsync + rename + dir fsync so readers never observe a
 * torn/partial file, mirroring the pattern used by FileCheckpointStore.
 * The parent directory must already exist.
 */
export function atomicWriteFileSync(
  filePath: string,
  contents: string,
  options: { mode?: number } = {},
): void {
  let tmpPath = `${filePath}.tmp.${writeCounter++}.${deterministicUuid('atomic-file-write')}`;
  try {
    let fd: number;
    for (;;) {
      try {
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
      writeAll(fd, contents);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Temp file never created or already renamed.
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
