/**
 * W3C Trace Context (https://www.w3.org/TR/trace-context/)
 *
 * Pure utility functions for parsing and formatting the two propagation headers:
 *  - `traceparent`  — carries version, trace-id, parent-span-id, and trace-flags
 *  - `tracestate`   — carries vendor-specific key/value pairs
 *
 * No classes, no I/O, no side effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Decoded fields from a `traceparent` header. */
export interface TraceparentFields {
  /** 128-bit trace ID as 32 lowercase hex characters. */
  traceId: string
  /** 64-bit parent span ID as 16 lowercase hex characters. */
  parentSpanId: string
  /** Whether the trace is sampled (W3C trace-flags bit 0). */
  sampled: boolean
}

/** Combined extraction result from a set of incoming HTTP headers. */
export interface ExtractedTraceContext {
  traceparent: TraceparentFields
  tracestate: Record<string, string>
}

// ── Internal constants ────────────────────────────────────────────────────────

const RE_HEX_32 = /^[0-9a-f]{32}$/
const RE_HEX_16 = /^[0-9a-f]{16}$/
const RE_HEX_02 = /^[0-9a-f]{2}$/

const RE_TRACESTATE_KEY = /^[a-z][a-z0-9_\-\*.]{0,255}(?:@[a-z][a-z0-9_\-\*.]{0,255})?$/
const ZEROS_32 = '0'.repeat(32)
const ZEROS_16 = '0'.repeat(16)

const MAX_TRACESTATE_ENTRIES = 32
const MAX_TRACESTATE_KEY_LENGTH = 256
const MAX_TRACESTATE_VALUE_LENGTH = 256
const MAX_TRACESTATE_ENTRY_LENGTH = MAX_TRACESTATE_KEY_LENGTH + 1 + MAX_TRACESTATE_VALUE_LENGTH

function isValidTracestateKey(key: string): boolean {
  return key.length <= MAX_TRACESTATE_KEY_LENGTH && RE_TRACESTATE_KEY.test(key)
}

function isValidTracestateValue(value: string): boolean {
  if (!value.length || value.length > MAX_TRACESTATE_VALUE_LENGTH) return false
  if (value.includes(',')) return false
  if (/[\u0000-\u001f\u007F]/.test(value)) return false
  return true
}

function sanitizeTracestate(state: Record<string, string>): [string, string][] {
  return Object.entries(state)
    .filter(([key, value], index) => index < MAX_TRACESTATE_ENTRIES)
    .filter(([key, value]) => isValidTracestateKey(key) && isValidTracestateValue(value))
}

// ── parseTraceparent ──────────────────────────────────────────────────────────

/**
 * Parses a W3C `traceparent` header value.
 *
 * Returns `null` for any input that does not conform to the spec:
 * unknown version bytes are accepted (forwards compatibility), but
 * all-zeros IDs and non-hex characters are rejected.
 *
 * ```ts
 * const ctx = parseTraceparent(req.headers['traceparent'])
 * if (ctx) process.stdout.write(`${ctx.traceId} ${ctx.sampled}\n`)
 * ```
 */
export function parseTraceparent(header: string | null | undefined): TraceparentFields | null {
  if (!header) return null

  const parts = header.trim().split('-')
  // Spec mandates exactly 4 fields for version 00; future versions may add more.
  if (parts.length < 4) return null

  const [, traceId, parentSpanId, flags] = parts

  if (!RE_HEX_32.test(traceId)    || traceId    === ZEROS_32) return null
  if (!RE_HEX_16.test(parentSpanId) || parentSpanId === ZEROS_16) return null
  if (!RE_HEX_02.test(flags)) return null

  const sampled = (parseInt(flags, 16) & 0x01) === 1
  return { traceId, parentSpanId, sampled }
}

// ── formatTraceparent ─────────────────────────────────────────────────────────

/**
 * Formats a W3C `traceparent` header value. Always produces version `00`.
 *
 * ```ts
 * const header = formatTraceparent({ traceId, parentSpanId, sampled: true })
 * fetch(url, { headers: { traceparent: header } })
 * ```
 *
 * @throws {Error} if `traceId` is not 32 lowercase hex chars, or
 *                 if `parentSpanId` is not 16 lowercase hex chars.
 */
export function formatTraceparent(fields: TraceparentFields): string {
  const { traceId, parentSpanId, sampled } = fields
  if (!RE_HEX_32.test(traceId)) {
    throw new Error(`traceId must be 32 lowercase hex characters, got: "${traceId}"`)
  }
  if (!RE_HEX_16.test(parentSpanId)) {
    throw new Error(`parentSpanId must be 16 lowercase hex characters, got: "${parentSpanId}"`)
  }
  return `00-${traceId}-${parentSpanId}-${sampled ? '01' : '00'}`
}

// ── parseTracestate ───────────────────────────────────────────────────────────

/**
 * Parses a W3C `tracestate` header value into a plain object.
 *
 * Malformed entries are silently skipped.
 * Valid keys use W3C `tracestate` key grammar and values exclude commas and control
 * characters. Duplicate keys are ignored after the first occurrence.
 * Returns `{}` for empty, null, or undefined input.
 *
 * ```ts
 * const state = parseTracestate(req.headers['tracestate'])
 * process.stdout.write(state['vendor-name'])
 * ```
 */
export function parseTracestate(header: string | null | undefined): Record<string, string> {
  if (!header?.trim()) return {}

  const result: Record<string, string> = {}
  let seenEntries = 0

  for (const entry of header.split(',')) {
    const entryTrimmed = entry.trim()
    if (!entryTrimmed) continue
    if (entryTrimmed.length > MAX_TRACESTATE_ENTRY_LENGTH) continue

    const eqIdx = entryTrimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = entryTrimmed.slice(0, eqIdx).trim()
    const value = entryTrimmed.slice(eqIdx + 1).trim()
    if (!key || !value) continue
    if (seenEntries >= MAX_TRACESTATE_ENTRIES) break
    if (!isValidTracestateKey(key) || !isValidTracestateValue(value)) continue
    if (Object.hasOwn(result, key)) continue

    result[key] = value
    seenEntries += 1
  }

  return result
}

// ── formatTracestate ──────────────────────────────────────────────────────────

/**
 * Formats a `tracestate` header value from a plain object.
 * Entries are emitted in insertion order. Returns `''` for an empty record.
 *
 * ```ts
 * const header = formatTracestate({ 'my-vendor': spanId })
 * ```
 */
export function formatTracestate(state: Record<string, string>): string {
  return sanitizeTracestate(state)
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
}

// ── HTTP header helpers ───────────────────────────────────────────────────────

/**
 * Extracts W3C trace context from an HTTP headers object (case-insensitive).
 * Returns `null` when `traceparent` is absent or invalid.
 *
 * ```ts
 * // Express / Node http.IncomingMessage
 * const ctx = extractFromHeaders(req.headers)
 * if (ctx) startChildSpan(ctx.traceparent.traceId)
 * ```
 */
export function extractFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): ExtractedTraceContext | null {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>

  const traceparent = parseTraceparent(lower['traceparent'] ?? null)
  if (!traceparent) return null

  const tracestate = parseTracestate(lower['tracestate'] ?? null)
  return { traceparent, tracestate }
}

/**
 * Returns a new headers object with `traceparent` (and optionally `tracestate`)
 * injected, merged on top of any `existing` headers supplied.
 *
 * ```ts
 * const childHeaders = injectIntoHeaders(
 *   { traceId, parentSpanId: span.id, sampled: true },
 *   { 'my-vendor': span.id },
 *   { 'Content-Type': 'application/json' },
 * )
 * ```
 */
export function injectIntoHeaders(
  fields: TraceparentFields,
  state?: Record<string, string>,
  existing?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...existing }
  out['traceparent'] = formatTraceparent(fields)
  if (state !== undefined) {
    const tracestate = formatTracestate(state)
    if (tracestate) out['tracestate'] = tracestate
  }
  return out
}
