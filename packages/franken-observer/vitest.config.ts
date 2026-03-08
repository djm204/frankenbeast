import { defineConfig } from 'vitest/config'

const isIntegration = Boolean(process.env['INTEGRATION'])
const isEval = Boolean(process.env['EVAL'])

export default defineConfig({
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
