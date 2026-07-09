import { defineConfig } from 'vitest/config';
import { isAbsolute, relative, resolve } from 'node:path';

import { readVitestFlags } from './scripts/vitest-env.js';

const vitestFlags = readVitestFlags(['INTEGRATION', 'E2E', 'DOCKER_BUILD']);
const optionsWithRequiredValue = new Set([
  '--config',
  '--coverage.exclude',
  '--coverage.extension',
  '--coverage.include',
  '--coverage.provider',
  '--coverage.reporter',
  '--coverage.reportsDirectory',
  '--coverage.thresholds.branches',
  '--coverage.thresholds.functions',
  '--coverage.thresholds.lines',
  '--coverage.thresholds.perFile',
  '--coverage.thresholds.statements',
  '--coverage.watermarks.branches',
  '--coverage.watermarks.functions',
  '--coverage.watermarks.lines',
  '--coverage.watermarks.statements',
  '--dir',
  '--environment',
  '--exclude',
  '--include',
  '--pool',
  '--project',
  '--reporter',
  '--root',
  '--testNamePattern',
  '--test-name-pattern',
  '-c',
  '-r',
  '-t',
]);
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
const collectRequestedPaths = (args: readonly string[]): string[] => {
  const paths: string[] = [];
  let skipOptionValue = false;

  for (const arg of args) {
    if (skipOptionValue) {
      skipOptionValue = false;
      continue;
    }

    if (arg === 'run') {
      continue;
    }

    if (arg.startsWith('-')) {
      const optionName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      if (optionsWithRequiredValue.has(optionName) && !arg.includes('=')) {
        skipOptionValue = true;
      }
      continue;
    }

    const normalized = normalizeRequestedPath(arg);
    if (isRequestedTestPath(normalized)) {
      paths.push(normalized);
    }
  }

  return paths;
};
const requestedPaths = collectRequestedPaths(process.argv.slice(2));
const requestedDockerBuild = requestedPaths.some((arg) => arg === 'tests/sandbox-dockerfile.test.ts');
const explicitPathRequest = requestedPaths.length > 0;
const runIntegration = vitestFlags.INTEGRATION;
const runE2e = vitestFlags.E2E;
const runDockerBuild = vitestFlags.DOCKER_BUILD || requestedDockerBuild;
const optionalSuiteRequested = runIntegration || runE2e || runDockerBuild;
const include = explicitPathRequest || !optionalSuiteRequested
  ? ['tests/**/*.test.ts']
  : [
      ...(runIntegration ? ['tests/integration/**/*.test.ts'] : []),
      ...(runE2e ? ['tests/integration/**/*e2e*.test.ts'] : []),
      ...(runDockerBuild ? ['tests/sandbox-dockerfile.test.ts'] : []),
    ];
const exclude = explicitPathRequest
  ? ['**/node_modules/**', '**/dist/**']
  : [
      '**/node_modules/**',
      '**/dist/**',
      ...(!optionalSuiteRequested ? ['tests/integration/**/*.test.ts'] : []),
      ...(runIntegration && !runE2e ? ['tests/integration/**/*e2e*.test.ts'] : []),
    ];

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
    // DOCKER_BUILD=true opts into the Docker build assertion inside the sandbox Dockerfile test.
    include,
    exclude,
    testTimeout: 15_000,
  },
});
