import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

export function deriveProjectRootFromDbPath(dbPath: string, explicitRoot?: string | undefined): string | undefined {
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  if (!isAbsolute(dbPath)) {
    let candidateRoot = process.cwd();
    while (true) {
      const candidateDb = resolve(candidateRoot, dbPath);
      const projectRoot = projectRootFromDb(candidateDb);
      if (projectRoot && (existsSync(dirname(candidateDb)) || existsSync(candidateDb))) {
        return projectRoot;
      }
      const parent = dirname(candidateRoot);
      if (parent === candidateRoot) break;
      candidateRoot = parent;
    }
  }

  return projectRootFromDb(resolve(dbPath));
}

export function resolveProjectDbPath(dbPath: string, explicitRoot?: string | undefined): string {
  if (isAbsolute(dbPath)) {
    return dbPath;
  }
  const projectRelativePath = dbPathFromProjectRoot(dbPath);
  if (!projectRelativePath) {
    return dbPath;
  }
  const root = deriveProjectRootFromDbPath(dbPath, explicitRoot);
  return root ? resolve(root, projectRelativePath) : dbPath;
}

function projectRootFromDb(dbPath: string): string | undefined {
  const dbDir = dirname(dbPath);
  if (basename(dbDir) !== '.fbeast') return undefined;
  return dirname(dbDir);
}

function dbPathFromProjectRoot(dbPath: string): string | undefined {
  const normalized = dbPath.replace(/\\/g, '/');
  const marker = '.fbeast/';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex);
  }
  return undefined;
}
