import { describe, it, expect } from 'vitest'
import {
  parseTraceparent,
  formatTraceparent,
  parseTracestate,
  formatTracestate,
  extractFromHeaders,
  injectIntoHeaders,
} from './W3CTraceContext.js'

const TRACE_ID  = '4bf92f3577b34da6a3ce929d0e0e4736' // 32 hex
const SPAN_ID   = '00f067aa0ba902b7'                  // 16 hex
const ZEROS_32  = '0'.repeat(32)
const ZEROS_16  = '0'.repeat(16)

// ── parseTraceparent ─────────────────────────────────────────────────────────

describe('parseTraceparent', () => {
  it('parses a valid sampled header', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-01`)).toEqual({
      traceId: TRACE_ID,
      parentSpanId: SPAN_ID,
      sampled: true,
    })
  })

  it('parses a valid unsampled header', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-00`)?.sampled).toBe(false)
  })

  it('sampled is true when only bit 0 of flags is set (01)', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-01`)?.sampled).toBe(true)
  })

  it('sampled is true when multiple flag bits are set (03)', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-03`)?.sampled).toBe(true)
  })

  it('sampled is false when bit 0 is not set (02)', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-02`)?.sampled).toBe(false)
  })

  it('accepts non-ff future version bytes with extra fields for forwards compatibility', () => {
    const result = parseTraceparent(`01-${TRACE_ID}-${SPAN_ID}-01-extra`)
    expect(result).not.toBeNull()
    expect(result?.traceId).toBe(TRACE_ID)
    expect(result?.parentSpanId).toBe(SPAN_ID)
  })

  it('returns null for forbidden ff version bytes', () => {
    expect(parseTraceparent(`ff-${TRACE_ID}-${SPAN_ID}-01`)).toBeNull()
  })

  it('returns null for version 00 headers with extra fields', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-01-extra`)).toBeNull()
  })

  it('returns null for malformed version bytes', () => {
    expect(parseTraceparent(`0g-${TRACE_ID}-${SPAN_ID}-01`)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseTraceparent(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(parseTraceparent(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseTraceparent('')).toBeNull()
  })

  it('returns null when there are fewer than 4 dash-separated parts', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}`)).toBeNull()
  })

  it('returns null for all-zeros trace-id', () => {
    expect(parseTraceparent(`00-${ZEROS_32}-${SPAN_ID}-01`)).toBeNull()
  })

  it('returns null for all-zeros parent-span-id', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${ZEROS_16}-01`)).toBeNull()
  })

  it('returns null for trace-id with wrong length', () => {
    expect(parseTraceparent(`00-abc123-${SPAN_ID}-01`)).toBeNull()
  })

  it('returns null for parent-span-id with wrong length', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-abc123-01`)).toBeNull()
  })

  it('returns null for non-hex characters in trace-id', () => {
    expect(parseTraceparent(`00-${'g'.repeat(32)}-${SPAN_ID}-01`)).toBeNull()
  })

  it('returns null for invalid flags (non-hex)', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-zz`)).toBeNull()
  })

  it('trims surrounding whitespace before parsing', () => {
    const result = parseTraceparent(`  00-${TRACE_ID}-${SPAN_ID}-01  `)
    expect(result?.traceId).toBe(TRACE_ID)
  })
})

// ── formatTraceparent ────────────────────────────────────────────────────────

describe('formatTraceparent', () => {
  it('formats a sampled context', () => {
    expect(formatTraceparent({ traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true }))
      .toBe(`00-${TRACE_ID}-${SPAN_ID}-01`)
  })

  it('formats an unsampled context', () => {
    expect(formatTraceparent({ traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: false }))
      .toBe(`00-${TRACE_ID}-${SPAN_ID}-00`)
  })

  it('always produces version 00', () => {
    const header = formatTraceparent({ traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true })
    expect(header.startsWith('00-')).toBe(true)
  })

  it('throws for a traceId that is not 32 hex chars', () => {
    expect(() => formatTraceparent({ traceId: 'short', parentSpanId: SPAN_ID, sampled: true })).toThrow()
  })

  it('throws for an all-zeros traceId', () => {
    expect(() => formatTraceparent({ traceId: ZEROS_32, parentSpanId: SPAN_ID, sampled: true })).toThrow()
  })

  it('throws for a parentSpanId that is not 16 hex chars', () => {
    expect(() => formatTraceparent({ traceId: TRACE_ID, parentSpanId: 'short', sampled: true })).toThrow()
  })

  it('throws for an all-zeros parentSpanId', () => {
    expect(() => formatTraceparent({ traceId: TRACE_ID, parentSpanId: ZEROS_16, sampled: true })).toThrow()
  })

  it('roundtrips cleanly with parseTraceparent', () => {
    const fields = { traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true }
    expect(parseTraceparent(formatTraceparent(fields))).toEqual(fields)
  })
})

// ── parseTracestate ──────────────────────────────────────────────────────────

describe('parseTracestate', () => {
  it('parses a single entry', () => {
    expect(parseTracestate(`rojo=${SPAN_ID}`)).toEqual({ rojo: SPAN_ID })
  })

  it('parses multiple comma-separated entries', () => {
    expect(parseTracestate('rojo=abc,congo=xyz')).toEqual({ rojo: 'abc', congo: 'xyz' })
  })

  it('returns empty object for empty string', () => {
    expect(parseTracestate('')).toEqual({})
  })

  it('returns empty object for null', () => {
    expect(parseTracestate(null)).toEqual({})
  })

  it('returns empty object for undefined', () => {
    expect(parseTracestate(undefined)).toEqual({})
  })

  it('trims whitespace around each entry', () => {
    expect(parseTracestate('  rojo = abc  ,  congo = xyz  ')).toEqual({ rojo: 'abc', congo: 'xyz' })
  })

  it('skips entries that have no equals sign', () => {
    expect(parseTracestate('rojo=abc,broken,congo=xyz')).toEqual({ rojo: 'abc', congo: 'xyz' })
  })

  it('skips entries with spaces in the key', () => {
    expect(parseTracestate('bad key=value,rojo=abc')).toEqual({ rojo: 'abc' })
  })

  it('skips entries with control characters in the value', () => {
    expect(parseTracestate('rojo=abc\nline,congo=xyz')).toEqual({ congo: 'xyz' })
  })

  it('skips entries with non-ASCII values', () => {
    expect(parseTracestate('rojo=caf\u00e9,congo=xyz,snowman=\u2603')).toEqual({ congo: 'xyz' })
  })

  it('skips duplicate keys after first occurrence', () => {
    expect(parseTracestate('rojo=first,rojo=second,congo=xyz')).toEqual({ rojo: 'first', congo: 'xyz' })
  })

  it('keeps only the first 32 valid entries', () => {
    const header = Array.from({ length: 33 }, (_, i) => `k${String(i).padStart(2, '0')}=v${i}`).join(',')
    expect(Object.keys(parseTracestate(header))).toHaveLength(32)
  })

  it('skips values that contain equals signs', () => {
    expect(parseTracestate('k=v=extra,rojo=abc')).toEqual({ rojo: 'abc' })
  })

  it('accepts W3C tracestate keys with slashes and numeric tenant ids', () => {
    expect(parseTracestate('vendor/foo=abc,1tenant@vendor=xyz')).toEqual({
      'vendor/foo': 'abc',
      '1tenant@vendor': 'xyz',
    })
  })

  it('rejects simple tracestate keys that start with digits', () => {
    expect(parseTracestate('1vendor=bad,vendor=ok')).toEqual({ vendor: 'ok' })
  })

  it('counts malformed tracestate members toward the 32-member inbound limit', () => {
    const header = [
      ...Array.from({ length: 32 }, (_, i) => `bad.key.${i}=v${i}`),
      'vendor=value',
    ].join(',')
    expect(parseTracestate(header)).toEqual({})
  })

  it('rejects tracestate keys with dots', () => {
    expect(parseTracestate('vendor.foo=abc,rojo=xyz')).toEqual({ rojo: 'xyz' })
  })
})

// ── formatTracestate ─────────────────────────────────────────────────────────

describe('formatTracestate', () => {
  it('formats a single entry', () => {
    expect(formatTracestate({ vendor: 'value' })).toBe('vendor=value')
  })

  it('formats multiple entries in insertion order', () => {
    expect(formatTracestate({ rojo: 'abc', congo: 'xyz' })).toBe('rojo=abc,congo=xyz')
  })

  it('filters invalid entries before formatting', () => {
    expect(formatTracestate({ 'bad key': 'abc', vendor: 'value' })).toBe('vendor=value')
  })

  it('filters values containing commas from output', () => {
    expect(formatTracestate({ vendor: 'one,two', good: 'safe' })).toBe('good=safe')
  })

  it('filters values containing equals signs from output', () => {
    expect(formatTracestate({ vendor: 'a=b', good: 'safe' })).toBe('good=safe')
  })

  it('filters non-ASCII and trailing-space values from output', () => {
    expect(formatTracestate({ vendor: 'caf\u00e9', trailing: 'value ', good: 'safe' })).toBe('good=safe')
  })

  it('formats W3C-compliant keys and rejects dotted or digit-start simple keys', () => {
    expect(formatTracestate({ 'vendor/foo': 'abc', '1tenant@vendor': 'xyz', 'vendor.foo': 'bad', '1vendor': 'bad' })).toBe(
      'vendor/foo=abc,1tenant@vendor=xyz',
    )
  })

  it('returns empty string when all entries are invalid', () => {
    expect(formatTracestate({ 'bad key': 'abc', bad2: 'one,two' })).toBe('')
  })

  it('returns empty string for an empty record', () => {
    expect(formatTracestate({})).toBe('')
  })

  it('truncates to the first 32 valid entries', () => {
    const state = Object.fromEntries(
      Array.from({ length: 33 }, (_, i) => [`k${String(i).padStart(2, '0')}`, `v${i}`]),
    ) as Record<string, string>
    expect(formatTracestate(state).split(',')).toHaveLength(32)
  })

  it('limits entries after filtering invalid entries', () => {
    const state = Object.fromEntries([
      ...Array.from({ length: 32 }, (_, i) => [`bad.key.${i}`, `v${i}`]),
      ['vendor', 'value'],
    ]) as Record<string, string>
    expect(formatTracestate(state)).toBe('vendor=value')
  })

  it('roundtrips cleanly with parseTracestate for simple values', () => {
    const state = { rojo: 'abc123', congo: 'xyz789' }
    expect(parseTracestate(formatTracestate(state))).toEqual(state)
  })

})

// ── extractFromHeaders / injectIntoHeaders ───────────────────────────────────

describe('extractFromHeaders', () => {
  it('extracts traceparent and tracestate from a headers object', () => {
    const headers = {
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
      tracestate: 'vendor=abc',
    }
    const result = extractFromHeaders(headers)
    expect(result?.traceparent.traceId).toBe(TRACE_ID)
    expect(result?.tracestate).toEqual({ vendor: 'abc' })
  })

  it('returns null when traceparent header is absent', () => {
    expect(extractFromHeaders({ tracestate: 'vendor=abc' })).toBeNull()
  })

  it('returns null when traceparent is present but invalid', () => {
    expect(extractFromHeaders({ traceparent: 'garbage' })).toBeNull()
  })

  it('returns empty tracestate when the tracestate header is absent', () => {
    const result = extractFromHeaders({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` })
    expect(result?.tracestate).toEqual({})
  })

  it('is case-insensitive for header names', () => {
    const result = extractFromHeaders({
      'Traceparent': `00-${TRACE_ID}-${SPAN_ID}-01`,
      'Tracestate': 'v=1',
    })
    expect(result?.traceparent.traceId).toBe(TRACE_ID)
  })
})

describe('injectIntoHeaders', () => {
  it('injects traceparent into a headers object', () => {
    const headers = injectIntoHeaders({ traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true })
    expect(headers['traceparent']).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`)
  })

  it('injects tracestate when provided', () => {
    const headers = injectIntoHeaders(
      { traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true },
      { vendor: 'value' },
    )
    expect(headers['tracestate']).toBe('vendor=value')
  })

  it('does not include tracestate key when state is omitted', () => {
    const headers = injectIntoHeaders({ traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true })
    expect('tracestate' in headers).toBe(false)
  })

  it('omits tracestate when provided state is invalid', () => {
    const headers = injectIntoHeaders(
      { traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true },
      { 'bad key': 'one,two' },
    )
    expect('tracestate' in headers).toBe(false)
  })

  it('clears existing tracestate when provided state sanitizes empty', () => {
    const headers = injectIntoHeaders(
      { traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true },
      { 'bad key': 'one,two' },
      { tracestate: 'stale=value' },
    )
    expect('tracestate' in headers).toBe(false)
  })

  it('clears existing tracestate case-insensitively when provided state sanitizes empty', () => {
    const headers = injectIntoHeaders(
      { traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true },
      { 'bad key': 'one,two' },
      { Tracestate: 'stale=value' },
    )
    expect('tracestate' in headers).toBe(false)
    expect('Tracestate' in headers).toBe(false)
  })

  it('merges into an existing headers object', () => {
    const existing = { 'Content-Type': 'application/json' }
    const headers = injectIntoHeaders(
      { traceId: TRACE_ID, parentSpanId: SPAN_ID, sampled: true },
      undefined,
      existing,
    )
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['traceparent']).toBeTruthy()
  })
})
