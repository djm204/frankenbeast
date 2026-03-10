import { describe, it, expect } from 'vitest'
import { TraceContext } from '../../core/TraceContext.js'
import { SpanLifecycle } from '../../core/SpanLifecycle.js'
import { PrometheusAdapter } from './PrometheusAdapter.js'

function makeTrace(
  model = 'claude-sonnet-4-6',
  promptTokens = 200,
  completionTokens = 100,
) {
  const trace = TraceContext.createTrace('test')
  const span = TraceContext.startSpan(trace, { name: 'llm-call' })
  SpanLifecycle.recordTokenUsage(span, { promptTokens, completionTokens, model })
  TraceContext.endSpan(span)
  TraceContext.endTrace(trace)
  return trace
}

function makeTraceNoModel() {
  const trace = TraceContext.createTrace('bare')
  const span = TraceContext.startSpan(trace, { name: 'no-tokens' })
  TraceContext.endSpan(span)
  TraceContext.endTrace(trace)
  return trace
}

describe('PrometheusAdapter', () => {
  describe('scrape() — token metrics', () => {
    it('returns a non-empty string after a flush', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace())
      expect(adapter.scrape().length).toBeGreaterThan(0)
    })

    it('includes HELP and TYPE lines for franken_observer_tokens_total', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace())
      const out = adapter.scrape()
      expect(out).toContain('# HELP franken_observer_tokens_total')
      expect(out).toContain('# TYPE franken_observer_tokens_total counter')
    })

    it('reports prompt token count with model label', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('claude-opus-4-6', 500, 0))
      const out = adapter.scrape()
      expect(out).toMatch(
        /franken_observer_tokens_total\{model="claude-opus-4-6",type="prompt"\}\s+500/,
      )
    })

    it('reports completion token count with model label', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('gpt-4o', 0, 75))
      const out = adapter.scrape()
      expect(out).toMatch(
        /franken_observer_tokens_total\{model="gpt-4o",type="completion"\}\s+75/,
      )
    })

    it('accumulates tokens across multiple flush() calls for the same model', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('claude-sonnet-4-6', 100, 50))
      await adapter.flush(makeTrace('claude-sonnet-4-6', 200, 100))
      const out = adapter.scrape()
      // 100 + 200 = 300 prompt
      expect(out).toMatch(
        /franken_observer_tokens_total\{model="claude-sonnet-4-6",type="prompt"\}\s+300/,
      )
      // 50 + 100 = 150 completion
      expect(out).toMatch(
        /franken_observer_tokens_total\{model="claude-sonnet-4-6",type="completion"\}\s+150/,
      )
    })

    it('tracks multiple models independently', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('claude-sonnet-4-6', 100, 50))
      await adapter.flush(makeTrace('gpt-4o', 200, 80))
      const out = adapter.scrape()
      expect(out).toContain('claude-sonnet-4-6')
      expect(out).toContain('gpt-4o')
    })

    it('skips token metrics for spans without token metadata', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTraceNoModel())
      const out = adapter.scrape()
      // Token section should be absent when no token data recorded
      expect(out).not.toContain('franken_observer_tokens_total')
    })
  })

  describe('scrape() — span metrics', () => {
    it('includes HELP and TYPE lines for franken_observer_spans_total', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace())
      const out = adapter.scrape()
      expect(out).toContain('# HELP franken_observer_spans_total')
      expect(out).toContain('# TYPE franken_observer_spans_total counter')
    })

    it('counts completed spans', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace())
      const out = adapter.scrape()
      expect(out).toMatch(/franken_observer_spans_total\{status="completed"\}\s+1/)
    })

    it('accumulates span counts across flushes', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace())
      await adapter.flush(makeTrace())
      await adapter.flush(makeTrace())
      const out = adapter.scrape()
      expect(out).toMatch(/franken_observer_spans_total\{status="completed"\}\s+3/)
    })
  })

  describe('scrape() — cost metrics', () => {
    it('reports cost_usd_total when a pricingTable is provided', async () => {
      const adapter = new PrometheusAdapter({
        pricingTable: {
          'claude-sonnet-4-6': { promptPerMillion: 3, completionPerMillion: 15 },
        },
      })
      // 1M prompt tokens at $3/M = $3.00 cost
      await adapter.flush(makeTrace('claude-sonnet-4-6', 1_000_000, 0))
      const out = adapter.scrape()
      expect(out).toContain('# HELP franken_observer_cost_usd_total')
      expect(out).toContain('# TYPE franken_observer_cost_usd_total counter')
      expect(out).toMatch(
        /franken_observer_cost_usd_total\{model="claude-sonnet-4-6"\}\s+3/,
      )
    })

    it('accumulates cost across flushes', async () => {
      const adapter = new PrometheusAdapter({
        pricingTable: {
          'claude-sonnet-4-6': { promptPerMillion: 3, completionPerMillion: 15 },
        },
      })
      await adapter.flush(makeTrace('claude-sonnet-4-6', 1_000_000, 0))
      await adapter.flush(makeTrace('claude-sonnet-4-6', 1_000_000, 0))
      const out = adapter.scrape()
      expect(out).toMatch(
        /franken_observer_cost_usd_total\{model="claude-sonnet-4-6"\}\s+6/,
      )
    })

    it('omits cost metrics when no pricingTable is provided', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('claude-sonnet-4-6', 500, 200))
      expect(adapter.scrape()).not.toContain('franken_observer_cost_usd_total')
    })

    it('skips cost for models absent from the pricingTable', async () => {
      const adapter = new PrometheusAdapter({
        pricingTable: { 'claude-sonnet-4-6': { promptPerMillion: 3, completionPerMillion: 15 } },
      })
      await adapter.flush(makeTrace('unknown-model', 500, 200))
      const out = adapter.scrape()
      // Token metrics are still recorded for unknown models
      expect(out).toContain('unknown-model')
      // But no cost_usd line is generated — no price to calculate from
      expect(out).not.toContain('franken_observer_cost_usd_total')
    })
  })

  describe('reset()', () => {
    it('clears all accumulated metrics', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('claude-sonnet-4-6', 500, 200))
      adapter.reset()
      const out = adapter.scrape()
      expect(out).toBe('')
    })

    it('starts accumulating fresh after reset', async () => {
      const adapter = new PrometheusAdapter()
      await adapter.flush(makeTrace('claude-sonnet-4-6', 500, 0))
      adapter.reset()
      await adapter.flush(makeTrace('claude-sonnet-4-6', 100, 0))
      const out = adapter.scrape()
      expect(out).toMatch(
        /franken_observer_tokens_total\{model="claude-sonnet-4-6",type="prompt"\}\s+100/,
      )
    })
  })

  describe('ExportAdapter contract — write-only', () => {
    it('queryByTraceId() returns null', async () => {
      const adapter = new PrometheusAdapter()
      expect(await adapter.queryByTraceId('any-id')).toBeNull()
    })

    it('listTraceIds() returns []', async () => {
      const adapter = new PrometheusAdapter()
      expect(await adapter.listTraceIds()).toEqual([])
    })
  })
})
