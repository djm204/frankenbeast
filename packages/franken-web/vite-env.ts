/**
 * Operator-token resolution for the browser bundle.
 *
 * The documented setup keeps the operator token in the repository-root `.env`
 * as `FRANKENBEAST_BEAST_OPERATOR_TOKEN`. The Vite scripts in this package run
 * with `process.cwd()` set to the package directory, so a single
 * `loadEnv(mode, process.cwd(), '')` only reads `packages/franken-web/.env` and
 * never sees the root token. We therefore load env from BOTH the repo root and
 * the package directory and merge them (package-level values win for duplicate
 * keys, matching Vite's "more specific wins" cascade and the README's web-only
 * `.env.local` override). The root `FRANKENBEAST_BEAST_OPERATOR_TOKEN` is the
 * primary source; `VITE_BEAST_OPERATOR_TOKEN` is the fallback/override.
 *
 * `loadEnv` is injected so this logic is unit-testable without importing the
 * full Vite config (which cannot be loaded into the jsdom test runtime).
 */
export type EnvLoader = (mode: string, dir: string, prefix: string) => Record<string, string>;

export function loadBeastOperatorToken(
  load: EnvLoader,
  mode: string,
  rootDir: string,
  packageDir: string,
): string {
  const rootEnv = load(mode, rootDir, '');
  const packageEnv = load(mode, packageDir, '');
  const env = { ...rootEnv, ...packageEnv };
  return env.FRANKENBEAST_BEAST_OPERATOR_TOKEN || env.VITE_BEAST_OPERATOR_TOKEN || '';
}
