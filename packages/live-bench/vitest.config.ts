import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: [new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url).pathname],
  },
});
