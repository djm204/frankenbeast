import { defineConfig } from 'vitest/config'
import { readVitestFlags } from '../../scripts/vitest-env.js'
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js'
import { fileURLToPath } from 'node:url';
const vitestFlags = readVitestFlags(['INTEGRATION', 'EVAL'])
const isIntegration = vitestFlags.INTEGRATION
const isEval = vitestFlags.EVAL

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../../scripts/vitest-deterministic-setup.ts', import.meta.url))],
    // Default: unit tests only.
    // INTEGRATION=true → integration tests only.
    // EVAL=true        → observer evaluation tests only.
    include: isIntegration
      ? ['src/**/*.integration.test.ts']
      : isEval
        ? ['src/evals/**/*.test.ts', 'src/**/*.eval.test.ts']
        : ['src/**/*.test.ts'],
    exclude: isIntegration || isEval
      ? []
      : ['src/**/*.integration.test.ts', 'src/**/*.eval.test.ts', 'src/evals/**/*.test.ts'],
    reporters: ['verbose'],
  },
})
