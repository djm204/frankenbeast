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
    expect(CONFIG_SOURCE).toContain('target: proxyTarget');
    expect(CONFIG_SOURCE).toContain('changeOrigin: true');
  });

  it('injects chat auth at the dev proxy instead of in browser code', () => {
    expect(CONFIG_SOURCE).toContain("operatorProxy(proxyTarget, beastOperatorToken, (path) => path.startsWith('/v1/chat'))");
    expect(CONFIG_SOURCE).toContain("proxyReq.setHeader('authorization'");
  });
});

describe('operator token bridge', () => {
  it('bridges the resolved operator token into the client build', () => {
    expect(CONFIG_SOURCE).toContain("'import.meta.env.VITE_BEAST_OPERATOR_TOKEN'");
  });

  it('resolves the token via the shared helper, reading from the repo root', () => {
    // Resolution precedence is unit-tested in vite-env.test.ts; here we only
    // assert the config delegates to the helper and passes the repo-root dir
    // (so the documented root .env is read despite cwd = package dir).
    expect(CONFIG_SOURCE).toContain('loadBeastOperatorToken(loadEnv, mode, repoRootDir, process.cwd())');
    expect(CONFIG_SOURCE).toContain("fileURLToPath(new URL('../../', import.meta.url))");
  });
});
