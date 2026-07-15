import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';
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
  /** Maximum number of explicit or implicit directory entries created while extracting. */
  readonly maxDirectoryCount: number;
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
  maxDirectoryCount: 10_000,
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
  readonly crc32: number;
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
const MAX_ARCHIVE_PATH_SEGMENTS = 256;

const ARCHIVE_ENTRY_PATTERN =
  /(?:^|[/\\])[^/\\]*\.(?:zip|jar|war|ear|apk|whl|tar|tgz|tar\.gz|tar\.bz2|tbz2|tar\.xz|txz|gz|bz2|xz|zst|7z|rar)$/iu;
const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;
const CRC32_TABLE = makeCrc32Table();

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
  await rejectSymlinkedExistingAncestors(destinationRoot);
  const entries = parseZipCentralDirectory(buffer, destinationRoot);
  const files = preflightEntries(entries, limits);
  const decodedFiles = files.map((entry) => ({ entry, data: readZipEntry(buffer, entry, limits) }));

  await mkdir(destinationRoot, { recursive: true });
  for (const { entry, data } of decodedFiles) {
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
    const crc32 = buffer.readUInt32LE(cursor + 16);
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
      crc32,
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
  if (parts.length > MAX_ARCHIVE_PATH_SEGMENTS) {
    throw new SafeArchiveExtractionError(
      `Archive entry path has ${parts.length} segments, exceeding limit ${MAX_ARCHIVE_PATH_SEGMENTS}: ${rawPath}`,
    );
  }
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
  const directoryCount = countDirectoryPaths(files, entries.filter((entry) => entry.isDirectory).map((entry) => entry.path));
  if (directoryCount > limits.maxDirectoryCount) {
    throw new SafeArchiveExtractionError(
      `Archive directory count ${directoryCount} exceeds maxDirectoryCount ${limits.maxDirectoryCount}`,
    );
  }
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
  const directoryPaths = new Set(explicitDirectories.map((path) => collisionKey(path)));

  for (const entry of files) {
    const entryKey = collisionKey(entry.path);
    if (filePaths.has(entryKey) || directoryPaths.has(entryKey) || ancestorDirectories.has(entryKey)) {
      throw new SafeArchiveExtractionError(`Archive path collision is not allowed: ${entry.path}`);
    }

    const parts = entry.path.split('/');
    const ancestors: string[] = [];
    let ancestor = '';
    for (const part of parts.slice(0, -1)) {
      ancestor = ancestor.length === 0 ? part : `${ancestor}/${part}`;
      const ancestorKey = collisionKey(ancestor);
      if (filePaths.has(ancestorKey)) {
        throw new SafeArchiveExtractionError(`Archive path collision is not allowed: ${entry.path}`);
      }
      ancestors.push(ancestorKey);
    }

    filePaths.add(entryKey);
    for (const ancestorKey of ancestors) {
      ancestorDirectories.add(ancestorKey);
    }
  }
}

function collisionKey(path: string): string {
  return path.toLocaleLowerCase('en-US');
}

function countDirectoryPaths(files: readonly ZipCentralDirectoryEntry[], explicitDirectories: readonly string[]): number {
  const directories = new Set(explicitDirectories.map((path) => collisionKey(path)));
  for (const entry of files) {
    const parts = entry.path.split('/');
    let ancestor = '';
    for (const part of parts.slice(0, -1)) {
      ancestor = ancestor.length === 0 ? part : `${ancestor}/${part}`;
      directories.add(collisionKey(ancestor));
    }
  }
  return directories.size;
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

async function rejectSymlinkedExistingAncestors(path: string): Promise<void> {
  const root = parse(path).root;
  const relativeParts = path.slice(root.length).split(sep).filter(Boolean);
  let current = root;
  for (const part of relativeParts) {
    current = resolve(current, part);
    await rejectSymlink(current, path);
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
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, Math.min(entry.uncompressedBytes, limits.maxFileBytes)) });
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
  const actualCrc32 = crc32(data);
  if (actualCrc32 !== entry.crc32) {
    throw new SafeArchiveExtractionError(`ZIP entry ${entry.path} failed CRC validation`);
  }
  return data;
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
