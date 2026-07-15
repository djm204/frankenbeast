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
  readonly cleanupRemovesStoredTraces: boolean
  readonly cleanupWarning?: string
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
  drain?: () => Promise<void>
  drainPromise: Promise<void> | null
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

const PROMPT_KEYS = new Set(['prompt', 'prompts', 'systemprompt', 'userprompt', 'developerprompt', 'instructions', 'additionalcontext', 'operatorcontext', 'context', 'goal', 'goals', 'transcript', 'transcripts'])
const TOOL_INPUT_KEYS = new Set(['toolinput', 'toolinputs', 'input', 'inputs', 'arguments', 'args', 'parameters', 'params', 'stdin'])
const TOOL_OUTPUT_KEYS = new Set(['tooloutput', 'tooloutputs', 'output', 'outputs', 'result', 'results', 'response', 'responses', 'stdout', 'stderr'])
const ERROR_KEYS = new Set(['error', 'errors', 'exception', 'exceptions', 'stack', 'stacktrace', 'errormessage', 'stderr'])
const SUMMARY_KEYS = new Set(['summary', 'summaries'])
const NON_TRANSCRIPT_TOKEN_KEYS = new Set([
  'prompttokens',
  'prompttokencount',
  'prompttokenscount',
  'prompttokensdetails',
  'completiontokens',
  'completiontokencount',
  'completiontokenscount',
  'completiontokensdetails',
  'totaltokens',
  'totaltokencount',
  'totaltokenscount',
])
const CHAT_TRANSCRIPT_KEYS = new Set(['message', 'messages', 'content', 'contents'])

export class TranscriptRetentionAdapter implements ExportAdapter {
  private readonly inner: ExportAdapter
  private readonly policy: ResolvedTranscriptRetentionPolicy
  private readonly now: () => number
  private readonly retained = new Map<string, number>()
  private readonly expiredTraceIds = new Set<string>()
  private readonly deleteFailedTraceIds = new Set<string>()

  constructor(options: TranscriptRetentionAdapterOptions) {
    this.inner = options.adapter
    this.policy = resolveTranscriptRetentionPolicy(options)
    this.now = options.now ?? Date.now
  }

  async flush(trace: Trace): Promise<void> {
    if (this.policy.mode === 'disabled') return
    if (trace.endedAt !== undefined && this.isExpired(trace)) return

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
    if (trace.endedAt !== undefined ? this.isExpired(trace) : (!this.retained.has(traceId) && this.isExpired(trace))) {
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
    return describeTranscriptRetentionPolicy(this.policy, this.now, hasDeleteTraceSupport(this.inner))
  }

  async cleanupExpired(): Promise<string[]> {
    const expired = new Set<string>()
    const now = this.now()
    for (const [traceId, expiresAt] of this.retained.entries()) {
      if (expiresAt > now) continue
      expired.add(traceId)
      await this.markExpired(traceId)
    }

    for (const traceId of await this.inner.listTraceIds()) {
      if (expired.has(traceId)) continue
      if (this.expiredTraceIds.has(traceId) && !this.deleteFailedTraceIds.has(traceId)) continue
      const trace = await this.inner.queryByTraceId(traceId)
      if (!trace) continue
      if (trace.endedAt === undefined && this.retained.has(traceId)) continue
      if (!this.isExpired(trace)) continue
      expired.add(traceId)
      await this.markExpired(traceId)
    }

    return [...expired]
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
    this.expiredTraceIds.add(traceId)
    try {
      const deleted = await deleteTraceFromAdapter(this.inner, traceId)
      if (deleted) this.expiredTraceIds.delete(traceId)
      this.deleteFailedTraceIds.delete(traceId)
    } catch (error) {
      this.deleteFailedTraceIds.add(traceId)
      console.warn?.(`[TranscriptRetentionAdapter] Failed to delete expired trace ${traceId}:`, error)
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
  now: () => number = policy.now ?? Date.now,
  cleanupRemovesStoredTraces = true,
): TranscriptRetentionPolicyReport {
  const resolved = resolveTranscriptRetentionPolicy(policy)
  const storesRawTranscriptContent = resolved.mode !== 'disabled' && (resolved.mode === 'raw' || resolved.redactionLevel === 'none')
  return Object.freeze({
    ...resolved,
    storesRawTranscriptContent,
    cleanupRemovesStoredTraces,
    ...(storesRawTranscriptContent && !cleanupRemovesStoredTraces
      ? { cleanupWarning: 'Wrapped adapter does not support deleteTrace; TTL cleanup only hides traces through this retention wrapper and cannot remove already-exported raw transcripts from that backend.' }
      : {}),
    ...(resolved.ttlMs > 0 ? { expiresAt: now() + resolved.ttlMs } : {}),
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
    const field = classifyContextualTranscriptField(metadata, key)
    if (field && !policy.retainedFields[field]) {
      if (field === 'prompts' && isChatTranscriptContainerKey(key) && value !== null && typeof value === 'object') {
        setRecordValue(retained, key, redactFieldValue(value, field, policy, seen))
      }
      continue
    }
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
      const retainedKey = typeof key === 'string' ? cloneValue(key) : redactNestedTranscriptValues(key, policy, seen)
      retained.set(retainedKey, field ? redactFieldValue(nestedValue, field, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen))
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
  if (value instanceof URL) return cloneValue(value)
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return cloneValue(value)
  if (!isPlainRecord(value)) {
    if (hasCustomToJSON(value)) {
      seen.set(value, DROPPED)
      const retained = redactNestedTranscriptValues(value.toJSON(), policy, seen)
      seen.set(value, retained)
      return retained
    }
    return shouldRedactEnumerableObject(value)
      ? redactEnumerableObject(value, policy, seen)
      : cloneValue(value)
  }

  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  const recordType = typeof value['type'] === 'string' ? value['type'].replace(/[_-]/g, '').toLowerCase() : ''
  for (const [key, nestedValue] of Object.entries(value)) {
    if (recordType === 'contentblockdelta' && key.replace(/[_-]/g, '').toLowerCase() === 'delta') {
      setRecordValue(retained, key, redactProviderStreamDeltaValue(nestedValue, policy, seen))
      continue
    }
    const field = classifyContextualTranscriptField(value, key)
    if (field && !policy.retainedFields[field]) continue
    setRecordValue(retained, key, field ? redactFieldValue(nestedValue, field, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen))
  }
  return retained
}

function classifyContextualTranscriptField(record: Record<string, unknown>, key: string): TranscriptField | undefined {
  const recordType = typeof record['type'] === 'string' ? record['type'].replace(/[_-]/g, '').toLowerCase() : ''
  const recordRole = typeof record['role'] === 'string' ? record['role'].replace(/[_-]/g, '').toLowerCase() : ''
  if ((recordType === 'toolresult' || recordRole === 'tool') && (key === 'content' || key === 'text')) return 'toolOutputs'
  if (recordType === 'inputjsondelta' && key.replace(/[_-]/g, '').toLowerCase() === 'partialjson') return 'toolInputs'
  if (isPromptBlockContentField(recordType, key)) return 'prompts'
  return classifyTranscriptField(key)
}

function classifyTranscriptField(key: string): TranscriptField | undefined {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (NON_TRANSCRIPT_TOKEN_KEYS.has(normalized)) return undefined
  if (CHAT_TRANSCRIPT_KEYS.has(normalized)) return 'prompts'
  if (
    PROMPT_KEYS.has(normalized) ||
    normalized.includes('prompt') ||
    normalized === 'system' ||
    normalized.includes('instruction') ||
    normalized.includes('transcript') ||
    normalized.endsWith('goal') ||
    normalized.endsWith('goals')
  ) return 'prompts'
  if (
    TOOL_INPUT_KEYS.has(normalized) ||
    normalized === 'query' ||
    normalized.includes('toolinput') ||
    normalized.includes('toolarg') ||
    normalized.includes('toolparam') ||
    normalized === 'inputjson' ||
    normalized === 'argsjson' ||
    normalized.endsWith('inputjson') ||
    normalized.endsWith('argsjson')
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

function isChatTranscriptContainerKey(key: string): boolean {
  return CHAT_TRANSCRIPT_KEYS.has(key.replace(/[_-]/g, '').toLowerCase())
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
  if (field === 'prompts' && (policy.mode === 'raw' || policy.redactionLevel === 'none')) {
    if (Array.isArray(value)) {
      const retained: unknown[] = []
      seen.set(value, retained)
      for (const item of value) retained.push(redactProviderMessageValue(item, policy, seen))
      return retained
    }
    if (value !== null && typeof value === 'object') return redactNestedTranscriptValues(value, policy, seen)
  }
  if ((policy.mode === 'raw' || policy.redactionLevel === 'none') && value !== null && typeof value === 'object') {
    return redactNestedTranscriptValues(value, policy, seen)
  }
  return redactValue(value, policy)
}

function redactProviderMessageValue(
  value: unknown,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): unknown {
  if (!isPlainRecordValue(value)) return policy.retainedFields.prompts ? redactNestedTranscriptValues(value, policy, seen) : DROPPED
  if (seen.has(value)) return seen.get(value)

  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  const messageType = typeof value['type'] === 'string' ? value['type'].replace(/[_-]/g, '').toLowerCase() : ''
  const messageRole = typeof value['role'] === 'string' ? value['role'].replace(/[_-]/g, '').toLowerCase() : ''
  for (const [key, nestedValue] of Object.entries(value)) {
    if (messageType === 'contentblockdelta' && key.replace(/[_-]/g, '').toLowerCase() === 'delta') {
      setRecordValue(retained, key, redactProviderStreamDeltaValue(nestedValue, policy, seen))
      continue
    }
    const contextualField = classifyProviderMessageField(messageType, messageRole, key)
    if (contextualField && !policy.retainedFields[contextualField]) continue
    setRecordValue(
      retained,
      key,
      contextualField ? redactFieldValue(nestedValue, contextualField, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen),
    )
  }
  return retained
}

function redactProviderStreamDeltaValue(
  value: unknown,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): unknown {
  if (!isPlainRecordValue(value)) return redactNestedTranscriptValues(value, policy, seen)
  if (seen.has(value)) return seen.get(value)

  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  const deltaType = typeof value['type'] === 'string' ? value['type'].replace(/[_-]/g, '').toLowerCase() : ''
  for (const [key, nestedValue] of Object.entries(value)) {
    const contextualField = classifyProviderStreamDeltaField(deltaType, key)
    if (contextualField && !policy.retainedFields[contextualField]) continue
    setRecordValue(
      retained,
      key,
      contextualField ? redactFieldValue(nestedValue, contextualField, policy, seen) : redactNestedTranscriptValues(nestedValue, policy, seen),
    )
  }
  return retained
}

function classifyProviderStreamDeltaField(deltaType: string, key: string): TranscriptField | undefined {
  const normalizedKey = key.replace(/[_-]/g, '').toLowerCase()
  if ((deltaType === '' || deltaType === 'textdelta' || deltaType === 'outputtextdelta') && normalizedKey === 'text') return 'prompts'
  if (deltaType === 'inputjsondelta' && normalizedKey === 'partialjson') return 'toolInputs'
  if (deltaType === 'thinkingdelta' && normalizedKey === 'thinking') return 'prompts'
  return classifyProviderMessageField(deltaType, '', key)
}

function classifyProviderMessageField(messageType: string, messageRole: string, key: string): TranscriptField | undefined {
  if ((messageType === 'toolresult' || messageRole === 'tool') && (key === 'content' || key === 'text')) return 'toolOutputs'
  if (messageType === 'inputjsondelta' && key.replace(/[_-]/g, '').toLowerCase() === 'partialjson') return 'toolInputs'
  if (isPromptBlockContentField(messageType, key)) return 'prompts'
  return classifyTranscriptField(key)
}

function isPromptBlockContentField(messageType: string, key: string): boolean {
  const normalizedKey = key.replace(/[_-]/g, '').toLowerCase()
  if ((messageType === 'textdelta' || messageType === 'outputtextdelta') && normalizedKey === 'text') return true
  if (messageType === 'thinkingdelta' && normalizedKey === 'thinking') return true
  if (
    isMultimodalPromptBlockType(messageType) &&
    MULTIMODAL_PROMPT_CONTENT_KEYS.has(normalizedKey)
  ) return true
  return (
    ((messageType === 'text' || messageType === 'inputtext' || messageType === 'outputtext') && normalizedKey === 'text') ||
    ((messageType === 'imageurl' || messageType === 'inputimage') && (normalizedKey === 'imageurl' || normalizedKey === 'url'))
  )
}

const MULTIMODAL_PROMPT_CONTENT_KEYS = new Set([
  'audio',
  'data',
  'document',
  'file',
  'filedata',
  'image',
  'imageurl',
  'inputaudio',
  'inputimage',
  'source',
  'url',
])

function isMultimodalPromptBlockType(messageType: string): boolean {
  return messageType === 'inputaudio' ||
    messageType === 'audio' ||
    messageType === 'inputfile' ||
    messageType === 'file' ||
    messageType === 'document' ||
    messageType === 'inputdocument' ||
    messageType === 'image' ||
    messageType === 'inputimage' ||
    messageType === 'imageurl'
}

function redactEnumerableObject(
  value: object,
  policy: ResolvedTranscriptRetentionPolicy,
  seen: WeakMap<object, unknown>,
): Record<string, unknown> {
  const retained: Record<string, unknown> = {}
  seen.set(value, retained)
  const record = value as Record<string, unknown>
  for (const [key, nestedValue] of Object.entries(value)) {
    const field = classifyContextualTranscriptField(record, key)
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

function hasCustomToJSON(value: object): value is { toJSON: () => unknown } {
  return typeof (value as { toJSON?: unknown }).toJSON === 'function'
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

function hasDeleteTraceSupport(adapter: ExportAdapter, seen = new WeakSet<object>()): boolean {
  if (seen.has(adapter)) return false
  seen.add(adapter)
  if (hasDeleteTrace(adapter)) return true
  return childAdapters(adapter as AdapterWrapperShape).some(child => hasDeleteTraceSupport(child, seen))
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
  let firstFailure: unknown = null

  if (Array.isArray(wrapper.buffer)) {
    for (let i = wrapper.buffer.length - 1; i >= 0; i--) {
      if (wrapper.buffer[i]?.id === traceId) {
        wrapper.buffer.splice(i, 1)
        deleted = true
      }
    }
  }

  if (wrapper.drainPromise !== null && wrapper.drainPromise !== undefined) {
    try {
      await wrapper.drainPromise
    } catch (error) {
      firstFailure ??= error
    }
  }

  if (hasDeleteTrace(adapter)) {
    try {
      await adapter.deleteTrace(traceId)
      deleted = true
    } catch (error) {
      firstFailure ??= error
    }
  }

  for (const child of childAdapters(wrapper)) {
    try {
      if (await deleteTraceFromAdapter(child, traceId, seen)) deleted = true
    } catch (error) {
      firstFailure ??= error
    }
  }

  if (firstFailure !== null) throw firstFailure instanceof Error ? firstFailure : new Error(String(firstFailure))
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
