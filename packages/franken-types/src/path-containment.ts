import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

function isContainedBy(baseRealPath: string, targetRealPath: string): boolean {
  const relativePath = relative(baseRealPath, targetRealPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function containmentError(fieldName: string): Error {
  return new Error(`${fieldName} resolves outside base directory`);
}

function resolveRequestedPath(baseRealPath: string, requestedPath: string): string {
  return isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(baseRealPath, requestedPath);
}

export function resolveContainedExistingPath(
  baseDir: string,
  requestedPath: string,
  fieldName = 'path',
): string {
  const baseRealPath = realpathSync(resolve(baseDir));
  const requestedAbsolutePath = resolveRequestedPath(baseRealPath, requestedPath);
  const targetRealPath = realpathSync(requestedAbsolutePath);

  if (!isContainedBy(baseRealPath, targetRealPath)) {
    throw containmentError(fieldName);
  }

  return targetRealPath;
}

export function resolveContainedPath(baseDir: string, requestedPath: string, fieldName = 'path'): string {
  const baseRealPath = realpathSync(resolve(baseDir));
  const requestedAbsolutePath = resolveRequestedPath(baseRealPath, requestedPath);

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
