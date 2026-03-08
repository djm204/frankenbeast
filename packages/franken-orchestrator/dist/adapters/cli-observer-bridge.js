import { TokenCounter, CostCalculator, CircuitBreaker, LoopDetector, DEFAULT_PRICING, TraceContext, SpanLifecycle, } from '@frankenbeast/observer';
export class CliObserverBridge {
    counter;
    costCalc;
    breaker;
    loopDet;
    trace;
    constructor(config) {
        this.counter = new TokenCounter();
        this.costCalc = new CostCalculator(DEFAULT_PRICING);
        this.breaker = new CircuitBreaker({ limitUsd: config.budgetLimitUsd });
        this.loopDet = new LoopDetector();
    }
    startTrace(sessionId) {
        this.trace = TraceContext.createTrace(sessionId);
    }
    startSpan(name) {
        const trace = this.requireTrace();
        const span = TraceContext.startSpan(trace, { name });
        return {
            end: (metadata) => {
                if (metadata) {
                    SpanLifecycle.setMetadata(span, metadata);
                }
                TraceContext.endSpan(span);
            },
        };
    }
    async getTokenSpend(_sessionId) {
        const totals = this.counter.grandTotal();
        const entries = this.counter.allModels().map((m) => {
            const t = this.counter.totalsFor(m);
            return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
        });
        const estimatedCostUsd = this.costCalc.totalCost(entries);
        return {
            inputTokens: totals.promptTokens,
            outputTokens: totals.completionTokens,
            totalTokens: totals.totalTokens,
            estimatedCostUsd,
        };
    }
    get observerDeps() {
        const trace = this.requireTrace();
        return {
            trace,
            counter: this.counter,
            costCalc: this.costCalc,
            breaker: this.breaker,
            loopDetector: this.loopDet,
            startSpan: (t, opts) => TraceContext.startSpan(t, opts),
            endSpan: (span, opts, loopDetector) => TraceContext.endSpan(span, opts, loopDetector),
            recordTokenUsage: (span, usage, counter) => SpanLifecycle.recordTokenUsage(span, usage, counter),
            setMetadata: (span, data) => SpanLifecycle.setMetadata(span, data),
        };
    }
    requireTrace() {
        if (!this.trace) {
            throw new Error('No active trace. Call startTrace() first.');
        }
        return this.trace;
    }
}
//# sourceMappingURL=cli-observer-bridge.js.map