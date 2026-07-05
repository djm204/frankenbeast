import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { OrchestratorConfigSchema } from '../franken-orchestrator/src/config/orchestrator-config.js';
import { createSecretStore } from '../franken-orchestrator/src/network/secret-store.js';

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

export type SecretStoreOperatorTokenResolver = (rootDir: string, configPath?: string) => Promise<string>;

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

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost'
    || normalized === '::1'
    || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }
  if (!/^127(?:\.\d{1,3}){3}$/.test(normalized)) {
    return false;
  }
  return normalized.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

export function assertSecureProxyTarget(name: string, target: string): void {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }

  if (parsed.protocol === 'https:') {
    return;
  }

  if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) {
    return;
  }

  throw new Error(
    `${name} must use https:// unless it targets a loopback-only development host. Refusing insecure proxy target: ${target}`,
  );
}

export async function resolveSecretStoreOperatorToken(rootDir: string, configPath?: string): Promise<string> {
  try {
    const resolvedConfigPath = configPath
      ? (isAbsolute(configPath) ? configPath : resolve(rootDir, configPath))
      : join(rootDir, '.fbeast', 'config.json');
    const configJson = await readFile(resolvedConfigPath, 'utf8');
    const config = OrchestratorConfigSchema.parse(JSON.parse(configJson));
    const operatorTokenRef = config.network.operatorTokenRef?.trim();
    if (!operatorTokenRef) {
      return '';
    }

    const secretStore = createSecretStore(config.network.secureBackend ?? 'local-encrypted', {
      projectRoot: rootDir,
      passphrase: process.env.FRANKENBEAST_PASSPHRASE,
    });
    return (await secretStore.resolve(operatorTokenRef))?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function loadProxyOperatorToken(
  load: EnvLoader,
  mode: string,
  rootDir: string,
  packageDir: string,
  resolveFromSecretStore: SecretStoreOperatorTokenResolver = resolveSecretStoreOperatorToken,
): Promise<string> {
  const env = loadProxyEnv(load, mode, rootDir, packageDir);
  assertNoBrowserOperatorToken(env);

  const activeConfigPath = env.FRANKENBEAST_CONFIG_FILE || env.FRANKENBEAST_CONFIG_PATH;
  const secretStoreToken = await resolveFromSecretStore(rootDir, activeConfigPath);
  if (secretStoreToken) {
    return secretStoreToken;
  }

  return env.FRANKENBEAST_BEAST_OPERATOR_TOKEN || '';
}
