import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';

export function deriveProjectRootFromDbPath(dbPath: string, explicitRoot?: string | undefined): string | undefined {
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  const projectRelativePath = dbPathFromProjectRoot(dbPath);
  const envRoot = process.env['CLAUDE_PROJECT_DIR'] ?? process.env['GEMINI_PROJECT_ROOT'] ?? process.env['FBEAST_ROOT'];
  if (projectRelativePath && envRoot) {
    return resolve(envRoot);
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
  const expandedDbPath = expandProjectRootEnv(dbPath);
  if (expandedDbPath !== dbPath) {
    return expandedDbPath;
  }
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

function expandProjectRootEnv(dbPath: string): string {
  const root = process.env['CLAUDE_PROJECT_DIR'] ?? process.env['GEMINI_PROJECT_ROOT'] ?? process.env['FBEAST_ROOT'];
  if (!root) return dbPath;

  return dbPath
    .replace(/^\$\{CLAUDE_PROJECT_DIR}/, root)
    .replace(/^\$CLAUDE_PROJECT_DIR/, root)
    .replace(/^\$\{GEMINI_PROJECT_ROOT}/, root)
    .replace(/^\$GEMINI_PROJECT_ROOT/, root)
    .replace(/^\$\{FBEAST_ROOT}/, root)
    .replace(/^\$FBEAST_ROOT/, root);
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
