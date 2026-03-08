import { describe, it, expect } from 'vitest'
import { TraceContext } from '../core/TraceContext.js'
import { SpanLifecycle } from '../core/SpanLifecycle.js'
import { OTELSerializer } from './OTELSerializer.js'

describe('OTELSerializer', () => {
  describe('serializeTrace()', () => {
    it('returns a ResourceSpans-shaped object', () => {
      const trace = TraceContext.createTrace('test goal')
      const span = TraceContext.startSpan(trace, { name: 'step-1' })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      expect(result).toHaveProperty('resourceSpans')
      expect(Array.isArray(result.resourceSpans)).toBe(true)
    })

    it('maps each Span to an OTEL span with correct traceId and spanId', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'fetch' })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const otelSpans = result.resourceSpans[0]!.scopeSpans[0]!.spans
      expect(otelSpans).toHaveLength(1)
      expect(otelSpans[0]!.traceId).toBe(trace.id)
      expect(otelSpans[0]!.spanId).toBe(span.id)
      expect(otelSpans[0]!.name).toBe('fetch')
    })

    it('sets parentSpanId on child spans', () => {
      const trace = TraceContext.createTrace('goal')
      const parent = TraceContext.startSpan(trace, { name: 'parent' })
      const child = TraceContext.startSpan(trace, { name: 'child', parentSpanId: parent.id })
      TraceContext.endSpan(child)
      TraceContext.endSpan(parent)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const otelSpans = result.resourceSpans[0]!.scopeSpans[0]!.spans
      const otelChild = otelSpans.find(s => s.name === 'child')!
      expect(otelChild.parentSpanId).toBe(parent.id)
    })

    it('converts startedAt/endedAt to nanosecond OTEL timestamps', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const otelSpan = result.resourceSpans[0]!.scopeSpans[0]!.spans[0]!
      // OTEL uses nanoseconds (ms * 1_000_000)
      expect(otelSpan.startTimeUnixNano).toBe(span.startedAt * 1_000_000)
      expect(otelSpan.endTimeUnixNano).toBe(span.endedAt! * 1_000_000)
    })

    it('serialises metadata as OTEL attributes key-value array', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'llm' })
      SpanLifecycle.recordTokenUsage(span, { promptTokens: 100, completionTokens: 50 })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const attrs = result.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.attributes
      const promptAttr = attrs.find(a => a.key === 'promptTokens')
      expect(promptAttr?.value).toEqual({ intValue: 100 })
    })

    it('serialises thought blocks as a joined string attribute', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'think' })
      SpanLifecycle.addThoughtBlock(span, 'first thought')
      SpanLifecycle.addThoughtBlock(span, 'second thought')
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const attrs = result.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.attributes
      const thoughtAttr = attrs.find(a => a.key === 'thoughtBlocks')
      expect(thoughtAttr?.value).toEqual({ stringValue: 'first thought\nsecond thought' })
    })

    it('sets status code OK for completed spans, ERROR for errored spans', () => {
      const trace = TraceContext.createTrace('goal')
      const ok = TraceContext.startSpan(trace, { name: 'ok-step' })
      TraceContext.endSpan(ok)
      const bad = TraceContext.startSpan(trace, { name: 'bad-step' })
      TraceContext.endSpan(bad, { status: 'error', errorMessage: 'boom' })
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const spans = result.resourceSpans[0]!.scopeSpans[0]!.spans
      const okSpan = spans.find(s => s.name === 'ok-step')!
      const badSpan = spans.find(s => s.name === 'bad-step')!
      expect(okSpan.status.code).toBe('OK')
      expect(badSpan.status.code).toBe('ERROR')
      expect(badSpan.status.message).toBe('boom')
    })

    it('round-trips: deserialised traceId matches original trace id', () => {
      const trace = TraceContext.createTrace('round-trip')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      const result = OTELSerializer.serializeTrace(trace)
      const json = JSON.parse(JSON.stringify(result))
      expect(json.resourceSpans[0].scopeSpans[0].spans[0].traceId).toBe(trace.id)
    })
  })
})
