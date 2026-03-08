/**
 * Zero-dependency in-process adapter. Useful in tests and as a
 * fallback when no persistent backend is configured.
 */
export class InMemoryAdapter {
    store = new Map();
    async flush(trace) {
        this.store.set(trace.id, trace);
    }
    async queryByTraceId(traceId) {
        return this.store.get(traceId) ?? null;
    }
    async listTraceIds() {
        return Array.from(this.store.keys());
    }
}
//# sourceMappingURL=InMemoryAdapter.js.map