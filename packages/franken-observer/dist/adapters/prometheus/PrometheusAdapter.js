/**
 * Write-only ExportAdapter that accumulates token, span, and (optionally)
 * cost counters from flushed traces and exposes them in Prometheus text
 * format via scrape(). Intended to be consumed by a /metrics HTTP handler
 * or a push-gateway client.
 *
 * queryByTraceId / listTraceIds return null / [] — Prometheus is a push-only
 * sink from this SDK's perspective.
 */
export class PrometheusAdapter {
    pricingTable;
    tokenCounters = new Map();
    spanCounters = new Map();
    costCounters = new Map();
    constructor(options = {}) {
        this.pricingTable = options.pricingTable;
    }
    async flush(trace) {
        for (const span of trace.spans) {
            // Span status counter
            this.spanCounters.set(span.status, (this.spanCounters.get(span.status) ?? 0) + 1);
            // Token counters — only counted when both a model label and at least
            // one token field are present in span metadata
            const model = span.metadata['model'];
            const promptTokens = span.metadata['promptTokens'];
            const completionTokens = span.metadata['completionTokens'];
            if (typeof model === 'string' &&
                (typeof promptTokens === 'number' || typeof completionTokens === 'number')) {
                const prompt = typeof promptTokens === 'number' ? promptTokens : 0;
                const completion = typeof completionTokens === 'number' ? completionTokens : 0;
                const existing = this.tokenCounters.get(model) ?? { prompt: 0, completion: 0 };
                this.tokenCounters.set(model, {
                    prompt: existing.prompt + prompt,
                    completion: existing.completion + completion,
                });
                // Cost counter — only when pricing table covers this model
                if (this.pricingTable?.[model]) {
                    const pricing = this.pricingTable[model];
                    const cost = (prompt / 1_000_000) * pricing.promptPerMillion +
                        (completion / 1_000_000) * pricing.completionPerMillion;
                    this.costCounters.set(model, (this.costCounters.get(model) ?? 0) + cost);
                }
            }
        }
    }
    /**
     * Returns Prometheus text format (https://prometheus.io/docs/instrumenting/exposition_formats/).
     * Returns an empty string if no data has been flushed since construction or last reset().
     */
    scrape() {
        const lines = [];
        if (this.tokenCounters.size > 0) {
            lines.push('# HELP franken_observer_tokens_total Total tokens processed by model and type');
            lines.push('# TYPE franken_observer_tokens_total counter');
            for (const [model, counts] of this.tokenCounters) {
                lines.push(`franken_observer_tokens_total{model="${model}",type="prompt"} ${counts.prompt}`);
                lines.push(`franken_observer_tokens_total{model="${model}",type="completion"} ${counts.completion}`);
            }
        }
        if (this.spanCounters.size > 0) {
            lines.push('# HELP franken_observer_spans_total Total spans recorded by status');
            lines.push('# TYPE franken_observer_spans_total counter');
            for (const [status, count] of this.spanCounters) {
                lines.push(`franken_observer_spans_total{status="${status}"} ${count}`);
            }
        }
        if (this.costCounters.size > 0) {
            lines.push('# HELP franken_observer_cost_usd_total Total cost in USD by model');
            lines.push('# TYPE franken_observer_cost_usd_total counter');
            for (const [model, cost] of this.costCounters) {
                lines.push(`franken_observer_cost_usd_total{model="${model}"} ${cost}`);
            }
        }
        return lines.join('\n');
    }
    /** Clears all accumulated counters. Useful for testing and metric resets. */
    reset() {
        this.tokenCounters.clear();
        this.spanCounters.clear();
        this.costCounters.clear();
    }
    async queryByTraceId(_traceId) {
        return null;
    }
    async listTraceIds() {
        return [];
    }
}
//# sourceMappingURL=PrometheusAdapter.js.map