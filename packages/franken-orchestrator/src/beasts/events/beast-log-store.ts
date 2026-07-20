import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, readFile, readdir, rename, stat, truncate, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { isoNow } from '@franken/types';

const DEFAULT_MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ROTATED_LOG_FILES = 3;
const MAX_ROTATED_LOG_FILES = 100;
const MIN_LOG_FILE_BYTES = 128;
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const RUN_ID_PATTERN = new RegExp(`^run_${UUID_PATTERN}$`, 'iu');
const ATTEMPT_ID_PATTERN = new RegExp(`^attempt_${UUID_PATTERN}$`, 'iu');

export interface BeastLogStoreOptions {
  /** Maximum active per-attempt log size before rotation. Defaults to 10 MiB. */
  readonly maxLogFileBytes?: number | undefined;
  /** Number of rotated per-attempt logs to retain. Defaults to 3; values < 1 truncate in place. */
  readonly maxRotatedLogFiles?: number | undefined;
}

export interface BeastLogPageOptions {
  readonly offset?: number | undefined;
  readonly limit: number;
  readonly tail?: boolean | undefined;
  /** Maximum serialized JSON byte size of the returned lines array. */
  readonly maxBytes: number;
}

export interface BeastLogPage {
  readonly lines: string[];
  readonly offset: number;
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly tail: boolean;
  readonly bytes: number;
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
  private readonly retentionPrunedLogPaths = new Set<string>();

  constructor(
    private readonly logDir: string,
    options: BeastLogStoreOptions = {},
  ) {
    this.maxLogFileBytes = Math.max(options.maxLogFileBytes ?? DEFAULT_MAX_LOG_FILE_BYTES, MIN_LOG_FILE_BYTES);
    this.maxRotatedLogFiles = Math.max(
      0,
      Math.min(options.maxRotatedLogFiles ?? DEFAULT_MAX_ROTATED_LOG_FILES, MAX_ROTATED_LOG_FILES),
    );
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

  async readPage(runId: string, attemptId: string, options: BeastLogPageOptions): Promise<BeastLogPage> {
    const filePath = this.resolvePath(runId, attemptId);
    const paths = await this.listReadableLogPaths(filePath, true);
    const tail = options.tail ?? false;
    const offset = tail ? 0 : (options.offset ?? 0);
    const selected: string[] = [];
    let bytes = 2;
    let hasMore = false;

    if (tail) {
      const newestFirstPaths = [...paths].reverse();
      outer: for (const path of newestFirstPaths) {
        if (selected.length >= options.limit) {
          hasMore = true;
          break;
        }
        try {
          for await (const line of readLinesReverse(path)) {
            if (selected.length >= options.limit) {
              hasMore = true;
              break outer;
            }
            const nextBytes = serializedArrayBytesAfterAppend(bytes, selected.length, line);
            if (nextBytes > options.maxBytes) {
              hasMore = true;
              break outer;
            }
            selected.push(line);
            bytes = nextBytes;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      selected.reverse();
    } else {
      let seen = 0;
      outer: for (const path of paths) {
        try {
          for await (const line of readLinesForward(path)) {
            if (seen < offset) {
              seen += 1;
              continue;
            }
            if (selected.length >= options.limit) {
              hasMore = true;
              break outer;
            }
            const nextBytes = serializedArrayBytesAfterAppend(bytes, selected.length, line);
            if (nextBytes > options.maxBytes) {
              hasMore = true;
              break outer;
            }
            selected.push(line);
            bytes = nextBytes;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }

    return {
      lines: selected,
      offset,
      nextOffset: offset + selected.length,
      hasMore,
      tail,
      bytes,
    };
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
      await this.removeRotationsAboveRetentionOnce(filePath);
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

  private async removeRotationsAboveRetentionOnce(filePath: string): Promise<void> {
    if (this.retentionPrunedLogPaths.has(filePath)) return;
    await this.removeRotationsAboveRetention(filePath);
    this.retentionPrunedLogPaths.add(filePath);
  }

  private async listReadableLogPaths(filePath: string, boundedToRetention = false): Promise<string[]> {
    const dir = dirname(filePath);
    const prefix = `${basename(filePath)}.`;
    try {
      const entries = await readdir(dir);
      const rotatedPaths = entries
        .map((entry) => ({ entry, index: parseRotationIndex(entry, prefix) }))
        .filter(({ index }) => index >= 1 && (!boundedToRetention || index <= this.maxRotatedLogFiles))
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
    if (!RUN_ID_PATTERN.test(runId)) {
      throw new Error('Invalid Beast run identifier');
    }
    if (attemptId !== 'system' && !ATTEMPT_ID_PATTERN.test(attemptId)) {
      throw new Error('Invalid Beast attempt identifier');
    }

    const root = resolve(this.logDir);
    const filePath = resolve(root, runId, `${attemptId}.log`);
    const relativePath = relative(root, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error('Beast log path escapes the configured log directory');
    }
    return filePath;
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

function serializedArrayBytesAfterAppend(currentBytes: number, currentLength: number, line: string): number {
  return currentBytes + Buffer.byteLength(JSON.stringify(line)) + (currentLength > 0 ? 1 : 0);
}

async function* readLinesForward(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const raw of lines) {
      const line = raw.trim();
      if (line) yield line;
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

async function* readLinesReverse(path: string): AsyncGenerator<string> {
  const handle = await open(path, 'r');
  const chunkSize = 64 * 1024;
  try {
    let position = (await handle.stat()).size;
    let carry = Buffer.alloc(0);
    while (position > 0) {
      const start = Math.max(0, position - chunkSize);
      const chunk = Buffer.allocUnsafe(position - start);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, start);
      const data = Buffer.concat([chunk.subarray(0, bytesRead), carry]);
      let end = data.length;
      for (
        let index = data.lastIndexOf(0x0a, end - 1);
        index >= 0;
        index = data.lastIndexOf(0x0a, end - 1)
      ) {
        const line = data.subarray(index + 1, end).toString('utf8').trim();
        if (line) yield line;
        end = index;
      }
      carry = data.subarray(0, end);
      position = start;
    }
    const line = carry.toString('utf8').trim();
    if (line) yield line;
  } finally {
    await handle.close();
  }
}
