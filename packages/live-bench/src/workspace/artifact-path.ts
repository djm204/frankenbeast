import {
  closeSync,
  constants,
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

  const noFollow = 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0;
  const directoryOnly = 'O_DIRECTORY' in constants ? constants.O_DIRECTORY : 0;
  const rootFd = openSync(root, constants.O_RDONLY | constants.O_NONBLOCK | noFollow | directoryOnly);
  try {
    if (!fstatSync(rootFd).isDirectory()) {
      throw new Error(`workspace root must be a directory: ${workspaceRoot}`);
    }

    // On POSIX, traversing through the descriptor path makes artifact lookup
    // relative to the pinned directory even if workspaceRoot is later replaced.
    // Other platforms retain the before/after root identity checks below.
    const pinnedRoot = descriptorPath(rootFd) ?? root;
    const rootReal = realpathSync(pinnedRoot);
    assertSameFile(rootFd, root, 'workspace root changed while it was being opened');
    const candidate = resolve(pinnedRoot, artifactPath);
    assertContained(candidate, pinnedRoot, 'artifact path');

    let current = pinnedRoot;
    const parts = artifactPath.split('/');
    for (let index = 0; index < parts.length; index += 1) {
      current = join(current, parts[index]!);
      let stat;
      try {
        stat = lstatSync(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`artifact file does not exist: ${artifactPath}`);
        }
        throw error;
      }

      if (stat.isSymbolicLink()) {
        throw new Error(`artifact path must not contain symlinks: ${artifactPath}`);
      }
      if (index < parts.length - 1 && !stat.isDirectory()) {
        throw new Error(`artifact path component must be a directory: ${artifactPath}`);
      }
      assertContained(realpathSync(current), rootReal, 'artifact path');
    }

    const fd = openSync(candidate, constants.O_RDONLY | constants.O_NONBLOCK | noFollow);
    try {
      // Revalidate after opening. The descriptor pins the file that callers
      // inspect, while identity checks detect path-component swaps.
      assertSameFile(rootFd, root, 'workspace root changed while opening an artifact');
      assertSafeOpenedArtifact(pinnedRoot, rootReal, candidate, artifactPath, fd);
      return fd;
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  } finally {
    closeSync(rootFd);
  }
}

export function workspaceArtifactFileExists(workspaceRoot: string, artifactPath: string): boolean {
  try {
    const fd = openWorkspaceArtifactFile(workspaceRoot, artifactPath);
    closeSync(fd);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('artifact file does not exist:')) {
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

function descriptorPath(fd: number): string | undefined {
  for (const path of [`/proc/self/fd/${fd}`, `/dev/fd/${fd}`]) {
    try {
      lstatSync(path);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return undefined;
}

function assertSameFile(fd: number, path: string, message: string): void {
  const opened = fstatSync(fd);
  const current = statSync(path);
  if (opened.dev !== current.dev || opened.ino !== current.ino) {
    throw new Error(message);
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
