import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { join, parse, resolve, sep } from 'node:path';

export interface CleanupBuildOptions {
  /**
   * DANGEROUS: follow a symlinked .build directory and clean the resolved target.
   * CLI cleanup does not enable this; callers must opt in explicitly after
   * verifying the symlink target is trusted and disposable.
   */
  allowSymlinkedBuildDir?: boolean;
}

function lstatOptional(target: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function assertNoSymlinkedCleanupComponents(target: string): void {
  const absoluteTarget = resolve(target);
  const root = parse(absoluteTarget).root;
  const parts = absoluteTarget.slice(root.length).split(sep).filter(Boolean);
  const paths = parts.map((_, index) => join(root, ...parts.slice(0, index + 1)));
  const fbeastIndex = parts.lastIndexOf('.fbeast');
  const firstCleanupComponentIndex = fbeastIndex >= 0 ? fbeastIndex : parts.length - 1;

  for (const current of paths.slice(Math.max(firstCleanupComponentIndex, 0))) {
    const stat = lstatOptional(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to clean build directory with symlinked path component: ${current}`);
    }
  }
}

/**
 * Removes all files from the .build/ directory (logs, checkpoints, traces db).
 * Symlinked entries under .build/ are unlinked, not traversed. A symlinked
 * .build/ root is denied by default because following it could delete files
 * outside the project; programmatic callers must opt in explicitly.
 * Returns the number of files removed.
 */
export function cleanupBuild(buildDir: string, options: CleanupBuildOptions = {}): number {
  if (!options.allowSymlinkedBuildDir) {
    assertNoSymlinkedCleanupComponents(buildDir);
  }

  const rootStat = lstatOptional(buildDir);
  if (!rootStat) return 0;
  if (rootStat.isSymbolicLink() && !options.allowSymlinkedBuildDir) {
    throw new Error(`Refusing to clean symlinked build directory: ${buildDir}`);
  }
  if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) {
    throw new Error(`Build cleanup target must be a directory: ${buildDir}`);
  }

  let removed = 0;
  const removeRecursive = (target: string): void => {
    const stat = lstatOptional(target);
    if (!stat) return;

    if (stat.isSymbolicLink()) {
      rmSync(target, { force: true });
      removed++;
      return;
    }

    if (stat.isDirectory()) {
      for (const entry of readdirSync(target)) {
        removeRecursive(join(target, entry));
      }
      rmSync(target, { recursive: true, force: true });
      removed++;
      return;
    }

    rmSync(target, { force: true });
    removed++;
  };

  for (const entry of readdirSync(buildDir)) {
    try {
      removeRecursive(join(buildDir, entry));
    } catch {
      // skip entries that can't be removed
    }
  }

  return removed;
}
