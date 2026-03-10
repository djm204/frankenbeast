import { randomUUID } from 'node:crypto'
import type { Trace, Span, StartSpanOptions, EndSpanOptions } from './types.js'
import type { LoopDetector } from '../incident/LoopDetector.js'

export const TraceContext = {
  createTrace(goal: string): Trace {
    return {
      id: randomUUID(),
      goal,
      status: 'active',
      startedAt: Date.now(),
      spans: [],
    }
  },

  startSpan(trace: Trace, options: StartSpanOptions): Span {
    if (trace.status !== 'active') {
      throw new Error(`Cannot start span on a ${trace.status} trace (id: ${trace.id})`)
    }
    const span: Span = {
      id: randomUUID(),
      traceId: trace.id,
      parentSpanId: options.parentSpanId,
      name: options.name,
      status: 'active',
      startedAt: Date.now(),
      metadata: {},
      thoughtBlocks: [],
    }
    trace.spans.push(span)
    return span
  },

  endSpan(span: Span, options: EndSpanOptions = {}, loopDetector?: LoopDetector): void {
    if (span.status !== 'active') {
      throw new Error(`Cannot end span that is already ${span.status} (id: ${span.id})`)
    }
    span.endedAt = Date.now()
    span.durationMs = span.endedAt - span.startedAt
    span.status = options.status ?? 'completed'
    if (options.errorMessage !== undefined) {
      span.errorMessage = options.errorMessage
    }
    loopDetector?.check(span.name)
  },

  endTrace(trace: Trace): void {
    if (trace.status !== 'active') {
      throw new Error(`Cannot end trace that is already ${trace.status} (id: ${trace.id})`)
    }
    trace.endedAt = Date.now()
    trace.status = 'completed'
  },
}
