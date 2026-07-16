import { appendFile, mkdir, readFile, rename, stat, truncate, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isoNow } from '@franken/types';

const DEFAULT_MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ROTATED_LOG_FILES = 3;
const TRUNCATION_SUFFIX_BYTES = 64;
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

  constructor(
    private readonly logDir: string,
    options: BeastLogStoreOptions = {},
  ) {
    this.maxLogFileBytes = Math.max(options.maxLogFileBytes ?? DEFAULT_MAX_LOG_FILE_BYTES, MIN_LOG_FILE_BYTES);
    this.maxRotatedLogFiles = options.maxRotatedLogFiles ?? DEFAULT_MAX_ROTATED_LOG_FILES;
  }

  async append(
    runId: string,
    attemptId: string,
    stream: 'stdout' | 'stderr',
    message: string,
    createdAt = isoNow(),
  ): Promise<void> {
    const filePath = this.resolvePath(runId, attemptId);
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

  async read(runId: string, attemptId: string): Promise<string[]> {
    try {
      const raw = await readFile(this.resolvePath(runId, attemptId), 'utf-8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private serializeBoundedRecord(record: LogRecord): string {
    const full = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(full) <= this.maxLogFileBytes) {
      return full;
    }

    const baseRecord = { ...record, message: '', truncatedBytes: 0 };
    const overhead = Buffer.byteLength(`${JSON.stringify(baseRecord)}\n`) + TRUNCATION_SUFFIX_BYTES;
    const maxMessageBytes = Math.max(0, this.maxLogFileBytes - overhead);
    let currentMessage = truncateUtf8(record.message, maxMessageBytes);
    let truncatedBytes = Math.max(0, Buffer.byteLength(record.message) - Buffer.byteLength(currentMessage));
    let bounded = `${JSON.stringify({
      ...record,
      message: `${currentMessage}\n[truncated ${truncatedBytes} bytes to enforce log size cap]`,
      truncatedBytes,
    })}\n`;

    while (Buffer.byteLength(bounded) > this.maxLogFileBytes && currentMessage.length > 0) {
      const previousMessage = currentMessage;
      currentMessage = truncateUtf8(currentMessage, Math.max(0, Buffer.byteLength(currentMessage) - 16));
      truncatedBytes = Math.max(0, Buffer.byteLength(record.message) - Buffer.byteLength(currentMessage));
      bounded = `${JSON.stringify({
        ...record,
        message: `${currentMessage}\n[truncated ${truncatedBytes} bytes to enforce log size cap]`,
        truncatedBytes,
      })}\n`;
      if (currentMessage === previousMessage) break;
    }

    if (Buffer.byteLength(bounded) > this.maxLogFileBytes) {
      return `${JSON.stringify({
        stream: record.stream,
        message: '[truncated oversized log record to enforce log size cap]',
        createdAt: record.createdAt,
        truncatedBytes: Buffer.byteLength(record.message),
      })}\n`;
    }

    return bounded;
  }

  private async rotateOrTruncateBeforeAppend(filePath: string, nextWriteBytes: number): Promise<void> {
    if (nextWriteBytes > this.maxLogFileBytes) {
      await this.truncateActiveFile(filePath);
      return;
    }

    const currentBytes = await fileSize(filePath);
    if (currentBytes === 0 || currentBytes + nextWriteBytes <= this.maxLogFileBytes) {
      return;
    }

    if (this.maxRotatedLogFiles < 1) {
      await this.truncateActiveFile(filePath);
      return;
    }

    await this.rotateFiles(filePath);
  }

  private async rotateFiles(filePath: string): Promise<void> {
    await rmIfExists(`${filePath}.${this.maxRotatedLogFiles}`);
    for (let index = this.maxRotatedLogFiles - 1; index >= 1; index -= 1) {
      await renameIfExists(`${filePath}.${index}`, `${filePath}.${index + 1}`);
    }
    await renameIfExists(filePath, `${filePath}.1`);
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
