import type { Trace } from '../core/types.js';
import type { ExportAdapter } from '../export/ExportAdapter.js';
export type RedactionAction = 'remove' | 'mask';
export interface RedactionRule {
    /**
     * Metadata key to match. A `string` is an exact match; a `RegExp` tests
     * against each key in `span.metadata`.
     */
    key: string | RegExp;
    /** `'remove'` deletes the key; `'mask'` replaces the value with `maskWith`. */
    action: RedactionAction;
    /**
     * Replacement value used when `action` is `'mask'`.
     * Defaults to `'[REDACTED]'`.
     */
    maskWith?: string;
}
export interface SpanRedactorOptions {
    /** Underlying adapter that receives the redacted trace. */
    adapter: ExportAdapter;
    /**
     * Ordered list of redaction rules applied to every span's `metadata` before
     * the trace is flushed. Rules are evaluated independently — a key is affected
     * by every rule that matches it.
     */
    rules: RedactionRule[];
    /**
     * When `true`, `span.thoughtBlocks` is replaced with an empty array on every
     * span before flushing. Useful when thought blocks contain private reasoning
     * that should not leave the local process. Default: `false`.
     */
    redactThoughtBlocks?: boolean;
}
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
export declare class SpanRedactor implements ExportAdapter {
    private readonly inner;
    private readonly rules;
    private readonly redactThoughtBlocks;
    constructor(options: SpanRedactorOptions);
    flush(trace: Trace): Promise<void>;
    queryByTraceId(traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
    private redactSpan;
    private redactMetadata;
}
//# sourceMappingURL=SpanRedactor.d.ts.map