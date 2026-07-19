import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve, sep, win32 } from 'node:path';
import type { BenchmarkTask } from '../types.js';

export function assertNormalizedWorkspaceRelativePath(value: string, label = 'artifact path'): void {
  if (
    value.length === 0
    || value.includes('\0')
    || value.includes('\\')
    || value.includes(':')
    || posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || /^[a-zA-Z]:/.test(value)
    || posix.normalize(value) !== value
    || value === '.'
    || value === '..'
    || value.startsWith('../')
  ) {
    throw new Error(`${label} must be a normalized relative path: ${value}`);
  }
}

export function isNormalizedWorkspaceRelativePath(value: string): boolean {
  try {
    assertNormalizedWorkspaceRelativePath(value);
    return true;
  } catch {
    return false;
  }
}

export function assertSafeBenchmarkTaskPaths(task: BenchmarkTask): void {
  for (const artifactPath of task.expectedArtifacts) {
    assertNormalizedWorkspaceRelativePath(artifactPath, 'expected artifact path');
  }
  for (const check of task.requiredChecks) {
    if (check.type === 'file-exists' || check.type === 'file-contains') {
      assertNormalizedWorkspaceRelativePath(check.path, `${check.type} check path`);
    }
  }
}

export function openWorkspaceArtifactFile(workspaceRoot: string, artifactPath: string): number {
  assertNormalizedWorkspaceRelativePath(artifactPath);

  const root = resolve(workspaceRoot);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`workspace root must not be a symlink: ${workspaceRoot}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`workspace root must be a directory: ${workspaceRoot}`);
  }
  assertNoSymlinkAncestors(root);

  const rootReal = realpathSync(root);
  const candidate = resolve(root, artifactPath);
  assertContained(candidate, root, 'artifact path');

  let current = root;
  const parts = artifactPath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]!);
    if (!existsSync(current)) {
      throw new Error(`artifact file does not exist: ${artifactPath}`);
    }

    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`artifact path must not contain symlinks: ${artifactPath}`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`artifact path component must be a directory: ${artifactPath}`);
    }
    assertContained(realpathSync(current), rootReal, 'artifact path');
  }

  const noFollow = 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0;
  const fd = openSync(candidate, constants.O_RDONLY | noFollow);
  try {
    // Revalidate after opening. The descriptor pins the file that callers will
    // inspect, while this identity comparison detects a path-component swap
    // between the initial validation and openSync().
    assertSafeOpenedArtifact(root, rootReal, candidate, artifactPath, fd);
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

export function workspaceArtifactFileExists(workspaceRoot: string, artifactPath: string): boolean {
  try {
    const fd = openWorkspaceArtifactFile(workspaceRoot, artifactPath);
    closeSync(fd);
    return true;
  } catch (error) {
    if (
      (error instanceof Error && error.message.startsWith('artifact file does not exist:'))
      || (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}

export function readWorkspaceArtifactFile(workspaceRoot: string, artifactPath: string): Buffer {
  const fd = openWorkspaceArtifactFile(workspaceRoot, artifactPath);
  try {
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

function assertSafeOpenedArtifact(
  root: string,
  rootReal: string,
  candidate: string,
  artifactPath: string,
  fd: number,
): void {
  let current = root;
  for (const part of artifactPath.split('/')) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`artifact path must not contain symlinks: ${artifactPath}`);
    }
    assertContained(realpathSync(current), rootReal, 'artifact path');
  }

  const opened = fstatSync(fd);
  const currentTarget = statSync(candidate);
  if (opened.dev !== currentTarget.dev || opened.ino !== currentTarget.ino) {
    throw new Error(`artifact path changed while it was being opened: ${artifactPath}`);
  }
  if (!opened.isFile()) {
    throw new Error(`artifact path must identify a regular file: ${artifactPath}`);
  }
}

function assertContained(child: string, root: string, label: string): void {
  const rel = relative(root, child);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes(':')) {
    throw new Error(`${label} escapes workspace root`);
  }
}

function assertNoSymlinkAncestors(target: string): void {
  let current = dirname(target);
  while (dirname(current) !== current) {
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`workspace root path component must not be a symlink: ${current}`);
    }
    current = dirname(current);
  }
}
