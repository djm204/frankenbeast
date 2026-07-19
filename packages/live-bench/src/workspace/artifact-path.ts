import { existsSync, lstatSync, realpathSync } from 'node:fs';
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

export function resolveWorkspaceArtifactPath(workspaceRoot: string, artifactPath: string): string {
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
      return candidate;
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

  return candidate;
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
