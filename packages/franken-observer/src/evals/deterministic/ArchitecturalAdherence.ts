import type { Eval, EvalResult } from '../types.js'

export interface ADRRule {
  name: string
  description: string
  /** Returns true if the output passes this rule. */
  check(output: string): boolean
}

export interface ArchitecturalAdherenceInput {
  /** The code or text output to validate against the ADR rules. */
  output: string
  rules: ADRRule[]
}

/**
 * Deterministic eval: checks generated output against a set of
 * Architecture Decision Record (ADR) rules. Fails if any rule is
 * violated; score reflects proportion of passing rules.
 */
export class ArchitecturalAdherenceEval implements Eval<ArchitecturalAdherenceInput> {
  readonly name = 'architectural-adherence'

  run(input: ArchitecturalAdherenceInput): EvalResult {
    const { output, rules } = input

    if (rules.length === 0) {
      return { evalName: this.name, status: 'pass', score: 1.0 }
    }

    const violated = rules.filter(r => !r.check(output))
    const score = (rules.length - violated.length) / rules.length

    if (violated.length === 0) {
      return { evalName: this.name, status: 'pass', score: 1.0 }
    }

    const reason = violated
      .map(r => `[${r.name}] ${r.description}`)
      .join('; ')

    return {
      evalName: this.name,
      status: 'fail',
      score,
      reason,
      details: { violatedRules: violated.map(r => r.name) },
    }
  }
}
