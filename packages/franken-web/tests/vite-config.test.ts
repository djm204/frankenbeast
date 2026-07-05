import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE: vite.config.ts cannot be imported into the jsdom test runtime (esbuild
// trips a TextEncoder invariant), so we assert against its source text. The
// runtime behaviour of token resolution is exercised by vite-env.test.ts.
const CONFIG_SOURCE = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

describe('vite dev proxy configuration', () => {
  it('proxies dashboard API routes to the backend in same-origin mode', () => {
    expect(CONFIG_SOURCE).toContain("'/api'");
    expect(CONFIG_SOURCE).toContain("'/api': withServerSideOperatorAuth(proxyTarget, proxyOperatorToken)");
    expect(CONFIG_SOURCE).toContain('changeOrigin: true');
  });

  it('injects the operator token only in the server-side dev proxy after an origin check', () => {
    expect(CONFIG_SOURCE).toContain('await loadProxyOperatorToken(loadEnv, mode, repoRootDir, process.cwd())');
    expect(CONFIG_SOURCE).toContain('isSameOriginProxyRequest');
    expect(CONFIG_SOURCE).toContain("req.headers['sec-fetch-site']");
    expect(CONFIG_SOURCE).toContain('proxyReq.setHeader');
    expect(CONFIG_SOURCE).not.toContain('headers: { authorization');
  });

  it('requires browser metadata or a loopback peer before injecting the operator token', () => {
    expect(CONFIG_SOURCE).toContain('isLoopbackRemoteAddress(req.socket.remoteAddress)');
    expect(CONFIG_SOURCE).toContain('if (!originValue && !fetchSiteValue)');
  });

  it('does not define VITE_BEAST_OPERATOR_TOKEN into the browser bundle', () => {
    expect(CONFIG_SOURCE).not.toContain("'import.meta.env.VITE_BEAST_OPERATOR_TOKEN'");
    expect(CONFIG_SOURCE).not.toContain('import.meta.env.VITE_BEAST_OPERATOR_TOKEN');
  });
});
