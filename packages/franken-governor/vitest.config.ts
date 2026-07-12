import { defineConfig } from 'vitest/config';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';
import { readVitestFlags } from '../../scripts/vitest-env.js';
import { fileURLToPath } from 'node:url';

const vitestFlags = readVitestFlags(['INTEGRATION']);
const isIntegration = vitestFlags.INTEGRATION;

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url))],
    globals: false,
    include: isIntegration ? ['tests/integration/**/*.test.ts', 'tests/**/*.integration.test.ts'] : ['tests/**/*.test.ts'],
    exclude: isIntegration ? [] : ['tests/integration/**/*.test.ts', 'tests/**/*.integration.test.ts'],
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
