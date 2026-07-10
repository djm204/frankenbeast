import { defineConfig } from 'vitest/config';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    setupFiles: [new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url).pathname],
    globals: false,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 90,
        branches: 80,
      },
    },
  },
});
