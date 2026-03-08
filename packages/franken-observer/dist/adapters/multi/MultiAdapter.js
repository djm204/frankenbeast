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
export class MultiAdapter {
    adapters;
    throwOnError;
    constructor(options) {
        this.adapters = options.adapters;
        this.throwOnError = options.throwOnError ?? true;
    }
    async flush(trace) {
        const results = await Promise.allSettled(this.adapters.map(a => a.flush(trace)));
        if (this.throwOnError) {
            const failed = results.filter((r) => r.status === 'rejected');
            if (failed.length > 0) {
                const errors = failed.map(f => f.reason);
                throw new AggregateError(errors, `MultiAdapter: ${failed.length} adapter(s) failed: ${errors.map(e => e?.message ?? String(e)).join('; ')}`);
            }
        }
    }
    async queryByTraceId(traceId) {
        for (const adapter of this.adapters) {
            const result = await adapter.queryByTraceId(traceId);
            if (result !== null)
                return result;
        }
        return null;
    }
    async listTraceIds() {
        const sets = await Promise.all(this.adapters.map(a => a.listTraceIds()));
        return [...new Set(sets.flat())];
    }
}
//# sourceMappingURL=MultiAdapter.js.map