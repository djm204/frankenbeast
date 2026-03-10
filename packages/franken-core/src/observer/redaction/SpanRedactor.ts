import type { Trace, Span } from '../core/types.js'
import type { ExportAdapter } from '../export/ExportAdapter.js'

// ── Rule types ────────────────────────────────────────────────────────────────

export type RedactionAction = 'remove' | 'mask'

export interface RedactionRule {
  /**
   * Metadata key to match. A `string` is an exact match; a `RegExp` tests
   * against each key in `span.metadata`.
   */
  key: string | RegExp
  /** `'remove'` deletes the key; `'mask'` replaces the value with `maskWith`. */
  action: RedactionAction
  /**
   * Replacement value used when `action` is `'mask'`.
   * Defaults to `'[REDACTED]'`.
   */
  maskWith?: string
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface SpanRedactorOptions {
  /** Underlying adapter that receives the redacted trace. */
  adapter: ExportAdapter
  /**
   * Ordered list of redaction rules applied to every span's `metadata` before
   * the trace is flushed. Rules are evaluated independently — a key is affected
   * by every rule that matches it.
   */
  rules: RedactionRule[]
  /**
   * When `true`, `span.thoughtBlocks` is replaced with an empty array on every
   * span before flushing. Useful when thought blocks contain private reasoning
   * that should not leave the local process. Default: `false`.
   */
  redactThoughtBlocks?: boolean
}

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
export class SpanRedactor implements ExportAdapter {
  private readonly inner: ExportAdapter
  private readonly rules: RedactionRule[]
  private readonly redactThoughtBlocks: boolean

  constructor(options: SpanRedactorOptions) {
    this.inner = options.adapter
    this.rules = options.rules
    this.redactThoughtBlocks = options.redactThoughtBlocks ?? false
  }

  async flush(trace: Trace): Promise<void> {
    const redacted: Trace = {
      ...trace,
      spans: trace.spans.map(span => this.redactSpan(span)),
    }
    await this.inner.flush(redacted)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.inner.queryByTraceId(traceId)
  }

  async listTraceIds(): Promise<string[]> {
    return this.inner.listTraceIds()
  }

  // ── private ───────────────────────────────────────────────────────────────

  private redactSpan(span: Span): Span {
    const metadata = this.redactMetadata(span.metadata)
    const thoughtBlocks = this.redactThoughtBlocks ? [] : span.thoughtBlocks
    if (metadata === span.metadata && thoughtBlocks === span.thoughtBlocks) return span
    return { ...span, metadata, thoughtBlocks }
  }

  private redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    if (this.rules.length === 0) return metadata

    const result: Record<string, unknown> = { ...metadata }
    for (const [key] of Object.entries(metadata)) {
      for (const rule of this.rules) {
        const matches =
          typeof rule.key === 'string' ? rule.key === key : rule.key.test(key)
        if (!matches) continue
        if (rule.action === 'remove') {
          delete result[key]
        } else {
          result[key] = rule.maskWith ?? '[REDACTED]'
        }
      }
    }
    return result
  }
}
