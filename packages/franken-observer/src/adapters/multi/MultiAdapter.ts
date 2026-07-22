import type { Trace } from '../../core/types.js'
import type { ExportAdapter } from '../../export/ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from '../../export/ExportAdapter.js'

export interface MultiAdapterOptions {
  /** Adapters to fan-out to. Order matters for queryByTraceId (first-wins). */
  adapters: ExportAdapter[]
  /**
   * Maximum number of concurrent adapter calls made by `listTraceIds()`.
   * Default: `4`.
   */
  listTraceIdsConcurrency?: number
  /**
   * When true (default), `flush()` throws an AggregateError if any adapter
   * rejects. All adapters are still called regardless (allSettled semantics).
   * Set to false for best-effort delivery where a failing adapter is silently
   * ignored.
   */
  throwOnError?: boolean
}

const DEFAULT_LIST_TRACE_IDS_CONCURRENCY = 4

function validatePositiveSafeInteger(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${optionName} must be a positive safe integer`)
  }
  return value
}

async function allSettledWithConcurrency<Item, Result>(
  items: readonly Item[],
  concurrency: number,
  operation: (item: Item) => Promise<Result>,
): Promise<PromiseSettledResult<Result>[]> {
  const results = new Array<PromiseSettledResult<Result>>(items.length)
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      try {
        results[index] = { status: 'fulfilled', value: await operation(items[index]!) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
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
  private readonly listTraceIdsConcurrency: number

  constructor(options: MultiAdapterOptions) {
    this.adapters = options.adapters
    this.throwOnError = options.throwOnError ?? true
    this.listTraceIdsConcurrency = validatePositiveSafeInteger(
      options.listTraceIdsConcurrency ?? DEFAULT_LIST_TRACE_IDS_CONCURRENCY,
      'listTraceIdsConcurrency',
    )
  }

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'MultiAdapter')
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
    const errors: unknown[] = []

    for (const adapter of this.adapters) {
      try {
        const result = await adapter.queryByTraceId(traceId)
        if (result !== null) return result
      } catch (error) {
        errors.push(error)
      }
    }

    if (this.throwOnError && errors.length > 0) {
      throw this.createReadAggregateError('queryByTraceId', errors)
    }

    return null
  }

  async listTraceIds(): Promise<string[]> {
    const results = await allSettledWithConcurrency(
      this.adapters,
      this.listTraceIdsConcurrency,
      adapter => adapter.listTraceIds(),
    )
    const sets = results.filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled').map(r => r.value)
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

    const traceIds = sets.flat()

    if (this.throwOnError && traceIds.length === 0 && failed.length > 0) {
      throw this.createReadAggregateError(
        'listTraceIds',
        failed.map(f => f.reason),
      )
    }

    return [...new Set(traceIds)]
  }

  private createReadAggregateError(operation: string, errors: unknown[]): AggregateError {
    return new AggregateError(
      errors,
      `MultiAdapter: ${errors.length} adapter(s) failed during ${operation}: ${errors
        .map(e => (e instanceof Error ? e.message : String(e)))
        .join('; ')}`,
    )
  }
}
