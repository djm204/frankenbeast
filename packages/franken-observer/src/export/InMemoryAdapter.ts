import type { Trace } from '../core/types.js'
import type { ExportAdapter } from './ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from './ExportAdapter.js'

/**
 * Zero-dependency in-process adapter. Useful in tests and as a
 * fallback when no persistent backend is configured.
 */
export class InMemoryAdapter implements ExportAdapter {
  private readonly store = new Map<string, Trace>()

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'InMemoryAdapter')
    this.store.set(trace.id, cloneTrace(trace))
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    const trace = this.store.get(traceId)
    return trace ? cloneTrace(trace) : null
  }

  async listTraceIds(): Promise<string[]> {
    return Array.from(this.store.keys())
  }
}

function cloneTrace(trace: Trace): Trace {
  return structuredClone(trace)
}
