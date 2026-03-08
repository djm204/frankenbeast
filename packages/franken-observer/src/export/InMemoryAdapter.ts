import type { Trace } from '../core/types.js'
import type { ExportAdapter } from './ExportAdapter.js'

/**
 * Zero-dependency in-process adapter. Useful in tests and as a
 * fallback when no persistent backend is configured.
 */
export class InMemoryAdapter implements ExportAdapter {
  private readonly store = new Map<string, Trace>()

  async flush(trace: Trace): Promise<void> {
    this.store.set(trace.id, trace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.store.get(traceId) ?? null
  }

  async listTraceIds(): Promise<string[]> {
    return Array.from(this.store.keys())
  }
}
