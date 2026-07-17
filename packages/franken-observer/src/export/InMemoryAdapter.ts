import type { Trace } from '../core/types.js'
import type { ExportAdapter } from './ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from './ExportAdapter.js'

/**
 * Zero-dependency in-process adapter. Useful in tests and as a
 * fallback when no persistent backend is configured.
 *
 * Retains at most `maxTraces` completed traces, evicting the oldest retained
 * trace id when the bound is exceeded. Pass `maxTraces: Infinity` for legacy
 * unbounded test fixtures.
 */
export interface InMemoryAdapterOptions {
  /** Maximum retained traces. Defaults to 1000; use Infinity for no bound. */
  maxTraces?: number
}

export class InMemoryAdapter implements ExportAdapter {
  private readonly maxTraces: number
  private readonly store = new Map<string, Trace>()

  constructor(options: InMemoryAdapterOptions = {}) {
    const maxTraces = options.maxTraces ?? 1000
    if (!Number.isInteger(maxTraces) && maxTraces !== Infinity) {
      throw new RangeError('InMemoryAdapter maxTraces must be a non-negative integer or Infinity')
    }
    if (maxTraces < 0) {
      throw new RangeError('InMemoryAdapter maxTraces must be a non-negative integer or Infinity')
    }
    this.maxTraces = maxTraces
  }

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'InMemoryAdapter')
    const clonedTrace = cloneTrace(trace)
    this.store.delete(trace.id)
    this.store.set(trace.id, clonedTrace)
    this.evictOverflow()
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    const trace = this.store.get(traceId)
    return trace ? cloneTrace(trace) : null
  }

  async listTraceIds(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  async deleteTrace(traceId: string): Promise<void> {
    this.store.delete(traceId)
  }

  clear(): void {
    this.store.clear()
  }

  private evictOverflow(): void {
    if (this.maxTraces === Infinity) return

    while (this.store.size > this.maxTraces) {
      const oldestTraceId = this.store.keys().next().value
      if (oldestTraceId === undefined) return
      this.store.delete(oldestTraceId)
    }
  }
}

function cloneTrace(trace: Trace): Trace {
  return {
    id: trace.id,
    goal: redactSensitiveText(trace.goal),
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
      ...(span.errorMessage !== undefined ? { errorMessage: redactSensitiveText(span.errorMessage) } : {}),
      metadata: cloneMetadata(span.metadata),
      thoughtBlocks: span.thoughtBlocks.map(redactSensitiveText),
    })),
  }
}

const REDACTED = '<redacted>'
const REDACTION_MARKERS = new Set(['[REDACTED]', '<redacted>', '***'])
const SENSITIVE_METADATA_KEY_RE = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|AUTHORIZATION|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLAUDE[_-]?SESSION)(?:$|[_-])/iu
const SENSITIVE_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  /\b(?:sk|gho|ghp|glpat|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/gu,
  /\bnpm_[A-Za-z0-9_\-]{12,}\b/gu,
  /https:\/\/(?:discord(?:app)?\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/giu,
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/giu,
  /\b(?:Bearer|token)\s+[A-Za-z0-9._~+/=-]{20,}\b/giu,
  /\b(?:Cookie|Set-Cookie):\s*[^\r\n]+/giu,
]

function redactSensitiveText(text: string): string {
  let redacted = text
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED)
  }
  return redacted
}

function cloneMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return cloneMetadataValue(metadata) as Record<string, unknown>
}

function cloneMetadataValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value)
  }

  if (typeof value === 'string') {
    return redactSensitiveText(value)
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return seen.get(value)
  }

  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (value instanceof RegExp) {
    const cloned = new RegExp(value.source, value.flags)
    cloned.lastIndex = value.lastIndex
    return cloned
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0)
  }

  if (ArrayBuffer.isView(value)) {
    return cloneArrayBufferView(value)
  }

  if (value instanceof Map) {
    const cloned = new Map<unknown, unknown>()
    seen.set(value, cloned)
    for (const [key, nestedValue] of value.entries()) {
      cloned.set(cloneMetadataValue(key, seen), cloneMetadataValue(nestedValue, seen))
    }
    return cloned
  }

  if (value instanceof Set) {
    const cloned = new Set<unknown>()
    seen.set(value, cloned)
    for (const nestedValue of value.values()) {
      cloned.add(cloneMetadataValue(nestedValue, seen))
    }
    return cloned
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = []
    seen.set(value, cloned)
    cloned.push(...value.map(item => cloneMetadataValue(item, seen)))
    return cloned
  }

  if (value instanceof Error) {
    const cloned: Record<string, unknown> = {
      name: value.name,
      message: redactSensitiveText(value.message),
    }
    seen.set(value, cloned)
    if (value.stack !== undefined) cloned['stack'] = redactSensitiveText(value.stack)
    if ('cause' in value) cloned['cause'] = cloneMetadataValue(value.cause, seen)
    if (value instanceof AggregateError) {
      cloned['errors'] = cloneMetadataValue(value.errors, seen)
    }
    for (const [key, nestedValue] of Object.entries(value)) {
      defineMetadataProperty(cloned, key, redactMetadataEntry(key, nestedValue, seen))
    }
    return cloned
  }

  const cloned: Record<string, unknown> = {}
  seen.set(value, cloned)
  for (const [key, nestedValue] of Object.entries(value)) {
    defineMetadataProperty(cloned, key, redactMetadataEntry(key, nestedValue, seen))
  }
  return cloned
}

function redactMetadataEntry(key: string, value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (!SENSITIVE_METADATA_KEY_RE.test(key)) {
    return cloneMetadataValue(value, seen)
  }
  if (typeof value === 'string' && REDACTION_MARKERS.has(value)) {
    return value
  }
  return REDACTED
}

function cloneArrayBufferView(value: ArrayBufferView): ArrayBufferView {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return Buffer.from(value)
  }

  const sourceBytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  const clonedBuffer = sourceBytes.slice().buffer as ArrayBuffer
  if (value instanceof DataView) {
    return new DataView(clonedBuffer)
  }

  const constructor = value.constructor as new (buffer: ArrayBuffer) => ArrayBufferView
  return new constructor(clonedBuffer)
}

function defineMetadataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}
