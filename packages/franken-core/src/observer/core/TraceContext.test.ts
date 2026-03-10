import { describe, it, expect, beforeEach } from 'vitest'
import { TraceContext } from './TraceContext.js'

describe('TraceContext', () => {
  describe('createTrace()', () => {
    it('returns a root trace with a unique id', () => {
      const a = TraceContext.createTrace('goal A')
      const b = TraceContext.createTrace('goal B')
      expect(a.id).toBeTruthy()
      expect(b.id).toBeTruthy()
      expect(a.id).not.toBe(b.id)
    })

    it('sets goal, startedAt, and status=active on creation', () => {
      const before = Date.now()
      const trace = TraceContext.createTrace('plan the sprint')
      const after = Date.now()
      expect(trace.goal).toBe('plan the sprint')
      expect(trace.startedAt).toBeGreaterThanOrEqual(before)
      expect(trace.startedAt).toBeLessThanOrEqual(after)
      expect(trace.status).toBe('active')
      expect(trace.endedAt).toBeUndefined()
    })

    it('initialises with an empty spans array', () => {
      const trace = TraceContext.createTrace('empty')
      expect(trace.spans).toEqual([])
    })
  })

  describe('startSpan()', () => {
    it('adds a span to the trace and returns it', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'fetch-data' })
      expect(trace.spans).toHaveLength(1)
      expect(span.name).toBe('fetch-data')
    })

    it('span has unique id, startedAt, and status=active', () => {
      const trace = TraceContext.createTrace('goal')
      const before = Date.now()
      const span = TraceContext.startSpan(trace, { name: 'step' })
      const after = Date.now()
      expect(span.id).toBeTruthy()
      expect(span.startedAt).toBeGreaterThanOrEqual(before)
      expect(span.startedAt).toBeLessThanOrEqual(after)
      expect(span.status).toBe('active')
      expect(span.endedAt).toBeUndefined()
    })

    it('span without parentSpanId is a direct child of root trace', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      expect(span.traceId).toBe(trace.id)
      expect(span.parentSpanId).toBeUndefined()
    })

    it('span with parentSpanId links to parent span', () => {
      const trace = TraceContext.createTrace('goal')
      const parent = TraceContext.startSpan(trace, { name: 'parent' })
      const child = TraceContext.startSpan(trace, { name: 'child', parentSpanId: parent.id })
      expect(child.parentSpanId).toBe(parent.id)
    })

    it('throws if trace is not active', () => {
      const trace = TraceContext.createTrace('goal')
      TraceContext.endTrace(trace)
      expect(() => TraceContext.startSpan(trace, { name: 'late' })).toThrow()
    })
  })

  describe('endSpan()', () => {
    it('sets endedAt and status=completed on the span', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      const before = Date.now()
      TraceContext.endSpan(span)
      const after = Date.now()
      expect(span.status).toBe('completed')
      expect(span.endedAt).toBeGreaterThanOrEqual(before)
      expect(span.endedAt).toBeLessThanOrEqual(after)
    })

    it('calculates durationMs', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      expect(span.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('can mark a span as errored', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span, { status: 'error', errorMessage: 'timed out' })
      expect(span.status).toBe('error')
      expect(span.errorMessage).toBe('timed out')
    })

    it('throws if span is already ended', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      expect(() => TraceContext.endSpan(span)).toThrow()
    })
  })

  describe('endTrace()', () => {
    it('sets endedAt and status=completed on the trace', () => {
      const trace = TraceContext.createTrace('goal')
      const before = Date.now()
      TraceContext.endTrace(trace)
      const after = Date.now()
      expect(trace.status).toBe('completed')
      expect(trace.endedAt).toBeGreaterThanOrEqual(before)
      expect(trace.endedAt).toBeLessThanOrEqual(after)
    })

    it('throws if trace is already ended', () => {
      const trace = TraceContext.createTrace('goal')
      TraceContext.endTrace(trace)
      expect(() => TraceContext.endTrace(trace)).toThrow()
    })
  })
})
