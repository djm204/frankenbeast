import type { Trace } from '../core/types.js'
import { TraceContext } from '../core/TraceContext.js'

export interface TraceSummary {
  id: string
  goal: string
  status: Trace['status']
  spanCount: number
  startedAt: number
}

export function warnIfTraceHasActiveSpans(trace: Trace, destination = 'export'): void {
  const validation = TraceContext.validateTrace(trace)
  if (validation.ok) return

  const activeSpans = validation.issues.map(issue => `${issue.spanName} (${issue.spanId})`).join(', ')
  process.emitWarning(
    `[franken-observer] Exporting trace ${trace.id} to ${destination} with ` +
      `${validation.issues.length} active span(s): ${activeSpans}`,
  )
}

/**
 * Pluggable export backend. All adapters implement this interface.
 * The SDK is safe to import without any adapter being constructed.
 */
export interface ExportAdapter {
  /** Persist a completed trace. Implementations should upsert. */
  flush(trace: Trace): Promise<void>
  /** Retrieve a trace by id. Returns null if not found. */
  queryByTraceId(traceId: string): Promise<Trace | null>
  /** List all stored trace ids. */
  listTraceIds(): Promise<string[]>
  /**
   * List lightweight trace summaries without hydrating child span payloads.
   * Adapters that do not support this can omit it; callers should fall back to
   * listTraceIds() + queryByTraceId().
   */
  listTraceSummaries?(): Promise<TraceSummary[]>
}
