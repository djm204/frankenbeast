import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
// thisDir is src/beasts/definitions — package root is three levels up
const packageRoot = resolve(thisDir, '..', '..', '..');

/**
 * Resolve the CLI entrypoint for spawning child frankenbeast processes.
 * Prefers the compiled dist/cli/run.js; falls back to src/cli/run.ts for development.
 * Throws if neither file exists.
 */
export function resolveCliEntrypoint(): string {
  const distPath = resolve(packageRoot, 'dist', 'cli', 'run.js');
  if (existsSync(distPath)) {
    return distPath;
  }

  const srcPath = resolve(packageRoot, 'src', 'cli', 'run.ts');
  if (existsSync(srcPath)) {
    return srcPath;
  }

  throw new Error(
    `Cannot find CLI entrypoint. Checked:\n  ${distPath}\n  ${srcPath}`,
  );
}
