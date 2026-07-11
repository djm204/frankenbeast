import type { Trace } from '../core/types.js'
import type { ExportAdapter } from './ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from './ExportAdapter.js'

/**
 * Zero-dependency in-process adapter. Useful in tests and as a
 * fallback when no persistent backend is configured.
 */
export class InMemoryAdapter implements ExportAdapter {
  private readonly store = new Map<string, Trace>()

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'InMemoryAdapter')
    this.store.set(trace.id, cloneTrace(trace))
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    const trace = this.store.get(traceId)
    return trace ? cloneTrace(trace) : null
  }

  async listTraceIds(): Promise<string[]> {
    return Array.from(this.store.keys())
  }
}

function cloneTrace(trace: Trace): Trace {
  return {
    id: trace.id,
    goal: trace.goal,
    status: trace.status,
    startedAt: trace.startedAt,
    ...(trace.endedAt !== undefined ? { endedAt: trace.endedAt } : {}),
    spans: trace.spans.map(span => ({
      id: span.id,
      traceId: span.traceId,
      ...(span.parentSpanId !== undefined ? { parentSpanId: span.parentSpanId } : {}),
      name: span.name,
      status: span.status,
      startedAt: span.startedAt,
      ...(span.endedAt !== undefined ? { endedAt: span.endedAt } : {}),
      ...(span.durationMs !== undefined ? { durationMs: span.durationMs } : {}),
      ...(span.errorMessage !== undefined ? { errorMessage: span.errorMessage } : {}),
      metadata: cloneMetadata(span.metadata),
      thoughtBlocks: [...span.thoughtBlocks],
    })),
  }
}

function cloneMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return cloneMetadataValue(metadata) as Record<string, unknown>
}

function cloneMetadataValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value)
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  try {
    return structuredClone(value)
  } catch {
    // Fall back to a JSON-like enumerable clone for metadata containing values
    // unsupported by the structured clone algorithm, such as functions/symbols.
  }

  if (seen.has(value)) {
    return seen.get(value)
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = []
    seen.set(value, cloned)
    cloned.push(...value.map(item => cloneMetadataValue(item, seen)))
    return cloned
  }

  const cloned: Record<string, unknown> = {}
  seen.set(value, cloned)
  for (const [key, nestedValue] of Object.entries(value)) {
    cloned[key] = cloneMetadataValue(nestedValue, seen)
  }
  return cloned
}
