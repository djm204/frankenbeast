import { randomUUID } from 'node:crypto';
export const TraceContext = {
    createTrace(goal) {
        return {
            id: randomUUID(),
            goal,
            status: 'active',
            startedAt: Date.now(),
            spans: [],
        };
    },
    startSpan(trace, options) {
        if (trace.status !== 'active') {
            throw new Error(`Cannot start span on a ${trace.status} trace (id: ${trace.id})`);
        }
        const span = {
            id: randomUUID(),
            traceId: trace.id,
            parentSpanId: options.parentSpanId,
            name: options.name,
            status: 'active',
            startedAt: Date.now(),
            metadata: {},
            thoughtBlocks: [],
        };
        trace.spans.push(span);
        return span;
    },
    endSpan(span, options = {}, loopDetector) {
        if (span.status !== 'active') {
            throw new Error(`Cannot end span that is already ${span.status} (id: ${span.id})`);
        }
        span.endedAt = Date.now();
        span.durationMs = span.endedAt - span.startedAt;
        span.status = options.status ?? 'completed';
        if (options.errorMessage !== undefined) {
            span.errorMessage = options.errorMessage;
        }
        loopDetector?.check(span.name);
    },
    endTrace(trace) {
        if (trace.status !== 'active') {
            throw new Error(`Cannot end trace that is already ${trace.status} (id: ${trace.id})`);
        }
        trace.endedAt = Date.now();
        trace.status = 'completed';
    },
};
//# sourceMappingURL=TraceContext.js.map