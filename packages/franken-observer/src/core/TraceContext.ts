import type {
  Trace,
  Span,
  StartSpanOptions,
  EndSpanOptions,
  TraceValidationOptions,
  TraceValidationResult,
} from './types.js'
import { deterministicUuid, now as deterministicNow } from '@franken/types';
import type { LoopDetector } from '../incident/LoopDetector.js'

export const TraceContext = {
  createTrace(goal: string): Trace {
    return {
      id: deterministicUuid('packages/franken-observer/src/core/TraceContext.ts'),
      goal,
      status: 'active',
      startedAt: deterministicNow(),
      spans: [],
    }
  },

  startSpan(trace: Trace, options: StartSpanOptions): Span {
    if (trace.status !== 'active') {
      throw new Error(`Cannot start span on a ${trace.status} trace (id: ${trace.id})`)
    }
    const span: Span = {
      id: deterministicUuid('packages/franken-observer/src/core/TraceContext.ts'),
      traceId: trace.id,
      parentSpanId: options.parentSpanId,
      name: options.name,
      status: 'active',
      startedAt: deterministicNow(),
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
    span.endedAt = deterministicNow()
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
    trace.endedAt = deterministicNow()
    trace.status = 'completed'
  },

  validateTrace(trace: Trace, options: TraceValidationOptions = {}): TraceValidationResult {
    const now = options.now ?? deterministicNow()
    const issues = trace.spans
      .filter(span => span.status === 'active')
      .map(span => {
        const ageMs = Math.max(0, now - span.startedAt)
        const timedOut =
          options.activeSpanTimeoutMs !== undefined &&
          ageMs >= options.activeSpanTimeoutMs
        const autoClosed = Boolean(options.autoCloseTimedOutSpans && timedOut)

        if (autoClosed) {
          span.endedAt = now
          span.durationMs = ageMs
          span.status = 'error'
          span.errorMessage = `Span was auto-closed after ${ageMs}ms without explicit end`
        }

        return {
          type: 'active-span' as const,
          spanId: span.id,
          spanName: span.name,
          ageMs,
          message: autoClosed
            ? `Span "${span.name}" (${span.id}) was auto-closed after ${ageMs}ms without explicit end`
            : `Span "${span.name}" (${span.id}) is still active after ${ageMs}ms`,
          ...(autoClosed ? { autoClosed: true as const } : {}),
        }
      })

    return {
      ok: issues.length === 0,
      issues,
    }
  },
}
