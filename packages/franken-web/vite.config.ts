import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRootDir = fileURLToPath(new URL('../../', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

const LOCAL_SECRET_ALGORITHM = 'aes-256-gcm';
const LOCAL_SECRET_PBKDF2_ITERATIONS = 100_000;
const LOCAL_SECRET_PBKDF2_DIGEST = 'sha512';
const LOCAL_SECRET_KEY_LENGTH = 32;
const LOCAL_SECRET_IV_LENGTH = 16;
const LOCAL_SECRET_AUTH_TAG_LENGTH = 16;

type LoadedEnv = Record<string, string | undefined>;

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, repoRootDir, ''), ...loadEnv(mode, process.cwd(), '') };
  assertNoBrowserOperatorToken(env);

  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3737';
  const beastProxyTarget = env.VITE_BEAST_API_PROXY_TARGET || proxyTarget;
  const operatorToken = resolveServerOperatorToken(env);
  const proxy = {
    '/v1/beasts': operatorProxy(beastProxyTarget, operatorToken),
    '/v1': {
      ...operatorProxy(
        proxyTarget,
        operatorToken,
        (path) => path.startsWith('/v1/network') || path.startsWith('/v1/chat'),
      ),
      ws: true,
    },
    '/api': operatorProxy(proxyTarget, operatorToken),
  } satisfies Record<string, ProxyOptions>;

  return {
    plugins: [tailwindcss(), react()],
    define: {
      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
    },
    server: {
      proxy,
    },
    preview: {
      proxy,
    },
    build: {
      outDir: 'dist',
    },
  };
});

function assertNoBrowserOperatorToken(env: LoadedEnv): void {
  if (env.VITE_BEAST_OPERATOR_TOKEN?.trim()) {
    throw new Error(
      'Refusing to expose VITE_BEAST_OPERATOR_TOKEN to the browser bundle. '
      + 'Move the operator token to FRANKENBEAST_BEAST_OPERATOR_TOKEN or network.operatorTokenRef.',
    );
  }
}

function resolveServerOperatorToken(env: LoadedEnv): string {
  const envToken = env.FRANKENBEAST_BEAST_OPERATOR_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  return resolveLocalSecretStoreOperatorToken(env) ?? '';
}

function resolveLocalSecretStoreOperatorToken(env: LoadedEnv): string | undefined {
  const config = readJsonFile<Record<string, unknown>>(env.FRANKENBEAST_CONFIG_FILE || join(repoRootDir, '.fbeast', 'config.json'));
  const network = asRecord(config?.network);
  const operatorTokenRef = typeof network?.operatorTokenRef === 'string' ? network.operatorTokenRef.trim() : '';
  if (!operatorTokenRef) {
    return undefined;
  }

  const secureBackend = typeof network?.secureBackend === 'string' ? network.secureBackend : 'local-encrypted';
  const passphrase = env.FRANKENBEAST_PASSPHRASE?.trim();
  if (secureBackend !== 'local-encrypted' || !passphrase) {
    return undefined;
  }

  const secrets = readLocalEncryptedSecrets(repoRootDir, passphrase);
  const token = secrets?.[operatorTokenRef]?.trim();
  return token || undefined;
}

function readLocalEncryptedSecrets(root: string, passphrase: string): Record<string, string> | undefined {
  try {
    const meta = readJsonFile<{ salt: string; version: 1 }>(join(root, '.fbeast', 'secrets.meta.json'));
    if (!meta?.salt) {
      return undefined;
    }

    const ciphertext = readFileSync(join(root, '.fbeast', 'secrets.enc'));
    const key = pbkdf2Sync(
      passphrase,
      Buffer.from(meta.salt, 'hex'),
      LOCAL_SECRET_PBKDF2_ITERATIONS,
      LOCAL_SECRET_KEY_LENGTH,
      LOCAL_SECRET_PBKDF2_DIGEST,
    );
    const iv = ciphertext.subarray(0, LOCAL_SECRET_IV_LENGTH);
    const authTag = ciphertext.subarray(LOCAL_SECRET_IV_LENGTH, LOCAL_SECRET_IV_LENGTH + LOCAL_SECRET_AUTH_TAG_LENGTH);
    const encrypted = ciphertext.subarray(LOCAL_SECRET_IV_LENGTH + LOCAL_SECRET_AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(LOCAL_SECRET_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, string>;
  } catch {
    return undefined;
  }
}

function readJsonFile<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function operatorProxy(
  target: string,
  operatorToken: string,
  shouldInject: (path: string) => boolean = () => true,
): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        if (!operatorToken || !shouldInject(req.url ?? '') || !isTrustedProxyRequest(req)) {
          return;
        }
        proxyReq.setHeader('authorization', `Bearer ${operatorToken}`);
      });
    },
  };
}

type ProxyRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | undefined } | undefined;
};

function isTrustedProxyRequest(req: ProxyRequest): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    return false;
  }

  const origin = headerValue(req.headers.origin);
  const host = headerValue(req.headers.host);
  if (origin && host) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes((req.method ?? '').toUpperCase())) {
    return false;
  }

  const fetchSite = headerValue(req.headers['sec-fetch-site'])?.toLowerCase();
  return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}

function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) {
    return false;
  }
  if (remoteAddress === '::1' || remoteAddress === '127.0.0.1' || remoteAddress === 'localhost') {
    return true;
  }
  if (remoteAddress.startsWith('127.')) {
    return true;
  }
  if (remoteAddress.startsWith('::ffff:127.')) {
    return true;
  }
  return false;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
