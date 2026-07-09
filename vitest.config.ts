import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

import { readVitestFlags } from './scripts/vitest-env.js';

const vitestFlags = readVitestFlags(['INTEGRATION', 'E2E']);
const requestedPaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('-') && arg !== 'run');
const requestedIntegration = requestedPaths.some((arg) => arg.includes('tests/integration/'));
const requestedE2e = requestedPaths.some((arg) => arg.includes('e2e'));
const runIntegration = vitestFlags.INTEGRATION || requestedIntegration;
const runE2e = vitestFlags.E2E || requestedE2e;

export default defineConfig({
  resolve: {
    alias: {
      '@franken/brain': resolve(__dirname, 'packages/franken-brain/src/index.ts'),
      '@franken/planner': resolve(__dirname, 'packages/franken-planner/src/index.ts'),
      '@franken/observer': resolve(__dirname, 'packages/franken-observer/src/index.ts'),
      '@franken/critique': resolve(__dirname, 'packages/franken-critique/src/index.ts'),
      '@franken/governor': resolve(__dirname, 'packages/franken-governor/src/index.ts'),
      '@franken/types': resolve(__dirname, 'packages/franken-types/src/index.ts'),
      '@franken/orchestrator': resolve(__dirname, 'packages/franken-orchestrator/src/index.ts'),
    },
  },
  test: {
    // Default root CI suite: deterministic repository policy/config tests only.
    // INTEGRATION=true or an explicit tests/integration path opts into root integration tests.
    // E2E=true or an explicit e2e path opts into root end-to-end tests.
    include: runIntegration
      ? ['tests/integration/**/*.test.ts']
      : runE2e
        ? ['tests/integration/**/*e2e*.test.ts']
        : ['tests/**/*.test.ts'],
    exclude: runIntegration || runE2e
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', 'tests/integration/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
