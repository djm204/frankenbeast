/**
 * W3C Trace Context (https://www.w3.org/TR/trace-context/)
 *
 * Pure utility functions for parsing and formatting the two propagation headers:
 *  - `traceparent`  — carries version, trace-id, parent-span-id, and trace-flags
 *  - `tracestate`   — carries vendor-specific key/value pairs
 *
 * No classes, no I/O, no side effects.
 */
// ── Internal constants ────────────────────────────────────────────────────────
const RE_HEX_32 = /^[0-9a-f]{32}$/;
const RE_HEX_16 = /^[0-9a-f]{16}$/;
const RE_HEX_02 = /^[0-9a-f]{2}$/;
const ZEROS_32 = '0'.repeat(32);
const ZEROS_16 = '0'.repeat(16);
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
 * if (ctx) console.log(ctx.traceId, ctx.sampled)
 * ```
 */
export function parseTraceparent(header) {
    if (!header)
        return null;
    const parts = header.trim().split('-');
    // Spec mandates exactly 4 fields for version 00; future versions may add more.
    if (parts.length < 4)
        return null;
    const [, traceId, parentSpanId, flags] = parts;
    if (!RE_HEX_32.test(traceId) || traceId === ZEROS_32)
        return null;
    if (!RE_HEX_16.test(parentSpanId) || parentSpanId === ZEROS_16)
        return null;
    if (!RE_HEX_02.test(flags))
        return null;
    const sampled = (parseInt(flags, 16) & 0x01) === 1;
    return { traceId, parentSpanId, sampled };
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
export function formatTraceparent(fields) {
    const { traceId, parentSpanId, sampled } = fields;
    if (!RE_HEX_32.test(traceId)) {
        throw new Error(`traceId must be 32 lowercase hex characters, got: "${traceId}"`);
    }
    if (!RE_HEX_16.test(parentSpanId)) {
        throw new Error(`parentSpanId must be 16 lowercase hex characters, got: "${parentSpanId}"`);
    }
    return `00-${traceId}-${parentSpanId}-${sampled ? '01' : '00'}`;
}
// ── parseTracestate ───────────────────────────────────────────────────────────
/**
 * Parses a W3C `tracestate` header value into a plain object.
 *
 * Malformed entries (no `=` delimiter) are silently skipped.
 * The first `=` in each entry is the key/value delimiter; values may contain
 * additional `=` characters.
 * Returns `{}` for empty, null, or undefined input.
 *
 * ```ts
 * const state = parseTracestate(req.headers['tracestate'])
 * console.log(state['vendor-name'])
 * ```
 */
export function parseTracestate(header) {
    if (!header?.trim())
        return {};
    const result = {};
    for (const entry of header.split(',')) {
        const eqIdx = entry.indexOf('=');
        if (eqIdx === -1)
            continue;
        const key = entry.slice(0, eqIdx).trim();
        const value = entry.slice(eqIdx + 1).trim();
        if (key)
            result[key] = value;
    }
    return result;
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
export function formatTracestate(state) {
    return Object.entries(state).map(([k, v]) => `${k}=${v}`).join(',');
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
export function extractFromHeaders(headers) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
    const traceparent = parseTraceparent(lower['traceparent'] ?? null);
    if (!traceparent)
        return null;
    const tracestate = parseTracestate(lower['tracestate'] ?? null);
    return { traceparent, tracestate };
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
export function injectIntoHeaders(fields, state, existing) {
    const out = { ...existing };
    out['traceparent'] = formatTraceparent(fields);
    if (state !== undefined)
        out['tracestate'] = formatTracestate(state);
    return out;
}
//# sourceMappingURL=W3CTraceContext.js.map