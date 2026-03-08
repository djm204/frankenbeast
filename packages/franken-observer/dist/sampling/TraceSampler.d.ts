import type { Trace } from '../core/types.js';
import type { ExportAdapter } from '../export/ExportAdapter.js';
/**
 * Decides whether a given trace should be sampled (kept) or dropped.
 * Implement this interface to provide custom sampling logic.
 */
export interface SamplerStrategy {
    shouldSample(traceId: string): boolean;
}
/** Keeps every trace. Default behaviour — no traces are dropped. */
export declare class AlwaysOnSampler implements SamplerStrategy {
    shouldSample(_traceId: string): boolean;
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
export declare class ProbabilisticSampler implements SamplerStrategy {
    private readonly probability;
    private readonly random;
    constructor(probability: number, random?: () => number);
    shouldSample(_traceId: string): boolean;
}
export interface RateLimitedSamplerOptions {
    /** Maximum number of traces to sample per window. */
    maxPerWindow: number;
    /** Window duration in milliseconds. Default: 1000. */
    windowMs: number;
    /** Injectable clock for deterministic testing. Defaults to Date.now. */
    now?: () => number;
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
export declare class RateLimitedSampler implements SamplerStrategy {
    private readonly maxPerWindow;
    private readonly windowMs;
    private readonly now;
    private count;
    private windowStart;
    constructor(options: RateLimitedSamplerOptions);
    shouldSample(_traceId: string): boolean;
}
export interface SamplingAdapterOptions {
    /** Sampling strategy that decides whether each trace is kept or dropped. */
    strategy: SamplerStrategy;
    /** Underlying adapter that receives traces that pass the sampling check. */
    adapter: ExportAdapter;
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
export declare class SamplingAdapter implements ExportAdapter {
    private readonly strategy;
    private readonly inner;
    constructor(options: SamplingAdapterOptions);
    flush(trace: Trace): Promise<void>;
    queryByTraceId(traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=TraceSampler.d.ts.map