import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
export interface TraceContextPort<Trace = TracePort, Span = SpanPort> {
    createTrace(goal: string): Trace;
    startSpan(trace: Trace, options: {
        name: string;
        parentSpanId?: string;
    }): Span;
    endSpan(span: Span, options?: {
        status?: 'completed' | 'error';
        errorMessage?: string;
    }): void;
}
export interface CostCalculatorPort {
    calculate(entry: {
        model: string;
        promptTokens: number;
        completionTokens: number;
    }): number;
}
export interface TracePort {
    id: string;
    goal: string;
    status: 'active' | 'completed' | 'error';
    startedAt: number;
    endedAt?: number;
    spans: SpanPort[];
}
export interface SpanPort {
    id: string;
    traceId: string;
    name: string;
    status: 'active' | 'completed' | 'error';
    startedAt: number;
    endedAt?: number;
    metadata: Record<string, unknown>;
}
export interface ObserverPortAdapterDeps {
    traceContext: TraceContextPort;
    costCalculator: CostCalculatorPort;
}
export declare class ObserverPortAdapter implements IObserverModule {
    private readonly traceContext;
    private readonly costCalculator;
    private readonly traces;
    private currentSessionId;
    constructor(deps: ObserverPortAdapterDeps);
    startTrace(sessionId: string): void;
    startSpan(name: string): SpanHandle;
    getTokenSpend(sessionId: string): Promise<TokenSpendData>;
}
//# sourceMappingURL=observer-adapter.d.ts.map