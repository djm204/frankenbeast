import { resolve, basename, dirname, relative } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

export interface ProjectPaths {
  root: string;
  frankenbeastDir: string;
  llmCacheDir: string;
  plansDir: string;
  buildDir: string;
  beastsDir: string;
  beastLogsDir: string;
  beastsDb: string;
  chunkSessionsDir: string;
  chunkSessionSnapshotsDir: string;
  checkpointFile: string;
  tracesDb: string;
  logFile: string;
  designDocFile: string;
  configFile: string;
  /** Raw LLM decomposition response cache */
  llmResponseFile: string;
}

/**
 * Resolves the project root from --base-dir or cwd.
 * Validates the directory exists.
 */
export function resolveProjectRoot(baseDir: string): string {
  const start = resolve(baseDir);
  if (!existsSync(start)) {
    throw new Error(`Project root does not exist: ${start}`);
  }

  return findWorkspaceRoot(start) ?? start;
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = start;

  while (true) {
    const packageJsonPath = resolve(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
          workspaces?: string[] | { packages?: string[] };
        };
        const workspaces = Array.isArray(packageJson.workspaces)
          ? packageJson.workspaces
          : packageJson.workspaces?.packages;
        const rel = relative(current, start);
        const isInsidePackagesDir = rel === 'packages' || rel.startsWith(`packages/`);
        if (workspaces?.includes('packages/*') && (start === current || isInsidePackagesDir)) {
          return current;
        }
      } catch {
        // Ignore malformed package.json and continue walking upward.
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/**
 * Generates a plan name from the design doc filename and current date.
 * e.g. "docs/plans/2026-03-08-monorepo-migration-design.md" → "monorepo-migration-design"
 * Falls back to "plan-YYYY-MM-DD" if no design doc provided.
 */
export function generatePlanName(designDocPath?: string): string {
  if (designDocPath) {
    const name = basename(designDocPath)
      .replace(/\.md$/i, '')
      .replace(/^\d{4}-\d{2}-\d{2}-?/, ''); // strip leading date prefix if present
    if (name.length > 0) return name;
  }
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return `plan-${date}`;
}

/**
 * Returns all conventional paths within .fbeast/.
 * When planName is provided, plans are scoped to .fbeast/plans/<planName>/.
 */
export function getProjectPaths(root: string, planName?: string): ProjectPaths {
  const frankenbeastDir = resolve(root, '.fbeast');
  const llmCacheDir = resolve(frankenbeastDir, '.cache', 'llm');
  const plansBaseDir = resolve(frankenbeastDir, 'plans');
  const plansDir = planName ? resolve(plansBaseDir, planName) : plansBaseDir;
  const buildDir = resolve(frankenbeastDir, '.build');
  const beastsDir = resolve(buildDir, 'beasts');
  return {
    root,
    frankenbeastDir,
    llmCacheDir,
    plansDir,
    buildDir,
    beastsDir,
    beastLogsDir: resolve(beastsDir, 'logs'),
    beastsDb: resolve(frankenbeastDir, 'beast.db'),
    chunkSessionsDir: resolve(buildDir, 'chunk-sessions'),
    chunkSessionSnapshotsDir: resolve(buildDir, 'chunk-session-snapshots'),
    checkpointFile: resolve(buildDir, '.checkpoint'),
    tracesDb: resolve(buildDir, 'build-traces.db'),
    logFile: resolve(buildDir, 'build.log'),
    designDocFile: resolve(plansDir, 'design.md'),
    configFile: resolve(frankenbeastDir, 'config.json'),
    llmResponseFile: resolve(plansDir, 'llm-response.json'),
  };
}

/**
 * Creates .fbeast/ directory structure if it doesn't exist.
 */
export function scaffoldFrankenbeast(paths: ProjectPaths): void {
  mkdirSync(paths.plansDir, { recursive: true });
  mkdirSync(paths.buildDir, { recursive: true });
  mkdirSync(paths.beastsDir, { recursive: true });
  mkdirSync(paths.beastLogsDir, { recursive: true });
}
