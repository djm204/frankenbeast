import { defineConfig } from 'vitest/config'
import { readVitestFlags } from '../../scripts/vitest-env.js'
import { createFrankenSourceAliases } from '../../scripts/vitest-source-aliases.js'
const vitestFlags = readVitestFlags(['INTEGRATION', 'EVAL'])
const isIntegration = vitestFlags.INTEGRATION
const isEval = vitestFlags.EVAL

export default defineConfig({
  resolve: {
    alias: createFrankenSourceAliases(import.meta.url),
  },
  test: {
    // Default: unit tests only.
    // INTEGRATION=true → integration tests only.
    // EVAL=true        → eval (LLM-judge) tests only.
    include: isIntegration
      ? ['src/**/*.integration.test.ts']
      : isEval
        ? ['src/**/*.eval.test.ts']
        : ['src/**/*.test.ts'],
    exclude: isIntegration || isEval
      ? []
      : ['src/**/*.integration.test.ts', 'src/**/*.eval.test.ts'],
    reporters: ['verbose'],
    passWithNoTests: true,
  },
})
