import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';
import { fileURLToPath } from 'node:url';

const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  define: {
    __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url))],
    environment: 'jsdom',
    globals: false,
  },
});
