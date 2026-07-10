import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig } from 'vitest/config';
import { readVitestFlags } from '../../scripts/vitest-env.js';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const vitestFlags = readVitestFlags(['INTEGRATION', 'E2E']);
const isIntegration = vitestFlags.INTEGRATION;
const isE2e = vitestFlags.E2E;
const requestedPaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('-') && arg !== 'run');
const requestedIntegration = requestedPaths.some((arg) => arg.includes('tests/integration/'));
const requestedE2e = requestedPaths.some(
  (arg) => arg.includes('tests/e2e/') || arg.includes('test/e2e/'),
);
const runIntegration = isIntegration || requestedIntegration;
const runE2e = isE2e || requestedE2e;
const requestedUnit = requestedPaths.some((arg) => arg.includes('tests/unit/'));
const runMixed = [runE2e, runIntegration, requestedUnit].filter(Boolean).length > 1;

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    setupFiles: [new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url).pathname],
    globals: false,
    environment: 'node',
    include: runMixed
      ? ['tests/**/*.test.ts', 'test/**/*.test.ts']
      : runE2e
        ? ['tests/e2e/**/*.test.ts', 'test/e2e/**/*.test.ts']
        : runIntegration
          ? ['tests/integration/**/*.test.ts']
          : ['tests/unit/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: runMixed
      ? []
      : runE2e
        ? []
        : runIntegration
          ? []
          : ['tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts', 'test/e2e/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
