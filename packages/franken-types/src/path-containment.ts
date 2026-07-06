import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

interface ResolveContainedPathOptions {
  relativeTo?: string;
}

function isContainedBy(baseRealPath: string, targetRealPath: string): boolean {
  const relativePath = relative(baseRealPath, targetRealPath);
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

function containmentError(fieldName: string): Error {
  return new Error(`${fieldName} resolves outside base directory`);
}

function resolveRequestedPath(
  baseRealPath: string,
  requestedPath: string,
  options: ResolveContainedPathOptions = {},
): string {
  const relativeBase = options.relativeTo ?? baseRealPath;
  return isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(relativeBase, requestedPath);
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
