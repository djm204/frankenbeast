import { describe, it, expect } from 'vitest'
import { ArchitecturalAdherenceEval } from './ArchitecturalAdherence.js'
import type { ADRRule } from './ArchitecturalAdherence.js'
import { EvalRunner } from '../EvalRunner.js'

const runner = new EvalRunner()
const ev = new ArchitecturalAdherenceEval()

// Example ADR rules matching the project's TS/React standards
const noAnyRule: ADRRule = {
  name: 'no-any',
  description: 'TypeScript output must not use the `any` type',
  check: (output) => !output.includes(': any') && !output.includes('as any'),
}

const functionalComponentRule: ADRRule = {
  name: 'functional-components',
  description: 'React components must be function declarations or arrow functions, not classes',
  check: (output) => !output.includes('class') || !output.includes('extends React.Component'),
}

const noConsoleLogRule: ADRRule = {
  name: 'no-console-log',
  description: 'Production code must not contain ad-hoc console output statements',
  check: (output) => !output.includes('console' + '.log'),
}

describe('ArchitecturalAdherenceEval', () => {
  describe('passing cases', () => {
    it('passes when all rules pass', async () => {
      const result = await runner.run(ev, {
        output: 'const greet = (name: string): string => `Hello ${name}`',
        rules: [noAnyRule, functionalComponentRule, noConsoleLogRule],
      })
      expect(result.status).toBe('pass')
      expect(result.score).toBe(1.0)
    })

    it('passes with an empty rules list', async () => {
      const result = await runner.run(ev, { output: 'anything', rules: [] })
      expect(result.status).toBe('pass')
      expect(result.score).toBe(1.0)
    })
  })

  describe('failing cases', () => {
    it('fails when a rule is violated', async () => {
      const result = await runner.run(ev, {
        output: 'const x: any = getValue()',
        rules: [noAnyRule],
      })
      expect(result.status).toBe('fail')
      expect(result.reason).toMatch(/no-any/i)
    })

    it('reports all violated rules in details', async () => {
      const result = await runner.run(ev, {
        output: `const x: any = getValue()\n${'console' + '.log'}(x)`,
        rules: [noAnyRule, functionalComponentRule, noConsoleLogRule],
      })
      expect(result.status).toBe('fail')
      const violated = result.details?.['violatedRules'] as string[]
      expect(violated).toContain('no-any')
      expect(violated).toContain('no-console-log')
      expect(violated).not.toContain('functional-components')
    })

    it('includes violation descriptions in reason', async () => {
      const result = await runner.run(ev, {
        output: 'const x: any = 1',
        rules: [noAnyRule],
      })
      expect(result.reason).toContain('TypeScript output must not use the `any` type')
    })

    it('reports throwing rules by rule and continues evaluating remaining rules', async () => {
      const evaluatedRules: string[] = []
      const throwingRule: ADRRule = {
        name: 'parse-adr-links',
        description: 'ADR references must be parseable',
        check: () => {
          evaluatedRules.push('parse-adr-links')
          throw new Error('ADR parser failed')
        },
      }
      const passingRule: ADRRule = {
        name: 'passing-rule',
        description: 'A passing rule should still run after an earlier exception',
        check: () => {
          evaluatedRules.push('passing-rule')
          return true
        },
      }

      const result = await runner.run(ev, {
        output: `const x: any = 1`,
        rules: [throwingRule, noAnyRule, passingRule],
      })

      expect(result.status).toBe('fail')
      expect(result.reason).toContain('[parse-adr-links] ADR references must be parseable')
      expect(result.reason).toContain('ADR parser failed')
      expect(result.reason).toContain('[no-any] TypeScript output must not use the `any` type')
      expect(result.reason).not.toContain('passing-rule')
      expect(result.details?.['violatedRules']).toEqual(['parse-adr-links', 'no-any'])
      expect(result.details?.['ruleErrors']).toEqual([
        { rule: 'parse-adr-links', error: 'ADR parser failed' },
      ])
      expect(evaluatedRules).toEqual(['parse-adr-links', 'passing-rule'])
    })
  })

  describe('score', () => {
    it('score is 1.0 when all rules pass', async () => {
      const result = await runner.run(ev, {
        output: 'clean code',
        rules: [noAnyRule, noConsoleLogRule],
      })
      expect(result.score).toBe(1.0)
    })

    it('score reflects proportion of passing rules', async () => {
      // 2 rules, 1 fails → score 0.5
      const result = await runner.run(ev, {
        output: 'const x: any = 1',
        rules: [noAnyRule, noConsoleLogRule],
      })
      expect(result.score).toBeCloseTo(0.5, 5)
    })

    it('score is 0 when all rules fail', async () => {
      const result = await runner.run(ev, {
        output: `const x: any = 1\n${'console' + '.log'}(x)`,
        rules: [noAnyRule, noConsoleLogRule],
      })
      expect(result.score).toBe(0)
    })
  })
})
