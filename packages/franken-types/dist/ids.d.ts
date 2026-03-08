/**
 * Branded ID types for type-safe identifiers across modules.
 * All IDs are strings at runtime but distinct at compile-time.
 */
export type ProjectId = string & {
    readonly __brand: 'ProjectId';
};
export type SessionId = string & {
    readonly __brand: 'SessionId';
};
export type TaskId = string & {
    readonly __brand: 'TaskId';
};
export type RequestId = string & {
    readonly __brand: 'RequestId';
};
export type SpanId = string & {
    readonly __brand: 'SpanId';
};
export type TraceId = string & {
    readonly __brand: 'TraceId';
};
export declare function createProjectId(id: string): ProjectId;
export declare function createSessionId(id: string): SessionId;
export declare function createTaskId(id: string): TaskId;
export declare function createRequestId(id: string): RequestId;
export declare function createSpanId(id: string): SpanId;
export declare function createTraceId(id: string): TraceId;
//# sourceMappingURL=ids.d.ts.map