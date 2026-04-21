import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Returns true when the current module is the process entry point.
 * Works correctly with symlinked npm bin scripts (unlike the naive
 * import.meta.url.endsWith(process.argv[1]) pattern).
 */
export function isMain(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}
