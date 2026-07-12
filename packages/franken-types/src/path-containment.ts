import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';

interface ResolveContainedPathOptions {
  relativeTo?: string;
}

interface ResolveArchiveEntryPathOptions {
  /**
   * Explicit operator override for trusted archives with non-portable entry
   * names. The resolved destination is still constrained to `baseDir`; this
   * only bypasses the archive-entry lexical denylist.
   */
  allowUnsafeArchiveEntryPaths?: boolean;
}

function isContainedBy(baseRealPath: string, targetRealPath: string): boolean {
  const relativePath = relative(baseRealPath, targetRealPath);
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

function containmentError(fieldName: string): Error {
  return new Error(`${fieldName} resolves outside base directory`);
}

function archiveEntryError(fieldName: string, reason: string): Error {
  return new Error(`${fieldName} is not a safe archive entry path: ${reason}`);
}

function isWindowsAbsolutePath(path: string): boolean {
  return win32.isAbsolute(path) || /^[a-zA-Z]:/.test(path);
}

function normalizeArchiveEntryPath(entryPath: string, fieldName: string): string {
  if (entryPath.length === 0) {
    throw archiveEntryError(fieldName, 'empty path');
  }
  if (entryPath.includes('\0')) {
    throw archiveEntryError(fieldName, 'NUL byte');
  }
  if (isAbsolute(entryPath) || isWindowsAbsolutePath(entryPath)) {
    throw archiveEntryError(fieldName, 'absolute path');
  }

  const segments = entryPath.split(/[\\/]+/).filter(segment => segment.length > 0 && segment !== '.');
  if (segments.length === 0) {
    throw archiveEntryError(fieldName, 'empty path');
  }
  if (segments.some(segment => segment === '..')) {
    throw archiveEntryError(fieldName, 'parent directory segment');
  }

  return segments.join('/');
}

function resolveRequestedPath(
  baseRealPath: string,
  requestedPath: string,
  options: ResolveContainedPathOptions = {},
): string {
  const relativeBase = options.relativeTo ?? baseRealPath;
  return isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(relativeBase, requestedPath);
}

function resolveViaNearestExistingAncestor(baseRealPath: string, requestedAbsolutePath: string, fieldName: string): string {
  const missingSegments: string[] = [];
  let cursor = requestedAbsolutePath;

  while (!existsSync(cursor)) {
    missingSegments.unshift(basename(cursor));
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw containmentError(fieldName);
    }
    cursor = parent;
  }

  const ancestorRealPath = realpathSync(cursor);
  if (!isContainedBy(baseRealPath, ancestorRealPath)) {
    throw containmentError(fieldName);
  }

  const targetPath = resolve(ancestorRealPath, ...missingSegments);
  if (!isContainedBy(baseRealPath, targetPath)) {
    throw containmentError(fieldName);
  }

  return targetPath;
}

export function resolveContainedExistingPath(
  baseDir: string,
  requestedPath: string,
  fieldName = 'path',
  options: ResolveContainedPathOptions = {},
): string {
  const baseRealPath = realpathSync(resolve(baseDir));
  const requestedAbsolutePath = resolveRequestedPath(baseRealPath, requestedPath, options);
  const targetRealPath = realpathSync(requestedAbsolutePath);

  if (!isContainedBy(baseRealPath, targetRealPath)) {
    throw containmentError(fieldName);
  }

  return targetRealPath;
}

export function resolveContainedPath(
  baseDir: string,
  requestedPath: string,
  fieldName = 'path',
  options: ResolveContainedPathOptions = {},
): string {
  const baseRealPath = realpathSync(resolve(baseDir));
  const requestedAbsolutePath = resolveRequestedPath(baseRealPath, requestedPath, options);

  if (existsSync(requestedAbsolutePath)) {
    return resolveContainedExistingPath(baseRealPath, requestedAbsolutePath, fieldName);
  }

  const parentRealPath = realpathSync(dirname(requestedAbsolutePath));
  const targetPath = resolve(parentRealPath, basename(requestedAbsolutePath));

  if (!isContainedBy(baseRealPath, targetPath)) {
    throw containmentError(fieldName);
  }

  return targetPath;
}

/**
 * Resolve an archive member name under an extraction root without permitting
 * zip-slip/path-traversal entries. Archive paths are treated as untrusted data:
 * by default absolute paths, Windows drive/UNC paths, empty names, NUL bytes,
 * and `..` segments are rejected before the destination is calculated.
 *
 * `allowUnsafeArchiveEntryPaths` is an explicit compatibility override for
 * trusted archives only. Even with the override enabled, the final destination
 * must still resolve inside `baseDir`.
 */
export function resolveArchiveEntryPath(
  baseDir: string,
  entryPath: string,
  fieldName = 'archiveEntryPath',
  options: ResolveArchiveEntryPathOptions = {},
): string {
  const baseRealPath = realpathSync(resolve(baseDir));
  const safeEntryPath = options.allowUnsafeArchiveEntryPaths
    ? entryPath
    : normalizeArchiveEntryPath(entryPath, fieldName);
  const targetPath = resolve(baseRealPath, safeEntryPath);

  return resolveViaNearestExistingAncestor(baseRealPath, targetPath, fieldName);
}
