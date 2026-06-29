import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBeastOperatorToken } from './vite-env';

const repoRootDir = fileURLToPath(new URL('../../', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3737';

  // The orchestrator resolves its operator token from the root .env's
  // FRANKENBEAST_BEAST_OPERATOR_TOKEN (or a secret store), but Vite only exposes
  // VITE_-prefixed vars to the browser bundle. Without this bridge the secured
  // control-plane clients (/v1/network, /api/*, /v1/beasts/*) would never see a
  // token and every request would 401. We read env from BOTH the repo root
  // (where FRANKENBEAST_BEAST_OPERATOR_TOKEN is documented to live) and this
  // package dir, since the Vite scripts run with cwd = packages/franken-web.
  const beastOperatorToken = loadBeastOperatorToken(loadEnv, mode, repoRootDir, process.cwd());

  return {
    plugins: [tailwindcss(), react()],
    define: {
      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
      'import.meta.env.VITE_BEAST_OPERATOR_TOKEN': JSON.stringify(beastOperatorToken),
    },
    server: {
      proxy: {
        '/v1': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
