import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export interface ProjectPaths {
  root: string;
  frankenbeastDir: string;
  plansDir: string;
  buildDir: string;
  checkpointFile: string;
  tracesDb: string;
  logFile: string;
  designDocFile: string;
  configFile: string;
}

/**
 * Resolves the project root from --base-dir or cwd.
 * Validates the directory exists.
 */
export function resolveProjectRoot(baseDir: string): string {
  const root = resolve(baseDir);
  if (!existsSync(root)) {
    throw new Error(`Project root does not exist: ${root}`);
  }
  return root;
}

/**
 * Returns all conventional paths within .frankenbeast/.
 */
export function getProjectPaths(root: string): ProjectPaths {
  const frankenbeastDir = resolve(root, '.frankenbeast');
  const plansDir = resolve(frankenbeastDir, 'plans');
  const buildDir = resolve(frankenbeastDir, '.build');
  return {
    root,
    frankenbeastDir,
    plansDir,
    buildDir,
    checkpointFile: resolve(buildDir, '.checkpoint'),
    tracesDb: resolve(buildDir, 'build-traces.db'),
    logFile: resolve(buildDir, 'build.log'),
    designDocFile: resolve(plansDir, 'design.md'),
    configFile: resolve(frankenbeastDir, 'config.json'),
  };
}

/**
 * Creates .frankenbeast/ directory structure if it doesn't exist.
 */
export function scaffoldFrankenbeast(paths: ProjectPaths): void {
  mkdirSync(paths.plansDir, { recursive: true });
  mkdirSync(paths.buildDir, { recursive: true });
}
