import type { Trace, Span } from '../core/types.js'
import type { ExportAdapter, TraceSummary } from '../export/ExportAdapter.js'

export type TranscriptRetentionMode = 'disabled' | 'redacted' | 'raw'
export type TranscriptRedactionLevel = 'mask' | 'drop' | 'none'
export type TranscriptAccessLevel = 'local' | 'operator' | 'restricted'
export type TranscriptField = 'prompts' | 'toolInputs' | 'toolOutputs' | 'errors' | 'summaries'

export interface TranscriptRetainedFields {
  readonly prompts: boolean
  readonly toolInputs: boolean
  readonly toolOutputs: boolean
  readonly errors: boolean
  readonly summaries: boolean
}

export interface TranscriptRetentionPolicy {
  /** Disabled drops transcript traces entirely; redacted is the safe default; raw requires an explicit operator choice. */
  readonly mode?: TranscriptRetentionMode
  /** How long flushed transcript traces can be read back. Defaults to 24 hours. */
  readonly ttlMs?: number
  /** Redaction applied when mode is redacted. Defaults to masking sensitive transcript fields. */
  readonly redactionLevel?: TranscriptRedactionLevel
  /** Minimum audience expected to access retained transcripts. Defaults to restricted. */
  readonly accessLevel?: TranscriptAccessLevel
  /** Per-field controls for prompts, tool I/O, errors, and summaries. */
  readonly retainedFields?: Partial<TranscriptRetainedFields>
  /** Clock override for deterministic tests. */
  readonly now?: () => number
}

export interface ResolvedTranscriptRetentionPolicy {
  readonly mode: TranscriptRetentionMode
  readonly ttlMs: number
  readonly redactionLevel: TranscriptRedactionLevel
  readonly accessLevel: TranscriptAccessLevel
  readonly retainedFields: TranscriptRetainedFields
}

export interface TranscriptRetentionPolicyReport extends ResolvedTranscriptRetentionPolicy {
  readonly storesRawTranscriptContent: boolean
  readonly expiresAt?: number
}

export interface TranscriptRetentionAdapterOptions extends TranscriptRetentionPolicy {
  readonly adapter: ExportAdapter
}

interface DeletableAdapter extends ExportAdapter {
  deleteTrace(traceId: string): Promise<void> | void
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const MASK = '[REDACTED_TRANSCRIPT]'
const DROPPED = '[TRANSCRIPT_NOT_RETAINED]'

const DEFAULT_FIELDS: TranscriptRetainedFields = Object.freeze({
  prompts: true,
  toolInputs: true,
  toolOutputs: true,
  errors: true,
  summaries: true,
})

const PROMPT_KEYS = new Set(['prompt', 'prompts', 'systemprompt', 'userprompt', 'developerprompt', 'instructions'])
const TOOL_INPUT_KEYS = new Set(['toolinput', 'toolinputs', 'input', 'inputs', 'arguments', 'args', 'parameters', 'params'])
const TOOL_OUTPUT_KEYS = new Set(['tooloutput', 'tooloutputs', 'output', 'outputs', 'result', 'results', 'response', 'responses', 'stdout', 'stderr'])
const ERROR_KEYS = new Set(['error', 'errors', 'exception', 'exceptions', 'stack', 'stacktrace', 'errormessage', 'stderr'])
const SUMMARY_KEYS = new Set(['summary', 'summaries'])

export class TranscriptRetentionAdapter implements ExportAdapter {
  private readonly inner: ExportAdapter
  private readonly policy: ResolvedTranscriptRetentionPolicy
  private readonly now: () => number
  private readonly retained = new Map<string, number>()
  private readonly expiredTraceIds = new Set<string>()

  constructor(options: TranscriptRetentionAdapterOptions) {
    this.inner = options.adapter
    this.policy = resolveTranscriptRetentionPolicy(options)
    this.now = options.now ?? Date.now
  }

  async flush(trace: Trace): Promise<void> {
    if (this.policy.mode === 'disabled') return
    if (this.isExpired(trace)) return

    const retainedTrace = applyRetentionPolicy(trace, this.policy)
    this.retained.set(retainedTrace.id, getTraceExpiry(retainedTrace, this.policy.ttlMs))
    this.expiredTraceIds.delete(retainedTrace.id)
    await this.inner.flush(retainedTrace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    if (this.expiredTraceIds.has(traceId)) return null
    if (await this.expireStoredTraceIfNeeded(traceId)) return null

    const trace = await this.inner.queryByTraceId(traceId)
    if (!trace) return null
    if (this.isExpired(trace)) {
      await this.markExpired(traceId)
      return null
    }
    return trace
  }

  async listTraceIds(): Promise<string[]> {
    await this.cleanupExpired()
    const ids = await this.inner.listTraceIds()
    const result: string[] = []
    for (const id of ids) {
      const trace = await this.queryByTraceId(id)
      if (trace) result.push(id)
    }
    return result
  }

  async listTraceSummaries(): Promise<TraceSummary[]> {
    await this.cleanupExpired()
    const summaries = this.inner.listTraceSummaries
      ? await this.inner.listTraceSummaries()
      : await this.fallbackTraceSummaries()

    const result: TraceSummary[] = []
    for (const summary of summaries) {
      if (this.expiredTraceIds.has(summary.id)) continue
      if (summary.startedAt + this.policy.ttlMs <= this.now()) {
        const trace = await this.queryByTraceId(summary.id)
        if (!trace) continue
      }
      if (!(await this.expireStoredTraceIfNeeded(summary.id))) result.push(summary)
    }
    return result
  }

  describePolicy(): TranscriptRetentionPolicyReport {
    return describeTranscriptRetentionPolicy(this.policy)
  }

  async cleanupExpired(): Promise<string[]> {
    const expired: string[] = []
    const now = this.now()
    for (const [traceId, expiresAt] of this.retained.entries()) {
      if (expiresAt > now) continue
      expired.push(traceId)
      await this.markExpired(traceId)
    }
    return expired
  }

  private async fallbackTraceSummaries(): Promise<TraceSummary[]> {
    const ids = await this.inner.listTraceIds()
    const summaries: TraceSummary[] = []
    for (const id of ids) {
      const trace = await this.queryByTraceId(id)
      if (!trace) continue
      summaries.push({
        id: trace.id,
        goal: trace.goal,
        status: trace.status,
        spanCount: trace.spans.length,
        startedAt: trace.startedAt,
      })
    }
    return summaries
  }

  private isExpired(trace: Trace): boolean {
    return getTraceExpiry(trace, this.policy.ttlMs) <= this.now()
  }

  private async expireStoredTraceIfNeeded(traceId: string): Promise<boolean> {
    const expiresAt = this.retained.get(traceId)
    if (expiresAt === undefined || expiresAt > this.now()) return false
    await this.markExpired(traceId)
    return true
  }

  private async markExpired(traceId: string): Promise<void> {
    this.retained.delete(traceId)
    if (hasDeleteTrace(this.inner)) {
      await this.inner.deleteTrace(traceId)
      this.expiredTraceIds.delete(traceId)
    } else {
      this.expiredTraceIds.add(traceId)
    }
  }
}

export function resolveTranscriptRetentionPolicy(
  policy: TranscriptRetentionPolicy = {},
): ResolvedTranscriptRetentionPolicy {
  const ttlMs = policy.ttlMs ?? DEFAULT_TTL_MS
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new RangeError('Transcript retention ttlMs must be a non-negative finite number')
  }

  return Object.freeze({
    mode: policy.mode ?? 'redacted',
    ttlMs,
    redactionLevel: policy.redactionLevel ?? (policy.mode === 'raw' ? 'none' : 'mask'),
    accessLevel: policy.accessLevel ?? 'restricted',
    retainedFields: Object.freeze({ ...DEFAULT_FIELDS, ...policy.retainedFields }),
  })
}

export function describeTranscriptRetentionPolicy(
  policy: TranscriptRetentionPolicy = {},
): TranscriptRetentionPolicyReport {
  const resolved = resolveTranscriptRetentionPolicy(policy)
  return Object.freeze({
    ...resolved,
    storesRawTranscriptContent: resolved.mode === 'raw' || resolved.redactionLevel === 'none',
    ...(resolved.ttlMs > 0 ? { expiresAt: Date.now() + resolved.ttlMs } : {}),
  })
}

export function applyRetentionPolicy(trace: Trace, policy: TranscriptRetentionPolicy = {}): Trace {
  const resolved = resolveTranscriptRetentionPolicy(policy)
  if (resolved.mode === 'disabled') {
    return { ...trace, goal: DROPPED, spans: [] }
  }

  return {
    ...trace,
    goal: retainTraceGoal(trace.goal, resolved),
    spans: trace.spans.map(span => retainSpan(span, resolved)),
  }
}

function retainTraceGoal(goal: string, policy: ResolvedTranscriptRetentionPolicy): string {
  if (!policy.retainedFields.prompts) return DROPPED
  return redactString(goal, policy) ?? MASK
}

function retainSpan(span: Span, policy: ResolvedTranscriptRetentionPolicy): Span {
  const retained: Span = {
    ...span,
    metadata: retainMetadata(span.metadata, policy),
    thoughtBlocks: policy.retainedFields.prompts
      ? span.thoughtBlocks.map(block => redactString(block, policy) ?? MASK)
      : [],
  }

  if (policy.retainedFields.errors) {
    const errorMessage = redactString(span.errorMessage, policy)
    if (errorMessage !== undefined) retained.errorMessage = errorMessage
  } else {
    delete retained.errorMessage
  }

  return retained
}

function retainMetadata(
  metadata: Record<string, unknown>,
  policy: ResolvedTranscriptRetentionPolicy,
): Record<string, unknown> {
  const retained: Record<string, unknown> = {}
  const seen = new WeakMap<object, unknown>()
  seen.set(metadata, retained)
  for (const [key, value] of Object.entries(metadata)) {
    const field = classifyTranscriptField(key)
    if (field && !policy.retainedFields[field]) continue
    retained[key] = field ? redactValue(value, policy) : redactNestedTranscriptValues(value, policy, seen)
  }
  return retained
}

function redactNestedTranscriptValues(
  value: unknown,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const retained: unknown[] = []
    seen.set(value, retained)
    for (const item of value) retained.push(redactNestedTranscriptValues(item, policy, seen))
    return retained
  }
  if (value instanceof Date) return new Date(value.getTime())
  if (!isPlainRecord(value)) return cloneValue(value)

  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  for (const [key, nestedValue] of Object.entries(value)) {
    const field = classifyTranscriptField(key)
    if (field && !policy.retainedFields[field]) continue
    retained[key] = field ? redactValue(nestedValue, policy) : redactNestedTranscriptValues(nestedValue, policy, seen)
  }
  return retained
}

function classifyTranscriptField(key: string): TranscriptField | undefined {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (PROMPT_KEYS.has(normalized)) return 'prompts'
  if (TOOL_INPUT_KEYS.has(normalized)) return 'toolInputs'
  if (TOOL_OUTPUT_KEYS.has(normalized)) return 'toolOutputs'
  if (ERROR_KEYS.has(normalized)) return 'errors'
  if (SUMMARY_KEYS.has(normalized)) return 'summaries'
  return undefined
}

function redactValue(value: unknown, policy: ResolvedTranscriptRetentionPolicy): unknown {
  if (policy.mode === 'raw' || policy.redactionLevel === 'none') return cloneValue(value)
  if (policy.redactionLevel === 'drop') return DROPPED
  return MASK
}

function redactString(value: string | undefined, policy: ResolvedTranscriptRetentionPolicy): string | undefined {
  if (value === undefined) return undefined
  return redactValue(value, policy) as string
}

function getTraceExpiry(trace: Trace, ttlMs: number): number {
  const anchor = trace.endedAt ?? trace.startedAt
  return anchor + ttlMs
}

function hasDeleteTrace(adapter: ExportAdapter): adapter is DeletableAdapter {
  return typeof (adapter as Partial<DeletableAdapter>).deleteTrace === 'function'
}

function cloneValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const cloned: unknown[] = []
    seen.set(value, cloned)
    for (const item of value) cloned.push(cloneValue(item, seen))
    return cloned
  }
  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof Map) {
    const cloned = new Map<unknown, unknown>()
    seen.set(value, cloned)
    for (const [key, nested] of value.entries()) cloned.set(cloneValue(key, seen), cloneValue(nested, seen))
    return cloned
  }
  if (value instanceof Set) {
    const cloned = new Set<unknown>()
    seen.set(value, cloned)
    for (const nested of value.values()) cloned.add(cloneValue(nested, seen))
    return cloned
  }
  if (!isPlainRecord(value)) return value

  const cloned: Record<string, unknown> = {}
  seen.set(value, cloned)
  for (const [key, nested] of Object.entries(value)) cloned[key] = cloneValue(nested, seen)
  return cloned
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
