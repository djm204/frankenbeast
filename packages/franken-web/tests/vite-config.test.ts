import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('vite dev proxy configuration', () => {
  it('proxies dashboard API routes to the backend in same-origin mode', () => {
    const configPath = join(process.cwd(), 'vite.config.ts');
    const config = readFileSync(configPath, 'utf8');

    expect(config).toContain("'/api'");
    expect(config).toContain('target: proxyTarget');
    expect(config).toContain('changeOrigin: true');
  });
});
