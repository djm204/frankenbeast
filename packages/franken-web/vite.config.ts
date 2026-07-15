import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { assertNoBrowserOperatorToken, assertSecureProxyTarget, loadProxyEnv, loadProxyOperatorToken } from './vite-env';

type ServerSideProxyConfig = Record<string, string | ProxyOptions>;

const repoRootDir = fileURLToPath(new URL('../../', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

function isLoopbackRemoteAddress(address: string | undefined): boolean {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === 'localhost';
}

function isSameOriginProxyRequest(req: IncomingMessage): boolean {
  if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
    return false;
  }

  const fetchSite = req.headers['sec-fetch-site'];
  const fetchSiteValue = Array.isArray(fetchSite) ? fetchSite[0] : fetchSite;
  if (fetchSiteValue && !['none', 'same-origin'].includes(fetchSiteValue)) {
    return false;
  }

  const origin = req.headers.origin;
  const originValue = Array.isArray(origin) ? origin[0] : origin;
  if (!originValue && !fetchSiteValue) {
    return isLoopbackRemoteAddress(req.socket.remoteAddress);
  }
  if (!originValue) {
    return fetchSiteValue === 'same-origin'
      || isLoopbackRemoteAddress(req.socket.remoteAddress);
  }

  const host = req.headers.host;
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(originValue);
    const protocol = (req.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:';
    return originUrl.protocol === protocol && originUrl.host === host;
  } catch {
    return false;
  }
}

function requestProtocol(req: IncomingMessage): 'http' | 'https' {
  return (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
}

function withServerSideOperatorAuth(target: string, operatorToken: string, extra: ProxyOptions = {}): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    bypass(req, res) {
      if (operatorToken && !isSameOriginProxyRequest(req)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return false;
      }
      return undefined;
    },
    configure(proxy) {
      if (!operatorToken) {
        return;
      }
      proxy.on('proxyReq', (proxyReq, req) => {
        proxyReq.setHeader('authorization', `Bearer ${operatorToken}`);
        if (req.headers.host) {
          proxyReq.setHeader('x-forwarded-host', req.headers.host);
          proxyReq.setHeader('x-forwarded-proto', requestProtocol(req));
        }
      });
    },
    ...extra,
  };
}

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  assertNoBrowserOperatorToken(loadProxyEnv(loadEnv, mode, repoRootDir, process.cwd()));
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3737';
  const beastProxyTarget = env.VITE_BEAST_API_PROXY_TARGET || proxyTarget;
  assertSecureProxyTarget('VITE_API_PROXY_TARGET', proxyTarget);
  assertSecureProxyTarget('VITE_BEAST_API_PROXY_TARGET', beastProxyTarget);
  const proxyOperatorToken = command === 'serve'
    ? await loadProxyOperatorToken(loadEnv, mode, repoRootDir, process.cwd())
    : '';
  const serverSideProxy: ServerSideProxyConfig = {
    '/v1/beasts': withServerSideOperatorAuth(beastProxyTarget, proxyOperatorToken),
    '/v1': withServerSideOperatorAuth(proxyTarget, proxyOperatorToken, { ws: true }),
    '/api': withServerSideOperatorAuth(proxyTarget, proxyOperatorToken),
  };

  return {
    plugins: [tailwindcss(), react()],
    define: {
      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
    },
    server: {
      proxy: serverSideProxy,
    },
    preview: {
      proxy: serverSideProxy,
    },
    build: {
      outDir: 'dist',
    },
  };
});
