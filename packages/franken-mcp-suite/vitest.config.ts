import { defineConfig } from 'vitest/config';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    setupFiles: [new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url).pathname],
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
