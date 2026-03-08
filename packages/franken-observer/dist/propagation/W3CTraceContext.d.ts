/**
 * W3C Trace Context (https://www.w3.org/TR/trace-context/)
 *
 * Pure utility functions for parsing and formatting the two propagation headers:
 *  - `traceparent`  — carries version, trace-id, parent-span-id, and trace-flags
 *  - `tracestate`   — carries vendor-specific key/value pairs
 *
 * No classes, no I/O, no side effects.
 */
/** Decoded fields from a `traceparent` header. */
export interface TraceparentFields {
    /** 128-bit trace ID as 32 lowercase hex characters. */
    traceId: string;
    /** 64-bit parent span ID as 16 lowercase hex characters. */
    parentSpanId: string;
    /** Whether the trace is sampled (W3C trace-flags bit 0). */
    sampled: boolean;
}
/** Combined extraction result from a set of incoming HTTP headers. */
export interface ExtractedTraceContext {
    traceparent: TraceparentFields;
    tracestate: Record<string, string>;
}
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
export declare function parseTraceparent(header: string | null | undefined): TraceparentFields | null;
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
export declare function formatTraceparent(fields: TraceparentFields): string;
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
export declare function parseTracestate(header: string | null | undefined): Record<string, string>;
/**
 * Formats a `tracestate` header value from a plain object.
 * Entries are emitted in insertion order. Returns `''` for an empty record.
 *
 * ```ts
 * const header = formatTracestate({ 'my-vendor': spanId })
 * ```
 */
export declare function formatTracestate(state: Record<string, string>): string;
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
export declare function extractFromHeaders(headers: Record<string, string | string[] | undefined>): ExtractedTraceContext | null;
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
export declare function injectIntoHeaders(fields: TraceparentFields, state?: Record<string, string>, existing?: Record<string, string>): Record<string, string>;
//# sourceMappingURL=W3CTraceContext.d.ts.map