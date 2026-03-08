// ── Built-in strategies ───────────────────────────────────────────────────────
/** Keeps every trace. Default behaviour — no traces are dropped. */
export class AlwaysOnSampler {
    shouldSample(_traceId) {
        return true;
    }
}
/**
 * Keeps a random fraction of traces.
 *
 * ```ts
 * // Keep 10% of traces
 * const sampler = new ProbabilisticSampler(0.1)
 * ```
 *
 * @param probability - Value in [0, 1]. 0 = drop all; 1 = keep all.
 * @param random      - Injectable RNG for deterministic testing. Defaults to Math.random.
 */
export class ProbabilisticSampler {
    probability;
    random;
    constructor(probability, random = Math.random) {
        if (probability < 0 || probability > 1) {
            throw new RangeError(`probability must be between 0 and 1, got ${probability}`);
        }
        this.probability = probability;
        this.random = random;
    }
    shouldSample(_traceId) {
        return this.random() < this.probability;
    }
}
/**
 * Keeps at most `maxPerWindow` traces per time window. Useful for
 * capping observability overhead in high-throughput agents.
 *
 * ```ts
 * // Keep at most 100 traces per second
 * const sampler = new RateLimitedSampler({ maxPerWindow: 100, windowMs: 1000 })
 * ```
 */
export class RateLimitedSampler {
    maxPerWindow;
    windowMs;
    now;
    count = 0;
    windowStart;
    constructor(options) {
        this.maxPerWindow = options.maxPerWindow;
        this.windowMs = options.windowMs;
        this.now = options.now ?? Date.now;
        this.windowStart = this.now();
    }
    shouldSample(_traceId) {
        const now = this.now();
        if (now - this.windowStart >= this.windowMs) {
            this.count = 0;
            this.windowStart = now;
        }
        if (this.count < this.maxPerWindow) {
            this.count++;
            return true;
        }
        return false;
    }
}
/**
 * Wraps an `ExportAdapter` and gates `flush()` calls behind a sampling strategy.
 * Traces that are dropped are silently discarded — no error is thrown.
 *
 * Read operations (`queryByTraceId`, `listTraceIds`) are always delegated to the
 * underlying adapter unchanged.
 *
 * ```ts
 * const adapter = new SamplingAdapter({
 *   strategy: new ProbabilisticSampler(0.1), // keep 10%
 *   adapter: new SQLiteAdapter({ path: 'traces.db' }),
 * })
 * await adapter.flush(trace) // ~90% of calls are silently dropped
 * ```
 */
export class SamplingAdapter {
    strategy;
    inner;
    constructor(options) {
        this.strategy = options.strategy;
        this.inner = options.adapter;
    }
    async flush(trace) {
        if (this.strategy.shouldSample(trace.id)) {
            await this.inner.flush(trace);
        }
    }
    async queryByTraceId(traceId) {
        return this.inner.queryByTraceId(traceId);
    }
    async listTraceIds() {
        return this.inner.listTraceIds();
    }
}
//# sourceMappingURL=TraceSampler.js.map