import { appendFile, mkdir, readFile, readdir, rename, stat, truncate, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { isoNow } from '@franken/types';

const DEFAULT_MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ROTATED_LOG_FILES = 3;
const MAX_ROTATED_LOG_FILES = 100;
const MIN_LOG_FILE_BYTES = 128;

export interface BeastLogStoreOptions {
  /** Maximum active per-attempt log size before rotation. Defaults to 10 MiB. */
  readonly maxLogFileBytes?: number | undefined;
  /** Number of rotated per-attempt logs to retain. Defaults to 3; values < 1 truncate in place. */
  readonly maxRotatedLogFiles?: number | undefined;
}

interface LogRecord {
  readonly stream: 'stdout' | 'stderr';
  readonly message: string;
  readonly createdAt: string;
  readonly truncatedBytes?: number | undefined;
}

export class BeastLogStore {
  private readonly maxLogFileBytes: number;
  private readonly maxRotatedLogFiles: number;
  private readonly appendQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly logDir: string,
    options: BeastLogStoreOptions = {},
  ) {
    this.maxLogFileBytes = Math.max(options.maxLogFileBytes ?? DEFAULT_MAX_LOG_FILE_BYTES, MIN_LOG_FILE_BYTES);
    this.maxRotatedLogFiles = Math.min(options.maxRotatedLogFiles ?? DEFAULT_MAX_ROTATED_LOG_FILES, MAX_ROTATED_LOG_FILES);
  }

  async append(
    runId: string,
    attemptId: string,
    stream: 'stdout' | 'stderr',
    message: string,
    createdAt = isoNow(),
  ): Promise<void> {
    const filePath = this.resolvePath(runId, attemptId);
    const previous = this.appendQueues.get(filePath) ?? Promise.resolve();
    const current = previous.then(() => this.appendSerialized(filePath, stream, message, createdAt));
    const queued = current.catch(() => undefined);
    this.appendQueues.set(filePath, queued);
    void queued.then(() => {
      if (this.appendQueues.get(filePath) === queued) {
        this.appendQueues.delete(filePath);
      }
    });
    await current;
  }

  async read(runId: string, attemptId: string): Promise<string[]> {
    const filePath = this.resolvePath(runId, attemptId);
    const paths = await this.listReadableLogPaths(filePath);
    const lines: string[] = [];

    for (const path of paths) {
      try {
        const raw = await readFile(path, 'utf-8');
        lines.push(
          ...raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }

    return lines;
  }

  private async appendSerialized(
    filePath: string,
    stream: 'stdout' | 'stderr',
    message: string,
    createdAt: string,
  ): Promise<void> {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      const line = this.serializeBoundedRecord({ stream, message, createdAt });
      await this.rotateOrTruncateBeforeAppend(filePath, Buffer.byteLength(line));
      await appendFile(filePath, line, 'utf-8');
    } catch (err) {
      // Log directory may have been removed (e.g., during test cleanup).
      // Swallow ENOENT — logging should never crash the caller.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  private serializeBoundedRecord(record: LogRecord): string {
    const full = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(full) <= this.maxLogFileBytes) {
      return full;
    }

    const recordBytes = Buffer.byteLength(record.message);
    let low = 0;
    let high = recordBytes;
    let bounded = this.serializeTruncatedRecord(record, '');

    while (low <= high) {
      const midpoint = Math.floor((low + high) / 2);
      const currentMessage = truncateUtf8(record.message, midpoint);
      const candidate = this.serializeTruncatedRecord(record, currentMessage);
      if (Buffer.byteLength(candidate) <= this.maxLogFileBytes) {
        bounded = candidate;
        low = midpoint + 1;
      } else {
        high = midpoint - 1;
      }
    }

    if (Buffer.byteLength(bounded) > this.maxLogFileBytes) {
      return `${JSON.stringify({
        stream: record.stream,
        createdAt: record.createdAt,
        message: '[truncated]',
        truncatedBytes: Buffer.byteLength(record.message),
      })}\n`;
    }

    return bounded;
  }

  private serializeTruncatedRecord(record: LogRecord, messagePrefix: string): string {
    const truncatedBytes = Math.max(0, Buffer.byteLength(record.message) - Buffer.byteLength(messagePrefix));
    return `${JSON.stringify({
      ...record,
      message: `${messagePrefix}\n[truncated ${truncatedBytes} bytes to enforce log size cap]`,
      truncatedBytes,
    })}\n`;
  }

  private async rotateOrTruncateBeforeAppend(filePath: string, nextWriteBytes: number): Promise<void> {
    if (nextWriteBytes > this.maxLogFileBytes) {
      await this.truncateActiveFile(filePath);
      return;
    }

    const currentBytes = await fileSize(filePath);
    if (currentBytes > this.maxLogFileBytes) {
      await this.removeRotationsAboveRetention(filePath);
      await this.truncateActiveFile(filePath);
      return;
    }

    if (currentBytes === 0 || currentBytes + nextWriteBytes <= this.maxLogFileBytes) {
      await this.removeRotationsAboveRetention(filePath);
      return;
    }

    if (this.maxRotatedLogFiles < 1) {
      await this.removeRotationsAboveRetention(filePath);
      await this.truncateActiveFile(filePath);
      return;
    }

    await this.rotateFiles(filePath);
  }

  private async rotateFiles(filePath: string): Promise<void> {
    await this.removeRotationsAboveRetention(filePath);
    await rmIfExists(`${filePath}.${this.maxRotatedLogFiles}`);
    for (let index = this.maxRotatedLogFiles - 1; index >= 1; index -= 1) {
      await renameIfExists(`${filePath}.${index}`, `${filePath}.${index + 1}`);
    }
    await renameIfExists(filePath, `${filePath}.1`);
  }

  private async removeRotationsAboveRetention(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    const prefix = `${basename(filePath)}.`;
    try {
      const entries = await readdir(dir);
      await Promise.all(
        entries
          .map((entry) => ({ entry, index: parseRotationIndex(entry, prefix) }))
          .filter(({ index }) => index > this.maxRotatedLogFiles)
          .map(({ entry }) => rmIfExists(join(dir, entry))),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async listReadableLogPaths(filePath: string): Promise<string[]> {
    const dir = dirname(filePath);
    const prefix = `${basename(filePath)}.`;
    try {
      const entries = await readdir(dir);
      const rotatedPaths = entries
        .map((entry) => ({ entry, index: parseRotationIndex(entry, prefix) }))
        .filter(({ index }) => index >= 1 && index <= this.maxRotatedLogFiles)
        .sort((left, right) => right.index - left.index)
        .map(({ entry }) => join(dir, entry));
      return [...rotatedPaths, filePath];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [filePath];
      throw error;
    }
  }

  private async truncateActiveFile(filePath: string): Promise<void> {
    try {
      await truncate(filePath, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private resolvePath(runId: string, attemptId: string): string {
    return join(this.logDir, runId, `${attemptId}.log`);
  }
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function rmIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function renameIfExists(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const buffer = Buffer.from(value);
  if (buffer.length <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/u, '');
}

function parseRotationIndex(entry: string, prefix: string): number {
  if (!entry.startsWith(prefix)) return 0;
  const suffix = entry.slice(prefix.length);
  if (!/^\d+$/u.test(suffix)) return 0;
  return Number(suffix);
}
