import { defineConfig } from 'vitest/config';
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js';

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
