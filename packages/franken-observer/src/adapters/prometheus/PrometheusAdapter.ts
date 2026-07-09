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

function escapePrometheusLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
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
  private flushedSpanIdCount = 0

  constructor(options: PrometheusAdapterOptions = {}) {
    this.pricingTable = options.pricingTable
    this.maxDedupeSpans = Math.max(0, Math.floor(options.maxDedupeSpans ?? 10_000))
  }

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'PrometheusAdapter')
    const flushedSpanIds = this.flushedSpanIdsByTrace.get(trace.id)
    const newlyFlushedSpanIds: string[] = []

    for (const span of trace.spans) {
      if (flushedSpanIds?.has(span.id) || span.status === 'active') continue

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
          prompt: existing.prompt + prompt,
          completion: existing.completion + completion,
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
      flushedSpanIds.add(spanId)
      this.flushedSpanIdCount += 1
    }

    this.pruneFlushedSpans(traceId)
  }

  private pruneFlushedSpans(currentTraceId: string): void {
    while (this.flushedSpanIdCount > this.maxDedupeSpans) {
      const oldestTraceId = this.flushedSpanIdsByTrace.keys().next().value as string | undefined
      if (oldestTraceId === undefined) break

      // Keep the trace currently being flushed intact so a retry of a large
      // trace does not evict the next span immediately before it is checked and
      // double-count the trace. Older traces are pruned first; a single large
      // trace may temporarily exceed the configured cap until another trace is
      // flushed.
      if (oldestTraceId === currentTraceId) {
        if (this.flushedSpanIdsByTrace.size === 1) break
        const current = this.flushedSpanIdsByTrace.get(oldestTraceId)
        this.flushedSpanIdsByTrace.delete(oldestTraceId)
        this.flushedSpanIdsByTrace.set(oldestTraceId, current ?? new Set<string>())
        continue
      }

      const pruned = this.flushedSpanIdsByTrace.get(oldestTraceId)
      this.flushedSpanIdCount -= pruned?.size ?? 0
      this.flushedSpanIdsByTrace.delete(oldestTraceId)
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
    this.flushedSpanIdCount = 0
  }

  async queryByTraceId(_traceId: string): Promise<Trace | null> {
    return null
  }

  async listTraceIds(): Promise<string[]> {
    return []
  }
}
