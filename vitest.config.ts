import { defineConfig } from 'vitest/config';
import { isAbsolute, relative, resolve } from 'node:path';

import { readVitestFlags } from './scripts/vitest-env.js';

const vitestFlags = readVitestFlags(['INTEGRATION', 'E2E', 'DOCKER_BUILD']);
const normalizeRequestedPath = (arg: string): string => {
  const normalized = arg.replace(/:\d+(?::\d+)?$/u, '').replace(/\\/gu, '/');
  if (isAbsolute(normalized)) {
    return relative(process.cwd(), normalized).replace(/\\/gu, '/');
  }
  return normalized.replace(/^\.\//u, '');
};
const isRequestedTestPath = (arg: string): boolean => (
  arg === 'tests/integration'
  || arg.startsWith('tests/integration/')
  || arg === 'tests/sandbox-dockerfile.test.ts'
  || (arg.startsWith('tests/') && arg.endsWith('.test.ts'))
);
const requestedPaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('-') && arg !== 'run')
  .map(normalizeRequestedPath)
  .filter(isRequestedTestPath);
const requestedDockerBuild = requestedPaths.some((arg) => arg === 'tests/sandbox-dockerfile.test.ts');
const explicitPathRequest = requestedPaths.length > 0;
const runIntegration = vitestFlags.INTEGRATION;
const runE2e = vitestFlags.E2E;
const runDockerBuild = vitestFlags.DOCKER_BUILD || requestedDockerBuild;

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
    // DOCKER_BUILD=true or the explicit sandbox Dockerfile test path opts into Docker builds.
    include: runIntegration && !explicitPathRequest
      ? ['tests/integration/**/*.test.ts']
      : runE2e && !explicitPathRequest
        ? ['tests/integration/**/*e2e*.test.ts']
        : ['tests/**/*.test.ts'],
    exclude: runIntegration || runE2e || explicitPathRequest
      ? ['**/node_modules/**', '**/dist/**']
      : [
          '**/node_modules/**',
          '**/dist/**',
          'tests/integration/**/*.test.ts',
          ...(runDockerBuild ? [] : ['tests/sandbox-dockerfile.test.ts']),
        ],
    testTimeout: 15_000,
  },
});
