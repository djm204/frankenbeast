import { describe, it, expect } from 'vitest'
import { TraceContext } from '../../core/TraceContext.js'
import { EvalRunner } from '../EvalRunner.js'
import { GoldenTraceEval } from './GoldenTraceEval.js'
import type { GoldenTrace } from './GoldenTraceEval.js'

const runner = new EvalRunner()
const ev = new GoldenTraceEval()

function makeActualTrace(spanNames: string[]) {
  const trace = TraceContext.createTrace('goal')
  for (const name of spanNames) {
    const span = TraceContext.startSpan(trace, { name })
    TraceContext.endSpan(span)
  }
  TraceContext.endTrace(trace)
  return trace
}

const golden: GoldenTrace = {
  goal: 'goal',
  spans: [
    { name: 'plan' },
    { name: 'search' },
    { name: 'summarise' },
  ],
}

describe('GoldenTraceEval', () => {
  describe('passing cases', () => {
    it('passes when span sequence exactly matches the golden trace', async () => {
      const trace = makeActualTrace(['plan', 'search', 'summarise'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.status).toBe('pass')
      expect(result.score).toBe(1.0)
    })

    it('passes a golden with a single span', async () => {
      const trace = makeActualTrace(['plan'])
      const singleGolden: GoldenTrace = { goal: 'goal', spans: [{ name: 'plan' }] }
      const result = await runner.run(ev, { actual: trace, golden: singleGolden })
      expect(result.status).toBe('pass')
    })
  })

  describe('failing cases', () => {
    it('fails when a span is missing from the actual trace', async () => {
      const trace = makeActualTrace(['plan', 'search'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.status).toBe('fail')
      expect(result.details?.['missingSpans']).toContain('summarise')
    })

    it('fails when the actual trace has an extra span not in the golden', async () => {
      const trace = makeActualTrace(['plan', 'search', 'summarise', 'extra-step'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.status).toBe('fail')
      expect(result.details?.['extraSpans']).toContain('extra-step')
    })

    it('fails when span names differ', async () => {
      const trace = makeActualTrace(['plan', 'lookup', 'summarise'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.status).toBe('fail')
      expect(result.details?.['missingSpans']).toContain('search')
      expect(result.details?.['extraSpans']).toContain('lookup')
    })

    it('fails when the actual trace is empty but golden has spans', async () => {
      const trace = makeActualTrace([])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.status).toBe('fail')
      expect(result.score).toBe(0)
    })
  })

  describe('score', () => {
    it('score is 1.0 on exact match', async () => {
      const trace = makeActualTrace(['plan', 'search', 'summarise'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.score).toBe(1.0)
    })

    it('score reflects proportion of matching span names', async () => {
      // 2 of 3 golden spans present
      const trace = makeActualTrace(['plan', 'search'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.score).toBeCloseTo(2 / 3, 5)
    })

    it('score is 0 when no golden spans are present in actual', async () => {
      const trace = makeActualTrace(['completely', 'different', 'steps'])
      const result = await runner.run(ev, { actual: trace, golden })
      expect(result.score).toBe(0)
    })
  })

  describe('with fixture-loaded golden trace', () => {
    it('accepts a GoldenTrace object constructed from a plain JSON fixture', async () => {
      // Simulate loading from JSON (as if read from tests/fixtures/golden/)
      const fromJson: GoldenTrace = JSON.parse(JSON.stringify(golden))
      const trace = makeActualTrace(['plan', 'search', 'summarise'])
      const result = await runner.run(ev, { actual: trace, golden: fromJson })
      expect(result.status).toBe('pass')
    })
  })
})
