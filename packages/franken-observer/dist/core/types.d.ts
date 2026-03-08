export type SpanStatus = 'active' | 'completed' | 'error';
export type TraceStatus = 'active' | 'completed' | 'error';
export interface Span {
    id: string;
    traceId: string;
    parentSpanId?: string;
    name: string;
    status: SpanStatus;
    startedAt: number;
    endedAt?: number;
    durationMs?: number;
    errorMessage?: string;
    metadata: Record<string, unknown>;
    thoughtBlocks: string[];
}
export interface Trace {
    id: string;
    goal: string;
    status: TraceStatus;
    startedAt: number;
    endedAt?: number;
    spans: Span[];
}
export interface StartSpanOptions {
    name: string;
    parentSpanId?: string;
}
export interface EndSpanOptions {
    status?: 'completed' | 'error';
    errorMessage?: string;
}
//# sourceMappingURL=types.d.ts.map