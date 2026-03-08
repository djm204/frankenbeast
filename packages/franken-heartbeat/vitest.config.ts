import { defineConfig } from 'vitest/config';

const isIntegration = Boolean(process.env['INTEGRATION']);

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: isIntegration
      ? ['tests/integration/**/*.test.ts']
      : ['tests/unit/**/*.test.ts'],
    exclude: isIntegration
      ? []
      : ['tests/integration/**/*.test.ts'],
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
