import type { ExportAdapter } from '../../export/ExportAdapter.js';
import type { Trace } from '../../core/types.js';
import type { PricingTable } from '../../cost/defaultPricing.js';
export interface PrometheusAdapterOptions {
    /** Optional pricing table for cost metrics. If absent, cost lines are omitted. */
    pricingTable?: PricingTable;
}
/**
 * Write-only ExportAdapter that accumulates token, span, and (optionally)
 * cost counters from flushed traces and exposes them in Prometheus text
 * format via scrape(). Intended to be consumed by a /metrics HTTP handler
 * or a push-gateway client.
 *
 * queryByTraceId / listTraceIds return null / [] — Prometheus is a push-only
 * sink from this SDK's perspective.
 */
export declare class PrometheusAdapter implements ExportAdapter {
    private readonly pricingTable;
    private tokenCounters;
    private spanCounters;
    private costCounters;
    constructor(options?: PrometheusAdapterOptions);
    flush(trace: Trace): Promise<void>;
    /**
     * Returns Prometheus text format (https://prometheus.io/docs/instrumenting/exposition_formats/).
     * Returns an empty string if no data has been flushed since construction or last reset().
     */
    scrape(): string;
    /** Clears all accumulated counters. Useful for testing and metric resets. */
    reset(): void;
    queryByTraceId(_traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=PrometheusAdapter.d.ts.map