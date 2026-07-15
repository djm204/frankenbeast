import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export interface SafeArchiveLimits {
  /** Maximum compressed archive payload accepted by the helper. */
  readonly maxArchiveBytes: number;
  /** Maximum summed uncompressed bytes across all regular files. */
  readonly maxTotalUncompressedBytes: number;
  /** Maximum uncompressed bytes for any single file. */
  readonly maxFileBytes: number;
  /** Maximum number of regular file entries. */
  readonly maxFileCount: number;
  /** Maximum nested archive depth. Zero rejects archive-looking entries. */
  readonly maxNestingDepth: number;
}

export type SafeArchiveLimitOverrides = Partial<SafeArchiveLimits>;

export interface SafeArchiveEntryResult {
  readonly path: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
}

export interface SafeArchiveExtractionResult {
  readonly files: SafeArchiveEntryResult[];
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
}

export const DEFAULT_SAFE_ARCHIVE_LIMITS: SafeArchiveLimits = Object.freeze({
  maxArchiveBytes: 50 * 1024 * 1024,
  maxTotalUncompressedBytes: 250 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxFileCount: 10_000,
  maxNestingDepth: 0,
});

export class SafeArchiveExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeArchiveExtractionError';
  }
}

interface ZipCentralDirectoryEntry {
  readonly path: string;
  readonly method: number;
  readonly flags: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly localHeaderOffset: number;
  readonly externalAttributes: number;
  readonly isDirectory: boolean;
  readonly targetPath: string;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const MAX_EOCD_SEARCH = 22 + 65_535;
const SYMLINK_FILE_TYPE = 0o120000;
const FILE_TYPE_MASK = 0o170000;

const ARCHIVE_ENTRY_PATTERN = /(?:^|[/\\])[^/\\]+\.(?:zip|tar|tgz|tar\.gz|tar\.bz2|tbz2|tar\.xz|txz|gz|bz2|xz)$/iu;
const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export async function extractZipArchive(
  archive: Buffer | Uint8Array,
  destination: string,
  overrides: SafeArchiveLimitOverrides = {},
): Promise<SafeArchiveExtractionResult> {
  const buffer = toBuffer(archive);
  const limits = normalizeLimits(overrides);
  if (buffer.byteLength > limits.maxArchiveBytes) {
    throw new SafeArchiveExtractionError(
      `Archive compressed size ${buffer.byteLength} exceeds maxArchiveBytes ${limits.maxArchiveBytes}`,
    );
  }

  const destinationRoot = resolve(destination);
  const entries = parseZipCentralDirectory(buffer, destinationRoot);
  const files = preflightEntries(entries, limits);

  await mkdir(destinationRoot, { recursive: true });
  for (const entry of files) {
    const data = readZipEntry(buffer, entry, limits);
    await rejectSymlinkedPathComponents(destinationRoot, entry.targetPath);
    await mkdir(dirname(entry.targetPath), { recursive: true });
    await rejectSymlinkedPathComponents(destinationRoot, entry.targetPath);
    await writeFile(entry.targetPath, data, { flag: 'wx', mode: 0o600 });
  }

  return {
    compressedBytes: buffer.byteLength,
    uncompressedBytes: files.reduce((sum, entry) => sum + entry.uncompressedBytes, 0),
    files: files.map((entry) => ({
      path: entry.path,
      compressedBytes: entry.compressedBytes,
      uncompressedBytes: entry.uncompressedBytes,
    })),
  };
}

function normalizeLimits(overrides: SafeArchiveLimitOverrides): SafeArchiveLimits {
  const limits = { ...DEFAULT_SAFE_ARCHIVE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SafeArchiveExtractionError(`${name} must be a non-negative safe integer`);
    }
  }
  if (limits.maxArchiveBytes === 0) {
    throw new SafeArchiveExtractionError('maxArchiveBytes must be greater than zero');
  }
  return limits;
}

function toBuffer(archive: Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(archive)) {
    return archive;
  }
  return Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
}

function parseZipCentralDirectory(buffer: Buffer, destinationRoot: string): ZipCentralDirectoryEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    entryCount === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new SafeArchiveExtractionError('ZIP64 archives are not supported by the safe extractor');
  }
  if (centralDirectoryOffset + centralDirectorySize > buffer.byteLength) {
    throw new SafeArchiveExtractionError('ZIP central directory points outside the archive');
  }

  const entries: ZipCentralDirectoryEntry[] = [];
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.byteLength || buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new SafeArchiveExtractionError('Invalid ZIP central directory entry');
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > buffer.byteLength) {
      throw new SafeArchiveExtractionError('ZIP entry metadata points outside the archive');
    }

    const rawPath = buffer.subarray(nameStart, nameEnd).toString('utf8');
    const isDirectory = rawPath.endsWith('/') || rawPath.endsWith('\\');
    const normalizedPath = normalizeArchivePath(isDirectory ? rawPath.replace(/[\\/]+$/u, '') : rawPath, destinationRoot);
    entries.push({
      path: normalizedPath.relativePath,
      method,
      flags,
      compressedBytes,
      uncompressedBytes,
      localHeaderOffset,
      externalAttributes,
      isDirectory,
      targetPath: normalizedPath.targetPath,
    });
    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.byteLength - MAX_EOCD_SEARCH);
  for (let offset = buffer.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === buffer.byteLength) {
        return offset;
      }
    }
  }
  throw new SafeArchiveExtractionError('Archive is not a valid ZIP file');
}

function normalizeArchivePath(rawPath: string, destinationRoot: string): { relativePath: string; targetPath: string } {
  if (rawPath.length === 0 || rawPath.includes('\0')) {
    throw new SafeArchiveExtractionError('Archive entry path is empty or contains NUL');
  }
  const relativePath = rawPath.replace(/\\/gu, '/');
  if (isAbsolute(relativePath) || /^[a-z]:/iu.test(relativePath)) {
    throw new SafeArchiveExtractionError(`Archive entry path traversal is not allowed: ${rawPath}`);
  }
  const parts = relativePath.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new SafeArchiveExtractionError(`Archive entry path traversal is not allowed: ${rawPath}`);
  }
  for (const part of parts) {
    if (isWindowsSpecialSegment(part)) {
      throw new SafeArchiveExtractionError(`Windows-special archive path segment is not allowed: ${rawPath}`);
    }
  }
  const targetPath = resolve(destinationRoot, ...parts);
  const rootWithSeparator = destinationRoot.endsWith(sep) ? destinationRoot : `${destinationRoot}${sep}`;
  if (targetPath !== destinationRoot && !targetPath.startsWith(rootWithSeparator)) {
    throw new SafeArchiveExtractionError(`Archive entry path traversal is not allowed: ${rawPath}`);
  }
  return { relativePath: parts.join('/'), targetPath };
}

function preflightEntries(entries: readonly ZipCentralDirectoryEntry[], limits: SafeArchiveLimits): ZipCentralDirectoryEntry[] {
  const files = entries.filter((entry) => !entry.isDirectory);
  if (files.length > limits.maxFileCount) {
    throw new SafeArchiveExtractionError(`Archive file count ${files.length} exceeds maxFileCount ${limits.maxFileCount}`);
  }

  let totalUncompressedBytes = 0;
  rejectPathCollisions(
    files,
    entries.filter((entry) => entry.isDirectory).map((entry) => entry.path),
  );
  for (const entry of files) {
    if (entry.flags & 0x1) {
      throw new SafeArchiveExtractionError(`Encrypted ZIP entries are not supported: ${entry.path}`);
    }
    if (entry.method !== 0 && entry.method !== 8) {
      throw new SafeArchiveExtractionError(`Unsupported ZIP compression method ${entry.method} for ${entry.path}`);
    }
    if (((entry.externalAttributes >>> 16) & FILE_TYPE_MASK) === SYMLINK_FILE_TYPE) {
      throw new SafeArchiveExtractionError(`Archive symlink entries are not allowed: ${entry.path}`);
    }
    if (entry.compressedBytes > limits.maxArchiveBytes) {
      throw new SafeArchiveExtractionError(`Entry compressed size exceeds maxArchiveBytes: ${entry.path}`);
    }
    if (entry.uncompressedBytes > limits.maxFileBytes) {
      throw new SafeArchiveExtractionError(
        `Archive entry ${entry.path} exceeds per-file limit ${limits.maxFileBytes} bytes`,
      );
    }
    if (limits.maxNestingDepth === 0 && ARCHIVE_ENTRY_PATTERN.test(entry.path)) {
      throw new SafeArchiveExtractionError(`Nested archive entries are not allowed: ${entry.path}`);
    }
    totalUncompressedBytes += entry.uncompressedBytes;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new SafeArchiveExtractionError(
        `Archive uncompressed size ${totalUncompressedBytes} exceeds maxTotalUncompressedBytes ${limits.maxTotalUncompressedBytes}`,
      );
    }
  }
  return files;
}

function isWindowsSpecialSegment(segment: string): boolean {
  return segment.includes(':') || segment.endsWith('.') || segment.endsWith(' ') || WINDOWS_RESERVED_NAMES.test(segment);
}

function rejectPathCollisions(files: readonly ZipCentralDirectoryEntry[], explicitDirectories: readonly string[]): void {
  const filePaths = new Set<string>();
  const ancestorDirectories = new Set<string>();
  const directoryPaths = new Set(explicitDirectories);

  for (const entry of files) {
    if (filePaths.has(entry.path) || directoryPaths.has(entry.path) || ancestorDirectories.has(entry.path)) {
      throw new SafeArchiveExtractionError(`Archive path collision is not allowed: ${entry.path}`);
    }

    const parts = entry.path.split('/');
    const ancestors: string[] = [];
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = parts.slice(0, index).join('/');
      if (filePaths.has(ancestor)) {
        throw new SafeArchiveExtractionError(`Archive path collision is not allowed: ${entry.path}`);
      }
      ancestors.push(ancestor);
    }

    filePaths.add(entry.path);
    for (const ancestor of ancestors) {
      ancestorDirectories.add(ancestor);
    }
  }
}

async function rejectSymlinkedPathComponents(destinationRoot: string, targetPath: string): Promise<void> {
  const relative = targetPath.slice(destinationRoot.length).replace(new RegExp(`^\\${sep}`), '');
  const parts = relative.length === 0 ? [] : relative.split(sep);
  let current = destinationRoot;
  await rejectSymlink(current, destinationRoot);
  for (const part of parts.slice(0, -1)) {
    current = resolve(current, part);
    await rejectSymlink(current, destinationRoot);
  }
}

async function rejectSymlink(path: string, destinationRoot: string): Promise<void> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      throw new SafeArchiveExtractionError(`Archive extraction destination contains a symlink: ${path}`);
    }
  } catch (error) {
    if (error instanceof SafeArchiveExtractionError) {
      throw error;
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw new SafeArchiveExtractionError(`Unable to validate extraction path under ${destinationRoot}: ${path}`);
  }
}

function readZipEntry(buffer: Buffer, entry: ZipCentralDirectoryEntry, limits: SafeArchiveLimits): Buffer {
  const cursor = entry.localHeaderOffset;
  if (cursor + 30 > buffer.byteLength || buffer.readUInt32LE(cursor) !== LOCAL_FILE_SIGNATURE) {
    throw new SafeArchiveExtractionError(`Invalid local ZIP header for ${entry.path}`);
  }
  const localNameLength = buffer.readUInt16LE(cursor + 26);
  const localExtraLength = buffer.readUInt16LE(cursor + 28);
  const dataStart = cursor + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedBytes;
  if (dataEnd > buffer.byteLength) {
    throw new SafeArchiveExtractionError(`ZIP entry data points outside the archive: ${entry.path}`);
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  let data: Buffer;
  try {
    data =
      entry.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: Math.min(entry.uncompressedBytes, limits.maxFileBytes) });
  } catch (cause) {
    throw new SafeArchiveExtractionError(`Unable to inflate ZIP entry ${entry.path}: ${(cause as Error).message}`);
  }
  if (data.byteLength !== entry.uncompressedBytes) {
    throw new SafeArchiveExtractionError(
      `ZIP entry ${entry.path} inflated to ${data.byteLength} bytes, expected ${entry.uncompressedBytes}`,
    );
  }
  if (data.byteLength > limits.maxFileBytes) {
    throw new SafeArchiveExtractionError(`ZIP entry ${entry.path} exceeds per-file limit ${limits.maxFileBytes} bytes`);
  }
  return data;
}
