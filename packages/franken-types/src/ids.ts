/**
 * Branded ID types for type-safe identifiers across modules.
 * All IDs are strings at runtime but distinct at compile-time.
 */

export type ProjectId = string & { readonly __brand: 'ProjectId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type RequestId = string & { readonly __brand: 'RequestId' };
export type SpanId = string & { readonly __brand: 'SpanId' };
export type TraceId = string & { readonly __brand: 'TraceId' };

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function createSessionId(id: string): SessionId {
  return id as SessionId;
}

export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

export function createRequestId(id: string): RequestId {
  return id as RequestId;
}

export function createSpanId(id: string): SpanId {
  return id as SpanId;
}

export function createTraceId(id: string): TraceId {
  return id as TraceId;
}
