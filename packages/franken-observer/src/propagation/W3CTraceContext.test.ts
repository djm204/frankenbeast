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

  it('accepts future version bytes (forwards compatibility)', () => {
    const result = parseTraceparent(`ff-${TRACE_ID}-${SPAN_ID}-01`)
    expect(result).not.toBeNull()
    expect(result?.traceId).toBe(TRACE_ID)
    expect(result?.parentSpanId).toBe(SPAN_ID)
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

  it('throws for a parentSpanId that is not 16 hex chars', () => {
    expect(() => formatTraceparent({ traceId: TRACE_ID, parentSpanId: 'short', sampled: true })).toThrow()
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

  it('handles values that contain equals signs (takes first = as delimiter)', () => {
    expect(parseTracestate('k=v=extra')).toEqual({ k: 'v=extra' })
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

  it('returns empty string for an empty record', () => {
    expect(formatTracestate({})).toBe('')
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
