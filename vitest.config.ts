import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'franken-brain': resolve(__dirname, 'packages/franken-brain/src/index.ts'),
      'franken-planner': resolve(__dirname, 'packages/franken-planner/src/index.ts'),
      '@frankenbeast/observer': resolve(__dirname, 'packages/franken-observer/src/index.ts'),
      '@franken/critique': resolve(__dirname, 'packages/franken-critique/src/index.ts'),
      '@franken/governor': resolve(__dirname, 'packages/franken-governor/src/index.ts'),
      '@franken/types': resolve(__dirname, 'packages/franken-types/src/index.ts'),
      'franken-orchestrator': resolve(__dirname, 'packages/franken-orchestrator/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 15_000,
  },
});
