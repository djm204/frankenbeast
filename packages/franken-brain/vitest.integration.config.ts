import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    setupFiles: [fileURLToPath(new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url))],
    globals: false,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
  },
});
