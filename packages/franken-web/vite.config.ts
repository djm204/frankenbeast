import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProxyOperatorToken } from './vite-env';

const repoRootDir = fileURLToPath(new URL('../../', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

function withServerSideOperatorAuth(target: string, operatorToken: string, extra: ProxyOptions = {}): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    ...(operatorToken ? { headers: { authorization: `Bearer ${operatorToken}` } } : {}),
    ...extra,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3737';
  const beastProxyTarget = env.VITE_BEAST_API_PROXY_TARGET || proxyTarget;
  const proxyOperatorToken = loadProxyOperatorToken(loadEnv, mode, repoRootDir, process.cwd());

  return {
    plugins: [tailwindcss(), react()],
    define: {
      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
    },
    server: {
      proxy: {
        '/v1/beasts': withServerSideOperatorAuth(beastProxyTarget, proxyOperatorToken),
        '/v1': withServerSideOperatorAuth(proxyTarget, proxyOperatorToken, { ws: true }),
        '/api': withServerSideOperatorAuth(proxyTarget, proxyOperatorToken),
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
