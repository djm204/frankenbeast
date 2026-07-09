import type { Trace } from '../../core/types.js'
import type { Eval, EvalResult } from '../types.js'

export interface GoldenSpan {
  name: string
}

/**
 * A serialisable golden-trace fixture. Timestamps and metadata are
 * intentionally omitted — only the structural span sequence is compared.
 */
export interface GoldenTrace {
  goal: string
  spans: GoldenSpan[]
}

export interface GoldenTraceInput {
  actual: Trace
  golden: GoldenTrace
}

/**
 * Regression eval: compares the actual trace's span sequence against a
 * recorded golden fixture. Only span names and order are checked —
 * latency, token counts, and timestamps are allowed to vary between runs.
 */
export class GoldenTraceEval implements Eval<GoldenTraceInput> {
  readonly name = 'golden-trace-regression'

  run(input: GoldenTraceInput): EvalResult {
    const actualNames = input.actual.spans.map(s => s.name)
    const goldenNames = input.golden.spans.map(s => s.name)

    const remainingActualCounts = new Map<string, number>()
    for (const name of actualNames) {
      remainingActualCounts.set(name, (remainingActualCounts.get(name) ?? 0) + 1)
    }

    const missingSpans: string[] = []
    for (const name of goldenNames) {
      const count = remainingActualCounts.get(name) ?? 0
      if (count > 0) {
        remainingActualCounts.set(name, count - 1)
      } else {
        missingSpans.push(name)
      }
    }

    const extraSpans: string[] = []
    for (const name of actualNames) {
      if (goldenNames.includes(name)) continue
      extraSpans.push(name)
    }
    for (const [name, count] of remainingActualCounts.entries()) {
      if (goldenNames.includes(name)) {
        for (let i = 0; i < count; i += 1) extraSpans.push(name)
      }
    }

    const orderedMatchCount = goldenNames.filter((name, index) => actualNames[index] === name).length
    const score = goldenNames.length === 0 ? 1.0 : orderedMatchCount / goldenNames.length
    const firstMismatchIndex = goldenNames.findIndex((name, index) => actualNames[index] !== name)
    const spanOrderMismatch =
      missingSpans.length === 0 && extraSpans.length === 0 && firstMismatchIndex !== -1
        ? {
            index: firstMismatchIndex,
            expected: goldenNames[firstMismatchIndex],
            actual: actualNames[firstMismatchIndex],
            expectedSequence: goldenNames,
            actualSequence: actualNames,
          }
        : undefined

    if (missingSpans.length === 0 && extraSpans.length === 0 && spanOrderMismatch === undefined) {
      return { evalName: this.name, status: 'pass', score: 1.0 }
    }

    const parts: string[] = []
    if (missingSpans.length > 0) parts.push(`Missing spans: ${missingSpans.join(', ')}.`)
    if (extraSpans.length > 0) parts.push(`Extra spans: ${extraSpans.join(', ')}.`)
    if (spanOrderMismatch) {
      parts.push(
        `Span order mismatch at index ${spanOrderMismatch.index}: expected ${spanOrderMismatch.expected}, got ${spanOrderMismatch.actual}.`,
      )
    }

    return {
      evalName: this.name,
      status: 'fail',
      score,
      reason: parts.join(' '),
      details: {
        ...(missingSpans.length > 0 ? { missingSpans } : {}),
        ...(extraSpans.length > 0 ? { extraSpans } : {}),
        ...(spanOrderMismatch ? { spanOrderMismatch } : {}),
      },
    }
  }
}
