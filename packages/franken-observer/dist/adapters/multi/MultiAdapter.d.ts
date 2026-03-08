import type { Trace } from '../../core/types.js';
import type { ExportAdapter } from '../../export/ExportAdapter.js';
export interface MultiAdapterOptions {
    /** Adapters to fan-out to. Order matters for queryByTraceId (first-wins). */
    adapters: ExportAdapter[];
    /**
     * When true (default), `flush()` throws an AggregateError if any adapter
     * rejects. All adapters are still called regardless (allSettled semantics).
     * Set to false for best-effort delivery where a failing adapter is silently
     * ignored.
     */
    throwOnError?: boolean;
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
export declare class MultiAdapter implements ExportAdapter {
    private readonly adapters;
    private readonly throwOnError;
    constructor(options: MultiAdapterOptions);
    flush(trace: Trace): Promise<void>;
    queryByTraceId(traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=MultiAdapter.d.ts.map