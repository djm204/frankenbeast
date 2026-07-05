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
    expect(CONFIG_SOURCE).toContain('operatorProxy(proxyTarget, operatorToken)');
    expect(CONFIG_SOURCE).toContain('changeOrigin: true');
  });
});

describe('operator token bridge', () => {
  it('does not bridge operator tokens into the client build', () => {
    expect(CONFIG_SOURCE).not.toContain("'import.meta.env.VITE_BEAST_OPERATOR_TOKEN'");
    expect(CONFIG_SOURCE).not.toContain('loadBeastOperatorToken');
    expect(CONFIG_SOURCE).toContain('operatorProxy(beastProxyTarget, operatorToken)');
    expect(CONFIG_SOURCE).toContain("proxyReq.setHeader('authorization'");
  });
});
