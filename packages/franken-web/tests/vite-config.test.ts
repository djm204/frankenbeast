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
});

describe('operator token bridge', () => {
  it('bridges the resolved operator token into the client build', () => {
    expect(CONFIG_SOURCE).toContain("'import.meta.env.VITE_BEAST_OPERATOR_TOKEN'");
  });

  it('prefers the root FRANKENBEAST_BEAST_OPERATOR_TOKEN with VITE_ as fallback', () => {
    expect(CONFIG_SOURCE).toContain(
      'env.FRANKENBEAST_BEAST_OPERATOR_TOKEN || env.VITE_BEAST_OPERATOR_TOKEN',
    );
  });
});
