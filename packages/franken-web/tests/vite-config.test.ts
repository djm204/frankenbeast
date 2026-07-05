import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE: vite.config.ts cannot be imported into the jsdom test runtime (esbuild
// trips a TextEncoder invariant), so we assert against its source text. The
// runtime behaviour of the token bridge is exercised by the production build.
const CONFIG_SOURCE = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

describe('vite dev proxy configuration', () => {
  it('proxies dashboard API routes to the backend in same-origin mode', () => {
    expect(CONFIG_SOURCE).toContain("'/api'");
    expect(CONFIG_SOURCE).toContain('target,');
    expect(CONFIG_SOURCE).toContain('changeOrigin: true');
  });
});

describe('operator token hardening', () => {
  it('does not bridge an operator token into the client build', () => {
    expect(CONFIG_SOURCE).not.toContain("'import.meta.env.VITE_BEAST_OPERATOR_TOKEN'");
    expect(CONFIG_SOURCE).not.toContain('loadBeastOperatorToken');
    expect(CONFIG_SOURCE).not.toContain('define: {\n      __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),\n      \'import.meta.env.VITE_BEAST_OPERATOR_TOKEN\'');
  });

  it('fails startup when a VITE-prefixed operator token would be bundled', () => {
    expect(CONFIG_SOURCE).toContain('assertNoBundledOperatorTokenEnv(env)');
  });

  it('adds server-side operator auth only in the dev proxy layer', () => {
    expect(CONFIG_SOURCE).toContain('loadServerSideOperatorToken');
    expect(CONFIG_SOURCE).toContain("proxyReq.setHeader('authorization', `Bearer ${serverSideOperatorToken}`)");
    expect(CONFIG_SOURCE).toContain("proxy.on('proxyReq', setAuthHeader)");
    expect(CONFIG_SOURCE).toContain("proxy.on('proxyReqWs', setAuthHeader)");
  });
});
