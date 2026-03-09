import { resolve, basename } from 'node:path';
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
  /** Raw LLM decomposition response cache */
  llmResponseFile: string;
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
 * Returns all conventional paths within .frankenbeast/.
 * When planName is provided, plans are scoped to .frankenbeast/plans/<planName>/.
 */
export function getProjectPaths(root: string, planName?: string): ProjectPaths {
  const frankenbeastDir = resolve(root, '.frankenbeast');
  const plansBaseDir = resolve(frankenbeastDir, 'plans');
  const plansDir = planName ? resolve(plansBaseDir, planName) : plansBaseDir;
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
    llmResponseFile: resolve(plansDir, 'llm-response.json'),
  };
}

/**
 * Creates .frankenbeast/ directory structure if it doesn't exist.
 */
export function scaffoldFrankenbeast(paths: ProjectPaths): void {
  mkdirSync(paths.plansDir, { recursive: true });
  mkdirSync(paths.buildDir, { recursive: true });
}
