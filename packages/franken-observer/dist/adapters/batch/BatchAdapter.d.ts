import type { Trace } from '../../core/types.js';
import type { ExportAdapter } from '../../export/ExportAdapter.js';
export interface BatchAdapterOptions {
    /** Underlying adapter that receives traces when the batch is drained. */
    adapter: ExportAdapter;
    /**
     * Maximum number of traces to buffer before triggering an automatic drain.
     * Default: `10`.
     */
    maxBatchSize?: number;
    /**
     * If set to a positive number, a periodic timer drains the buffer every
     * `flushIntervalMs` milliseconds regardless of batch size. Useful as a
     * safety net so traces are never held for more than one interval period.
     * Default: no timer.
     */
    flushIntervalMs?: number;
    /** Injectable for testing. Defaults to `globalThis.setInterval`. */
    setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
    /** Injectable for testing. Defaults to `globalThis.clearInterval`. */
    clearInterval?: (id: ReturnType<typeof setInterval>) => void;
}
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
export declare class BatchAdapter implements ExportAdapter {
    private readonly inner;
    private readonly maxBatchSize;
    private readonly buffer;
    private timer;
    private readonly clearIntervalFn;
    constructor(options: BatchAdapterOptions);
    /** Add a trace to the buffer. Drains immediately if `maxBatchSize` is reached. */
    flush(trace: Trace): Promise<void>;
    /**
     * Forwards all buffered traces to the inner adapter in parallel and clears
     * the buffer. Safe to call on an empty buffer (no-op).
     */
    drain(): Promise<void>;
    /**
     * Cancels the periodic timer (if any) and drains any remaining buffered
     * traces. Call this during graceful shutdown to avoid losing buffered data.
     */
    stop(): Promise<void>;
    queryByTraceId(traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=BatchAdapter.d.ts.map