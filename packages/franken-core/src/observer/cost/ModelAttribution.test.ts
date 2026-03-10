import { describe, it, expect } from 'vitest'
import { ModelAttribution } from './ModelAttribution.js'
import { DEFAULT_PRICING } from './defaultPricing.js'

describe('ModelAttribution', () => {
  describe('record()', () => {
    it('records a call outcome for a model', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      attr.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50, success: true })
      const report = attr.report()
      expect(report).toHaveLength(1)
      expect(report[0]!.model).toBe('claude-opus-4-6')
    })

    it('accumulates call counts across multiple records', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      attr.record({ model: 'gpt-4o', promptTokens: 100, completionTokens: 50, success: true })
      attr.record({ model: 'gpt-4o', promptTokens: 200, completionTokens: 100, success: false })
      const row = attr.report().find(r => r.model === 'gpt-4o')!
      expect(row.totalCalls).toBe(2)
      expect(row.successfulCalls).toBe(1)
      expect(row.failedCalls).toBe(1)
    })
  })

  describe('report()', () => {
    it('includes successRate as a fraction between 0 and 1', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      attr.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50, success: true })
      attr.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50, success: true })
      attr.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50, success: false })
      const row = attr.report().find(r => r.model === 'claude-opus-4-6')!
      expect(row.successRate).toBeCloseTo(2 / 3, 5)
    })

    it('includes totalCostUsd calculated from the pricing table', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      attr.record({ model: 'claude-opus-4-6', promptTokens: 1_000_000, completionTokens: 0, success: true })
      const row = attr.report().find(r => r.model === 'claude-opus-4-6')!
      expect(row.totalCostUsd).toBeCloseTo(DEFAULT_PRICING['claude-opus-4-6']!.promptPerMillion, 6)
    })

    it('returns an empty array when nothing has been recorded', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      expect(attr.report()).toEqual([])
    })

    it('reports multiple models independently', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      attr.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50, success: true })
      attr.record({ model: 'gpt-4o', promptTokens: 200, completionTokens: 100, success: false })
      const report = attr.report()
      expect(report).toHaveLength(2)
    })

    it('successRate is 0 when all calls failed', () => {
      const attr = new ModelAttribution(DEFAULT_PRICING)
      attr.record({ model: 'gpt-4o', promptTokens: 100, completionTokens: 50, success: false })
      const row = attr.report().find(r => r.model === 'gpt-4o')!
      expect(row.successRate).toBe(0)
    })
  })
})
