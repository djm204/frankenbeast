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

type AdapterWrapperShape = Partial<{
  inner: ExportAdapter
  adapter: ExportAdapter
  adapters: ExportAdapter[]
  buffer: Trace[]
}>

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

const PROMPT_KEYS = new Set(['prompt', 'prompts', 'systemprompt', 'userprompt', 'developerprompt', 'instructions', 'goal', 'goals', 'transcript', 'transcripts'])
const TOOL_INPUT_KEYS = new Set(['toolinput', 'toolinputs', 'input', 'inputs', 'arguments', 'args', 'parameters', 'params', 'stdin'])
const TOOL_OUTPUT_KEYS = new Set(['tooloutput', 'tooloutputs', 'output', 'outputs', 'result', 'results', 'response', 'responses', 'stdout', 'stderr'])
const ERROR_KEYS = new Set(['error', 'errors', 'exception', 'exceptions', 'stack', 'stacktrace', 'errormessage', 'stderr'])
const SUMMARY_KEYS = new Set(['summary', 'summaries'])
const NON_TRANSCRIPT_TOKEN_KEYS = new Set(['prompttokens', 'completiontokens', 'totaltokens'])
const CHAT_TRANSCRIPT_KEYS = new Set(['message', 'messages', 'content', 'contents'])

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
    this.retained.set(retainedTrace.id, getTraceExpiry(retainedTrace, this.policy.ttlMs, this.now()))
    this.expiredTraceIds.delete(retainedTrace.id)
    await this.inner.flush(retainedTrace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    if (this.policy.mode === 'disabled') return null
    if (this.expiredTraceIds.has(traceId)) return null
    if (await this.expireStoredTraceIfNeeded(traceId)) return null

    const trace = await this.inner.queryByTraceId(traceId)
    if (!trace) return null
    if (this.isExpired(trace)) {
      await this.markExpired(traceId)
      return null
    }
    return applyRetentionPolicy(trace, this.policy)
  }

  async listTraceIds(): Promise<string[]> {
    if (this.policy.mode === 'disabled') return []
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
    if (this.policy.mode === 'disabled') return []
    await this.cleanupExpired()
    const summaries = this.inner.listTraceSummaries
      ? await this.inner.listTraceSummaries()
      : await this.fallbackTraceSummaries()

    const result: TraceSummary[] = []
    for (const summary of summaries) {
      if (this.expiredTraceIds.has(summary.id)) continue
      if (await this.expireStoredTraceIfNeeded(summary.id)) continue
      const trace = await this.queryByTraceId(summary.id)
      if (!trace) continue
      result.push({
        id: trace.id,
        goal: trace.goal,
        status: trace.status,
        spanCount: trace.spans.length,
        startedAt: trace.startedAt,
      })
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

    for (const traceId of await this.inner.listTraceIds()) {
      if (this.expiredTraceIds.has(traceId)) continue
      const trace = await this.inner.queryByTraceId(traceId)
      if (!trace || !this.isExpired(trace)) continue
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
    return getTraceExpiry(trace, this.policy.ttlMs, this.now()) <= this.now()
  }

  private async expireStoredTraceIfNeeded(traceId: string): Promise<boolean> {
    const expiresAt = this.retained.get(traceId)
    if (expiresAt === undefined || expiresAt > this.now()) return false
    await this.markExpired(traceId)
    return true
  }

  private async markExpired(traceId: string): Promise<void> {
    this.retained.delete(traceId)
    this.expiredTraceIds.add(traceId)
    try {
      await deleteTraceFromAdapter(this.inner, traceId)
    } catch (error) {
      console.warn(`[TranscriptRetentionAdapter] Failed to delete expired trace ${traceId}; keeping it hidden`, error)
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
    setRecordValue(retained, key, field ? redactFieldValue(value, field, policy, seen) : redactNestedTranscriptValues(value, policy, seen))
  }
  return retained
}

function redactNestedTranscriptValues(
  value: unknown,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): unknown {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) return policy.retainedFields.errors ? redactValue(value, policy) : DROPPED
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const retained: unknown[] = []
    seen.set(value, retained)
    for (const item of value) retained.push(redactNestedTranscriptValues(item, policy, seen))
    return retained
  }
  if (value instanceof Map) {
    const retained = new Map<unknown, unknown>()
    seen.set(value, retained)
    for (const [key, nestedValue] of value.entries()) {
      const field = typeof key === 'string' ? classifyTranscriptField(key) : undefined
      if (field && !policy.retainedFields[field]) continue
      retained.set(cloneValue(key), field ? redactFieldValue(nestedValue, field, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen))
    }
    return retained
  }
  if (value instanceof Set) {
    const retained = new Set<unknown>()
    seen.set(value, retained)
    for (const nestedValue of value.values()) retained.add(redactNestedTranscriptValues(nestedValue, policy, seen))
    return retained
  }
  if (value instanceof Date) return new Date(value.getTime())
  if (!isPlainRecord(value)) {
    return shouldRedactEnumerableObject(value)
      ? redactEnumerableObject(value, policy, seen)
      : cloneValue(value)
  }

  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  for (const [key, nestedValue] of Object.entries(value)) {
    const field = classifyTranscriptField(key)
    if (field && !policy.retainedFields[field]) continue
    setRecordValue(retained, key, field ? redactFieldValue(nestedValue, field, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen))
  }
  return retained
}

function classifyTranscriptField(key: string): TranscriptField | undefined {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (NON_TRANSCRIPT_TOKEN_KEYS.has(normalized)) return undefined
  if (CHAT_TRANSCRIPT_KEYS.has(normalized)) return 'prompts'
  if (PROMPT_KEYS.has(normalized) || normalized.includes('prompt') || normalized.endsWith('goal') || normalized.endsWith('goals')) return 'prompts'
  if (
    TOOL_INPUT_KEYS.has(normalized) ||
    normalized === 'query' ||
    normalized.includes('toolinput') ||
    normalized.includes('toolarg') ||
    normalized.includes('toolparam')
  ) return 'toolInputs'
  if (
    TOOL_OUTPUT_KEYS.has(normalized) ||
    normalized.includes('tooloutput') ||
    normalized.includes('toolresult') ||
    normalized.includes('toolresponse') ||
    normalized.endsWith('stdout') ||
    normalized.endsWith('stderr')
  ) return 'toolOutputs'
  if (
    ERROR_KEYS.has(normalized) ||
    normalized.includes('error') ||
    normalized.includes('exception') ||
    normalized.includes('stacktrace')
  ) return 'errors'
  if (SUMMARY_KEYS.has(normalized) || normalized.includes('summary')) return 'summaries'
  return undefined
}

function redactValue(value: unknown, policy: ResolvedTranscriptRetentionPolicy): unknown {
  if (policy.mode === 'raw' || policy.redactionLevel === 'none') return cloneValue(value)
  if (policy.redactionLevel === 'drop') return DROPPED
  return MASK
}

function redactFieldValue(
  value: unknown,
  field: TranscriptField,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): unknown {
  if (field === 'prompts' && Array.isArray(value) && (policy.mode === 'raw' || policy.redactionLevel === 'none')) {
    const retained: unknown[] = []
    seen.set(value, retained)
    for (const item of value) retained.push(redactProviderMessageValue(item, policy, seen))
    return retained
  }
  return redactValue(value, policy)
}

function redactProviderMessageValue(
  value: unknown,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): unknown {
  if (!isPlainRecordValue(value)) return redactNestedTranscriptValues(value, policy, seen)
  if (seen.has(value)) return seen.get(value)

  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  const messageType = typeof value['type'] === 'string' ? value['type'].replace(/[_-]/g, '').toLowerCase() : ''
  for (const [key, nestedValue] of Object.entries(value)) {
    const contextualField = messageType === 'toolresult' && key === 'content' ? 'toolOutputs' : classifyTranscriptField(key)
    if (contextualField && !policy.retainedFields[contextualField]) continue
    setRecordValue(
      retained,
      key,
      contextualField ? redactFieldValue(nestedValue, contextualField, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen),
    )
  }
  return retained
}

function redactEnumerableObject(
  value: object,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): Record<string, unknown> {
  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  for (const [key, nestedValue] of Object.entries(value)) {
    const field = classifyTranscriptField(key)
    if (field && !policy.retainedFields[field]) continue
    setRecordValue(retained, key, field ? redactFieldValue(nestedValue, field, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen))
  }
  return retained
}

function setRecordValue(record: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

function shouldRedactEnumerableObject(value: object): boolean {
  return Object.keys(value).length > 0 &&
    !(value instanceof RegExp) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof Map) &&
    !(value instanceof Set) &&
    !(value instanceof Promise) &&
    !(value instanceof WeakMap) &&
    !(value instanceof WeakSet)
}

function redactString(value: string | undefined, policy: ResolvedTranscriptRetentionPolicy): string | undefined {
  if (value === undefined) return undefined
  return redactValue(value, policy) as string
}

function getTraceExpiry(trace: Trace, ttlMs: number, retainedAt?: number): number {
  const anchor = trace.endedAt ?? retainedAt ?? trace.startedAt
  return anchor + ttlMs
}

function hasDeleteTrace(adapter: ExportAdapter): adapter is DeletableAdapter {
  return typeof (adapter as Partial<DeletableAdapter>).deleteTrace === 'function'
}

async function deleteTraceFromAdapter(
  adapter: ExportAdapter,
  traceId: string,
  seen = new WeakSet<object>(),
): Promise<boolean> {
  if (seen.has(adapter)) return false
  seen.add(adapter)

  const wrapper = adapter as AdapterWrapperShape
  let deleted = false

  if (Array.isArray(wrapper.buffer)) {
    for (let i = wrapper.buffer.length - 1; i >= 0; i--) {
      if (wrapper.buffer[i]?.id === traceId) {
        wrapper.buffer.splice(i, 1)
        deleted = true
      }
    }
  }

  if (hasDeleteTrace(adapter)) {
    await adapter.deleteTrace(traceId)
    deleted = true
  }

  for (const child of childAdapters(wrapper)) {
    if (await deleteTraceFromAdapter(child, traceId, seen)) deleted = true
  }

  return deleted
}

function childAdapters(wrapper: AdapterWrapperShape): ExportAdapter[] {
  const children: ExportAdapter[] = []
  if (isExportAdapter(wrapper.inner)) children.push(wrapper.inner)
  if (isExportAdapter(wrapper.adapter)) children.push(wrapper.adapter)
  if (Array.isArray(wrapper.adapters)) children.push(...wrapper.adapters.filter(isExportAdapter))
  return children
}

function isExportAdapter(value: unknown): value is ExportAdapter {
  return typeof value === 'object' && value !== null &&
    typeof (value as ExportAdapter).flush === 'function' &&
    typeof (value as ExportAdapter).queryByTraceId === 'function' &&
    typeof (value as ExportAdapter).listTraceIds === 'function'
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
  for (const [key, nested] of Object.entries(value)) setRecordValue(cloned, key, cloneValue(nested, seen))
  return cloned
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isPlainRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && isPlainRecord(value)
}
