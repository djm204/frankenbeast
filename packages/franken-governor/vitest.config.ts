import { defineConfig } from 'vitest/config';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url))],
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },
  },
});
