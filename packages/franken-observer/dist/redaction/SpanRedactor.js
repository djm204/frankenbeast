// ── SpanRedactor ──────────────────────────────────────────────────────────────
/**
 * Wraps an `ExportAdapter` and scrubs sensitive fields from every span before
 * the trace is passed downstream. The original trace object is never mutated.
 *
 * ```ts
 * const adapter = new SpanRedactor({
 *   adapter: langfuseAdapter,
 *   rules: [
 *     { key: /^(api|auth)_/, action: 'remove' },   // drop secrets
 *     { key: 'email',        action: 'mask' },      // mask PII
 *   ],
 *   redactThoughtBlocks: true,  // strip chain-of-thought before cloud export
 * })
 * ```
 *
 * Compose freely with `MultiAdapter` and `SamplingAdapter` — `SpanRedactor`
 * is itself an `ExportAdapter`.
 */
export class SpanRedactor {
    inner;
    rules;
    redactThoughtBlocks;
    constructor(options) {
        this.inner = options.adapter;
        this.rules = options.rules;
        this.redactThoughtBlocks = options.redactThoughtBlocks ?? false;
    }
    async flush(trace) {
        const redacted = {
            ...trace,
            spans: trace.spans.map(span => this.redactSpan(span)),
        };
        await this.inner.flush(redacted);
    }
    async queryByTraceId(traceId) {
        return this.inner.queryByTraceId(traceId);
    }
    async listTraceIds() {
        return this.inner.listTraceIds();
    }
    // ── private ───────────────────────────────────────────────────────────────
    redactSpan(span) {
        const metadata = this.redactMetadata(span.metadata);
        const thoughtBlocks = this.redactThoughtBlocks ? [] : span.thoughtBlocks;
        if (metadata === span.metadata && thoughtBlocks === span.thoughtBlocks)
            return span;
        return { ...span, metadata, thoughtBlocks };
    }
    redactMetadata(metadata) {
        if (this.rules.length === 0)
            return metadata;
        const result = { ...metadata };
        for (const [key] of Object.entries(metadata)) {
            for (const rule of this.rules) {
                const matches = typeof rule.key === 'string' ? rule.key === key : rule.key.test(key);
                if (!matches)
                    continue;
                if (rule.action === 'remove') {
                    delete result[key];
                }
                else {
                    result[key] = rule.maskWith ?? '[REDACTED]';
                }
            }
        }
        return result;
    }
}
//# sourceMappingURL=SpanRedactor.js.map