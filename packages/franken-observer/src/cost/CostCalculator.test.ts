import { describe, it, expect, vi } from 'vitest'
import { CostCalculator } from './CostCalculator.js'
import { DEFAULT_PRICING } from './defaultPricing.js'

describe('CostCalculator', () => {
  describe('with default pricing', () => {
    const calc = new CostCalculator(DEFAULT_PRICING)

    it('calculates cost for claude-opus-4-6 using per-million token rates', () => {
      // Opus 4: $15/M prompt, $75/M completion (example rates)
      const cost = calc.calculate({
        model: 'claude-opus-4-6',
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      })
      expect(cost).toBeCloseTo(DEFAULT_PRICING['claude-opus-4-6']!.promptPerMillion + DEFAULT_PRICING['claude-opus-4-6']!.completionPerMillion, 6)
    })

    it('calculates fractional token usage correctly', () => {
      const pricing = DEFAULT_PRICING['claude-sonnet-4-6']!
      const cost = calc.calculate({
        model: 'claude-sonnet-4-6',
        promptTokens: 500_000,
        completionTokens: 250_000,
      })
      const expected =
        (500_000 / 1_000_000) * pricing.promptPerMillion +
        (250_000 / 1_000_000) * pricing.completionPerMillion
      expect(cost).toBeCloseTo(expected, 8)
    })

    it('returns 0 for an unknown model', () => {
      const quietCalc = new CostCalculator(DEFAULT_PRICING, {
        onUnknownModel: () => {},
      })
      const cost = quietCalc.calculate({
        model: 'unknown-model-xyz',
        promptTokens: 1000,
        completionTokens: 500,
      })
      expect(cost).toBe(0)
    })

    it('emits a warning when encountering an unknown model', () => {
      const warnings: string[] = []
      const warnCalc = new CostCalculator(DEFAULT_PRICING, {
        onUnknownModel: (model) => warnings.push(model),
      })
      warnCalc.calculate({ model: 'unknown-model-xyz', promptTokens: 1000, completionTokens: 500 })
      expect(warnings).toEqual(['unknown-model-xyz'])
    })

    it('warns only once per unknown model', () => {
      const warnings: string[] = []
      const warnCalc = new CostCalculator(DEFAULT_PRICING, {
        onUnknownModel: (model) => warnings.push(model),
      })
      warnCalc.calculate({ model: 'unknown-model-xyz', promptTokens: 1000, completionTokens: 500 })
      warnCalc.calculate({ model: 'unknown-model-xyz', promptTokens: 2000, completionTokens: 1000 })
      expect(warnings).toEqual(['unknown-model-xyz'])
    })

    it('warns for each distinct unknown model', () => {
      const warnings: string[] = []
      const warnCalc = new CostCalculator(DEFAULT_PRICING, {
        onUnknownModel: (model) => warnings.push(model),
      })
      warnCalc.calculate({ model: 'unknown-a', promptTokens: 1, completionTokens: 0 })
      warnCalc.calculate({ model: 'unknown-b', promptTokens: 1, completionTokens: 0 })
      expect(warnings).toEqual(['unknown-a', 'unknown-b'])
    })

    it('uses console.warn by default for unknown models', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const defaultCalc = new CostCalculator(DEFAULT_PRICING)
      defaultCalc.calculate({ model: 'some-new-model', promptTokens: 1, completionTokens: 0 })
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('some-new-model'),
      )
      spy.mockRestore()
    })
  })

  describe('with custom pricing', () => {
    it('accepts and uses a custom pricing table', () => {
      const calc = new CostCalculator({
        'my-model': { promptPerMillion: 10, completionPerMillion: 20 },
      })
      const cost = calc.calculate({ model: 'my-model', promptTokens: 1_000_000, completionTokens: 1_000_000 })
      expect(cost).toBeCloseTo(30, 6)
    })
  })

  describe('totalCost()', () => {
    it('sums cost across all models from a TokenCounter snapshot', () => {
      const calc = new CostCalculator(DEFAULT_PRICING)
      const cost = calc.totalCost([
        { model: 'claude-opus-4-6', promptTokens: 1_000_000, completionTokens: 0 },
        { model: 'gpt-4o', promptTokens: 1_000_000, completionTokens: 0 },
      ])
      const expected =
        DEFAULT_PRICING['claude-opus-4-6']!.promptPerMillion +
        DEFAULT_PRICING['gpt-4o']!.promptPerMillion
      expect(cost).toBeCloseTo(expected, 6)
    })

    it('returns 0 for an empty list', () => {
      const calc = new CostCalculator(DEFAULT_PRICING)
      expect(calc.totalCost([])).toBe(0)
    })
  })
})
