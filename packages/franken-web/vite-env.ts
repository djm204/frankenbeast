/**
 * Server-side operator-token resolution for Vite's development proxy.
 *
 * The dashboard must never expose the long-lived Beast/operator token through
 * `import.meta.env` or any other browser-readable build value. Vite itself runs
 * in Node during development, so it may read the token and inject it only into
 * same-origin proxy requests headed to the backend/control plane.
 *
 * `loadEnv` is injected so this logic is unit-testable without importing the
 * full Vite config (which cannot be loaded into the jsdom test runtime).
 */
export type EnvLoader = (mode: string, dir: string, prefix: string) => Record<string, string>;

export function loadProxyOperatorToken(
  load: EnvLoader,
  mode: string,
  rootDir: string,
  packageDir: string,
): string {
  const rootEnv = load(mode, rootDir, '');
  const packageEnv = load(mode, packageDir, '');
  const env = { ...packageEnv, ...rootEnv };
  return env.FRANKENBEAST_BEAST_OPERATOR_TOKEN || '';
}
