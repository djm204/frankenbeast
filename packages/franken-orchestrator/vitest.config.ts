import { defineConfig } from 'vitest/config';

const isIntegration = Boolean(process.env['INTEGRATION']);
const isE2e = Boolean(process.env['E2E']);

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: isE2e
      ? ['tests/e2e/**/*.test.ts']
      : isIntegration
        ? ['tests/integration/**/*.test.ts']
        : ['tests/unit/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: isE2e
      ? []
      : isIntegration
        ? []
        : ['tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
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
