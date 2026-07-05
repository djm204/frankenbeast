import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRootDir = fileURLToPath(new URL('../../', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, repoRootDir, ''), ...loadEnv(mode, process.cwd(), '') };
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3737';
  const beastProxyTarget = env.VITE_BEAST_API_PROXY_TARGET || proxyTarget;
  const operatorToken = env.FRANKENBEAST_BEAST_OPERATOR_TOKEN || '';

  return {
    plugins: [tailwindcss(), react()],
    define: {
      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
    },
    server: {
      proxy: {
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
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});

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

function isTrustedProxyRequest(req: { method?: string; headers: Record<string, string | string[] | undefined> }): boolean {
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

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
