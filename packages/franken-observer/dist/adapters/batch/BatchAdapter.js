/**
 * Buffers `flush()` calls and forwards them to the underlying adapter in bulk,
 * reducing HTTP round-trips on high-throughput deployments.
 *
 * Drain triggers:
 *  1. **Size trigger** — buffer reaches `maxBatchSize` (default 10)
 *  2. **Time trigger** — periodic `flushIntervalMs` timer fires (if configured)
 *  3. **Manual** — explicit `drain()` call
 *  4. **Shutdown** — `stop()` drains and cancels any timer
 *
 * `queryByTraceId` and `listTraceIds` see both the in-flight buffer and the
 * already-persisted inner adapter, so no trace is temporarily invisible.
 *
 * ```ts
 * const adapter = new BatchAdapter({
 *   adapter: langfuseAdapter,
 *   maxBatchSize: 20,
 *   flushIntervalMs: 10_000, // also drain every 10 s
 * })
 * // later, at shutdown:
 * await adapter.stop()
 * ```
 */
export class BatchAdapter {
    inner;
    maxBatchSize;
    buffer = [];
    timer = null;
    clearIntervalFn;
    constructor(options) {
        this.inner = options.adapter;
        this.maxBatchSize = options.maxBatchSize ?? 10;
        this.clearIntervalFn = options.clearInterval ?? clearInterval;
        if (options.flushIntervalMs && options.flushIntervalMs > 0) {
            const si = options.setInterval ?? setInterval;
            this.timer = si(() => { void this.drain(); }, options.flushIntervalMs);
        }
    }
    /** Add a trace to the buffer. Drains immediately if `maxBatchSize` is reached. */
    async flush(trace) {
        this.buffer.push(trace);
        if (this.buffer.length >= this.maxBatchSize) {
            await this.drain();
        }
    }
    /**
     * Forwards all buffered traces to the inner adapter in parallel and clears
     * the buffer. Safe to call on an empty buffer (no-op).
     */
    async drain() {
        if (this.buffer.length === 0)
            return;
        const batch = this.buffer.splice(0, this.buffer.length);
        await Promise.all(batch.map(t => this.inner.flush(t)));
    }
    /**
     * Cancels the periodic timer (if any) and drains any remaining buffered
     * traces. Call this during graceful shutdown to avoid losing buffered data.
     */
    async stop() {
        if (this.timer !== null) {
            this.clearIntervalFn(this.timer);
            this.timer = null;
        }
        await this.drain();
    }
    async queryByTraceId(traceId) {
        const buffered = this.buffer.find(t => t.id === traceId);
        if (buffered !== undefined)
            return buffered;
        return this.inner.queryByTraceId(traceId);
    }
    async listTraceIds() {
        const bufferedIds = this.buffer.map(t => t.id);
        const innerIds = await this.inner.listTraceIds();
        return [...new Set([...bufferedIds, ...innerIds])];
    }
}
//# sourceMappingURL=BatchAdapter.js.map