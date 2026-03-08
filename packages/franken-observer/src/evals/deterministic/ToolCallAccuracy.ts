import type { Eval, EvalResult } from '../types.js'

export interface ToolCallSchema {
  tool: string
  required: string[]
  /** All params the tool accepts. Must be a superset of required. */
  allowed: string[]
}

export interface ToolCallAccuracyInput {
  actual: {
    tool: string
    params: Record<string, unknown>
  }
  schema: ToolCallSchema
}

/**
 * Deterministic eval: verifies an agent tool call has the correct tool
 * name, all required params present, and no ghost (hallucinated) params.
 */
export class ToolCallAccuracyEval implements Eval<ToolCallAccuracyInput> {
  readonly name = 'tool-call-accuracy'

  run(input: ToolCallAccuracyInput): EvalResult {
    const { actual, schema } = input
    const actualParams = Object.keys(actual.params)

    // Tool name must match exactly
    if (actual.tool !== schema.tool) {
      return {
        evalName: this.name,
        status: 'fail',
        score: 0,
        reason: `Tool name mismatch: expected "${schema.tool}", got "${actual.tool}"`,
      }
    }

    const missingParams = schema.required.filter(p => !(p in actual.params))
    const ghostParams = actualParams.filter(p => !schema.allowed.includes(p))

    const issues: string[] = []
    if (missingParams.length > 0) issues.push(`missing required params: ${missingParams.join(', ')}`)
    if (ghostParams.length > 0) issues.push(`ghost params detected: ${ghostParams.join(', ')}`)

    if (issues.length > 0) {
      // Score: penalise each missing required and each ghost param
      const totalChecks = schema.required.length + actualParams.length
      const violations = missingParams.length + ghostParams.length
      const score = totalChecks === 0 ? 0 : Math.max(0, (totalChecks - violations) / totalChecks)

      const reasonParts: string[] = []
      if (missingParams.length > 0) reasonParts.push(`Missing required param(s): ${missingParams.join(', ')}.`)
      if (ghostParams.length > 0) reasonParts.push(`Ghost param(s) detected: ${ghostParams.join(', ')}.`)

      return {
        evalName: this.name,
        status: 'fail',
        score,
        reason: reasonParts.join(' '),
        details: {
          ...(missingParams.length > 0 ? { missingParams } : {}),
          ...(ghostParams.length > 0 ? { ghostParams } : {}),
        },
      }
    }

    return { evalName: this.name, status: 'pass', score: 1.0 }
  }
}
