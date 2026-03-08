import type { Trace } from '../core/types.js'

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
}
