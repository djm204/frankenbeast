const DEFAULT_SESSION_ID = '__default__';
export class ObserverPortAdapter {
    traceContext;
    costCalculator;
    traces = new Map();
    currentSessionId;
    constructor(deps) {
        this.traceContext = deps.traceContext;
        this.costCalculator = deps.costCalculator;
    }
    startTrace(sessionId) {
        try {
            const trace = this.traceContext.createTrace(sessionId);
            this.traces.set(sessionId, trace);
            this.currentSessionId = sessionId;
        }
        catch (error) {
            throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
        }
    }
    startSpan(name) {
        let trace = this.currentSessionId ? this.traces.get(this.currentSessionId) : undefined;
        if (!trace) {
            const fallbackId = this.currentSessionId ?? DEFAULT_SESSION_ID;
            try {
                trace = this.traceContext.createTrace(fallbackId);
            }
            catch (error) {
                throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
            }
            this.traces.set(fallbackId, trace);
            this.currentSessionId = fallbackId;
        }
        let span;
        try {
            span = this.traceContext.startSpan(trace, { name });
        }
        catch (error) {
            throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
        }
        return {
            end: (metadata) => {
                const { endOptions, rest } = splitEndOptions(metadata);
                Object.assign(span.metadata, rest);
                try {
                    this.traceContext.endSpan(span, endOptions);
                }
                catch (error) {
                    throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
                }
            },
        };
    }
    async getTokenSpend(sessionId) {
        const trace = this.traces.get(sessionId);
        if (!trace) {
            return { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
        }
        let inputTokens = 0;
        let outputTokens = 0;
        let estimatedCostUsd = 0;
        for (const span of trace.spans) {
            const promptTokens = numberFromMetadata(span.metadata.promptTokens);
            const completionTokens = numberFromMetadata(span.metadata.completionTokens);
            inputTokens += promptTokens;
            outputTokens += completionTokens;
            const model = span.metadata.model;
            if (typeof model === 'string' && (promptTokens > 0 || completionTokens > 0)) {
                estimatedCostUsd += this.costCalculator.calculate({
                    model,
                    promptTokens,
                    completionTokens,
                });
            }
        }
        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            estimatedCostUsd,
        };
    }
}
function numberFromMetadata(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function splitEndOptions(metadata) {
    if (!metadata) {
        return { endOptions: undefined, rest: {} };
    }
    const { status, errorMessage, ...rest } = metadata;
    const endOptions = {};
    if (status === 'completed' || status === 'error') {
        endOptions.status = status;
    }
    if (typeof errorMessage === 'string') {
        endOptions.errorMessage = errorMessage;
    }
    return { endOptions: Object.keys(endOptions).length > 0 ? endOptions : undefined, rest };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=observer-adapter.js.map