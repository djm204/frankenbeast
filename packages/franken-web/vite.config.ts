import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertNoBundledOperatorTokenEnv,
  loadServerSideOperatorToken,
  shouldAttachOperatorAuth,
} from './vite-env';

const repoRootDir = fileURLToPath(new URL('../../', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rootEnv = loadEnv(mode, repoRootDir, '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3737';
  const beastProxyTarget = env.VITE_BEAST_API_PROXY_TARGET || proxyTarget;
  assertNoBundledOperatorTokenEnv(env);
  assertNoBundledOperatorTokenEnv(rootEnv);
  const serverSideOperatorToken = loadServerSideOperatorToken(
    loadEnv,
    mode,
    repoRootDir,
    process.cwd(),
  );
  const proxyWithServerAuth = (target: string, extra: ProxyOptions = {}): ProxyOptions => ({
    ...extra,
    target,
    changeOrigin: true,
    configure(proxy) {
      extra.configure?.(proxy, {} as never);
      if (!serverSideOperatorToken) return;
      const setAuthHeader = (
        proxyReq: { setHeader(name: string, value: string): void },
        req?: { headers?: Record<string, string | string[] | undefined> },
      ) => {
        if (!shouldAttachOperatorAuth(req?.headers ?? {})) return;
        proxyReq.setHeader('authorization', `Bearer ${serverSideOperatorToken}`);
      };
      proxy.on('proxyReq', setAuthHeader);
      proxy.on('proxyReqWs', setAuthHeader);
    },
  });

  return {
    plugins: [tailwindcss(), react()],
    define: {
      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
    },
    server: {
      proxy: {
        '/v1/beasts': proxyWithServerAuth(beastProxyTarget),
        '/v1': proxyWithServerAuth(proxyTarget, {
          ws: true,
        }),
        '/api': proxyWithServerAuth(proxyTarget),
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
