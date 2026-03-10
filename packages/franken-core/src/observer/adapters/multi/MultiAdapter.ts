import type { Trace } from '../../core/types.js'
import type { ExportAdapter } from '../../export/ExportAdapter.js'

export interface MultiAdapterOptions {
  /** Adapters to fan-out to. Order matters for queryByTraceId (first-wins). */
  adapters: ExportAdapter[]
  /**
   * When true (default), `flush()` throws an AggregateError if any adapter
   * rejects. All adapters are still called regardless (allSettled semantics).
   * Set to false for best-effort delivery where a failing adapter is silently
   * ignored.
   */
  throwOnError?: boolean
}

/**
 * Broadcasts every `flush()` call to multiple adapters in parallel.
 * Useful when you want to write to several backends simultaneously, e.g.
 * SQLite for local querying, Langfuse for cloud visibility, and Prometheus
 * for metrics — all from a single `flush()` call.
 *
 * ```ts
 * const adapter = new MultiAdapter({
 *   adapters: [sqliteAdapter, langfuseAdapter, prometheusAdapter],
 * })
 * await adapter.flush(trace) // all three receive the trace concurrently
 * ```
 *
 * `queryByTraceId` returns the first non-null result (adapters tried in order).
 * `listTraceIds` returns the deduplicated union of all adapters' IDs.
 */
export class MultiAdapter implements ExportAdapter {
  private readonly adapters: ExportAdapter[]
  private readonly throwOnError: boolean

  constructor(options: MultiAdapterOptions) {
    this.adapters = options.adapters
    this.throwOnError = options.throwOnError ?? true
  }

  async flush(trace: Trace): Promise<void> {
    const results = await Promise.allSettled(this.adapters.map(a => a.flush(trace)))

    if (this.throwOnError) {
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed.length > 0) {
        const errors = failed.map(f => f.reason as Error)
        throw new AggregateError(
          errors,
          `MultiAdapter: ${failed.length} adapter(s) failed: ${errors.map(e => e?.message ?? String(e)).join('; ')}`,
        )
      }
    }
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    for (const adapter of this.adapters) {
      const result = await adapter.queryByTraceId(traceId)
      if (result !== null) return result
    }
    return null
  }

  async listTraceIds(): Promise<string[]> {
    const sets = await Promise.all(this.adapters.map(a => a.listTraceIds()))
    return [...new Set(sets.flat())]
  }
}
