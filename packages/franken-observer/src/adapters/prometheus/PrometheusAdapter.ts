import type { ExportAdapter } from '../../export/ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from '../../export/ExportAdapter.js'
import type { Trace } from '../../core/types.js'
import type { PricingTable } from '../../cost/defaultPricing.js'

export interface PrometheusAdapterOptions {
  /** Optional pricing table for cost metrics. If absent, cost lines are omitted. */
  pricingTable?: PricingTable
  /** Maximum recent span ids retained to make repeated trace flushes idempotent. */
  maxDedupeSpans?: number
}

interface TokenCounts {
  prompt: number
  completion: number
}

interface FlushedSpanEntry {
  traceId: string
  spanId: string
}

function escapePrometheusLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
}

function assertValidTokenDelta(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `PrometheusAdapter: ${label} must be a non-negative safe integer, received ${value}`,
    )
  }
}

function safeAddTokenCounter(current: number, delta: number, label: string): number {
  const next = current + delta
  if (!Number.isSafeInteger(next)) {
    throw new RangeError(
      `PrometheusAdapter: ${label} total ${next} exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`,
    )
  }
  return next
}

/**
 * Write-only ExportAdapter that accumulates token, span, and (optionally)
 * cost counters from flushed traces and exposes them in Prometheus text
 * format via scrape(). Intended to be consumed by a /metrics HTTP handler
 * or a push-gateway client.
 *
 * queryByTraceId / listTraceIds return null / [] — Prometheus is a push-only
 * sink from this SDK's perspective.
 */
export class PrometheusAdapter implements ExportAdapter {
  private readonly pricingTable: PricingTable | undefined
  private readonly maxDedupeSpans: number
  private tokenCounters = new Map<string, TokenCounts>()
  private spanCounters = new Map<string, number>()
  private costCounters = new Map<string, number>()
  private flushedSpanIdsByTrace = new Map<string, Set<string>>()
  private flushedSpanInsertionOrder = new Map<string, FlushedSpanEntry>()
  private flushedSpanIdCount = 0

  constructor(options: PrometheusAdapterOptions = {}) {
    this.pricingTable = options.pricingTable
    this.maxDedupeSpans = Math.max(0, Math.floor(options.maxDedupeSpans ?? 10_000))
  }

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'PrometheusAdapter')
    const flushedSpanIds = this.flushedSpanIdsByTrace.get(trace.id)
    const flushableSpans = trace.spans.filter(
      span => !(flushedSpanIds?.has(span.id) ?? false) && span.status !== 'active',
    )

    // Validate token metadata before mutating any counters. A malformed span in
    // a batch must not partially advance span/token/cost counters or poison the
    // repeated-flush dedupe cache.
    const pendingTokenCounters = new Map<string, TokenCounts>()
    for (const [model, counts] of this.tokenCounters) {
      pendingTokenCounters.set(model, { ...counts })
    }

    for (const span of flushableSpans) {
      const model = span.metadata['model']
      if (typeof model !== 'string') continue

      const promptTokens = span.metadata['promptTokens']
      const completionTokens = span.metadata['completionTokens']
      if (typeof promptTokens === 'number') {
        assertValidTokenDelta(promptTokens, 'promptTokens')
      }
      if (typeof completionTokens === 'number') {
        assertValidTokenDelta(completionTokens, 'completionTokens')
      }
      if (typeof promptTokens !== 'number' && typeof completionTokens !== 'number') continue

      const prompt = typeof promptTokens === 'number' ? promptTokens : 0
      const completion = typeof completionTokens === 'number' ? completionTokens : 0
      const existing = pendingTokenCounters.get(model) ?? { prompt: 0, completion: 0 }
      const nextPrompt = safeAddTokenCounter(existing.prompt, prompt, `${model} prompt`)
      const nextCompletion = safeAddTokenCounter(
        existing.completion,
        completion,
        `${model} completion`,
      )
      safeAddTokenCounter(nextPrompt, nextCompletion, `${model} token`)
      pendingTokenCounters.set(model, { prompt: nextPrompt, completion: nextCompletion })
    }

    const newlyFlushedSpanIds: string[] = []

    for (const span of flushableSpans) {
      // Span status counter
      this.spanCounters.set(span.status, (this.spanCounters.get(span.status) ?? 0) + 1)

      // Token counters — only counted when both a model label and at least
      // one token field are present in span metadata
      const model = span.metadata['model']
      const promptTokens = span.metadata['promptTokens']
      const completionTokens = span.metadata['completionTokens']

      if (
        typeof model === 'string' &&
        (typeof promptTokens === 'number' || typeof completionTokens === 'number')
      ) {
        const prompt = typeof promptTokens === 'number' ? promptTokens : 0
        const completion = typeof completionTokens === 'number' ? completionTokens : 0

        const existing = this.tokenCounters.get(model) ?? { prompt: 0, completion: 0 }
        this.tokenCounters.set(model, {
          prompt: safeAddTokenCounter(existing.prompt, prompt, `${model} prompt`),
          completion: safeAddTokenCounter(existing.completion, completion, `${model} completion`),
        })

        // Cost counter — only when pricing table covers this model
        if (this.pricingTable?.[model]) {
          const pricing = this.pricingTable[model]
          const cost =
            (prompt / 1_000_000) * pricing.promptPerMillion +
            (completion / 1_000_000) * pricing.completionPerMillion
          this.costCounters.set(model, (this.costCounters.get(model) ?? 0) + cost)
        }
      }

      newlyFlushedSpanIds.push(span.id)
    }

    this.rememberFlushedSpans(trace.id, newlyFlushedSpanIds)
  }

  private rememberFlushedSpans(traceId: string, spanIds: string[]): void {
    if (this.maxDedupeSpans === 0 || spanIds.length === 0) return

    let flushedSpanIds = this.flushedSpanIdsByTrace.get(traceId)
    if (flushedSpanIds === undefined) {
      flushedSpanIds = new Set<string>()
      this.flushedSpanIdsByTrace.set(traceId, flushedSpanIds)
    }

    for (const spanId of spanIds) {
      if (flushedSpanIds.has(spanId)) continue
      const spanKey = `${traceId}\u0000${spanId}`
      flushedSpanIds.add(spanId)
      this.flushedSpanInsertionOrder.set(spanKey, { traceId, spanId })
      this.flushedSpanIdCount += 1
    }

    this.pruneFlushedSpans(traceId)
  }

  private pruneFlushedSpans(currentTraceId: string): void {
    while (this.flushedSpanIdCount > this.maxDedupeSpans) {
      let pruned = false

      for (const [spanKey, entry] of this.flushedSpanInsertionOrder) {
        // Keep the trace currently being flushed intact so a retry of a large
        // trace does not evict the next span immediately before it is checked and
        // double-count the trace. Older individual span ids from other traces are
        // pruned first; a single large current trace may temporarily exceed the
        // configured cap until another trace is flushed.
        if (entry.traceId === currentTraceId) continue

        this.flushedSpanInsertionOrder.delete(spanKey)
        const traceSpanIds = this.flushedSpanIdsByTrace.get(entry.traceId)
        traceSpanIds?.delete(entry.spanId)
        if (traceSpanIds?.size === 0) {
          this.flushedSpanIdsByTrace.delete(entry.traceId)
        }
        this.flushedSpanIdCount -= 1
        pruned = true
        break
      }

      if (!pruned) break
    }
  }

  /**
   * Returns Prometheus text format (https://prometheus.io/docs/instrumenting/exposition_formats/).
   * Returns an empty string if no data has been flushed since construction or last reset().
   */
  scrape(): string {
    const lines: string[] = []

    if (this.tokenCounters.size > 0) {
      lines.push('# HELP franken_observer_tokens_total Total tokens processed by model and type')
      lines.push('# TYPE franken_observer_tokens_total counter')
      for (const [model, counts] of this.tokenCounters) {
        const escapedModel = escapePrometheusLabelValue(model)
        lines.push(
          `franken_observer_tokens_total{model="${escapedModel}",type="prompt"} ${counts.prompt}`,
        )
        lines.push(
          `franken_observer_tokens_total{model="${escapedModel}",type="completion"} ${counts.completion}`,
        )
      }
    }

    if (this.spanCounters.size > 0) {
      lines.push('# HELP franken_observer_spans_total Total spans recorded by status')
      lines.push('# TYPE franken_observer_spans_total counter')
      for (const [status, count] of this.spanCounters) {
        const escapedStatus = escapePrometheusLabelValue(status)
        lines.push(`franken_observer_spans_total{status="${escapedStatus}"} ${count}`)
      }
    }

    if (this.costCounters.size > 0) {
      lines.push('# HELP franken_observer_cost_usd_total Total cost in USD by model')
      lines.push('# TYPE franken_observer_cost_usd_total counter')
      for (const [model, cost] of this.costCounters) {
        const escapedModel = escapePrometheusLabelValue(model)
        lines.push(`franken_observer_cost_usd_total{model="${escapedModel}"} ${cost}`)
      }
    }

    return lines.join('\n')
  }

  /** Clears all accumulated counters. Useful for testing and metric resets. */
  reset(): void {
    this.tokenCounters.clear()
    this.spanCounters.clear()
    this.costCounters.clear()
    this.flushedSpanIdsByTrace.clear()
    this.flushedSpanInsertionOrder.clear()
    this.flushedSpanIdCount = 0
  }

  async queryByTraceId(_traceId: string): Promise<Trace | null> {
    return null
  }

  async listTraceIds(): Promise<string[]> {
    return []
  }
}
