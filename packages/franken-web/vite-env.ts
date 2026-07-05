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

export function loadProxyEnv(
  load: EnvLoader,
  mode: string,
  rootDir: string,
  packageDir: string,
): Record<string, string> {
  const rootEnv = load(mode, rootDir, '');
  const packageEnv = load(mode, packageDir, '');
  return { ...packageEnv, ...rootEnv };
}

export function assertNoBrowserOperatorToken(env: Record<string, string>): void {
  if (env.VITE_BEAST_OPERATOR_TOKEN) {
    throw new Error(
      'VITE_BEAST_OPERATOR_TOKEN must not be set. Use server-side FRANKENBEAST_BEAST_OPERATOR_TOKEN with the Vite dev proxy instead.',
    );
  }
}

export function loadProxyOperatorToken(
  load: EnvLoader,
  mode: string,
  rootDir: string,
  packageDir: string,
): string {
  const env = loadProxyEnv(load, mode, rootDir, packageDir);
  assertNoBrowserOperatorToken(env);
  return env.FRANKENBEAST_BEAST_OPERATOR_TOKEN || '';
}
