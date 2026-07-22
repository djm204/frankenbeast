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

    it('multiplies small token counts by the rate before scaling to millions', () => {
      const calc = new CostCalculator({
        'small-usage-model': { promptPerMillion: 15, completionPerMillion: 0 },
      })

      const cost = calc.calculate({
        model: 'small-usage-model',
        promptTokens: 1,
        completionTokens: 0,
      })

      expect(cost).toBe((1 * 15) / 1_000_000)
    })

    it('distinguishes an unknown model from a legitimately free model', () => {
      const quietCalc = new CostCalculator(
        { free: { promptPerMillion: 0, completionPerMillion: 0 } },
        { onUnknownModel: () => {} },
      )

      expect(quietCalc.calculateWithAttribution({
        model: 'free',
        promptTokens: 1000,
        completionTokens: 500,
      })).toEqual({ costUsd: 0, unknownModel: false })
      expect(quietCalc.calculateWithAttribution({
        model: 'unknown-model-xyz',
        promptTokens: 1000,
        completionTokens: 500,
      })).toEqual({ costUsd: 0, unknownModel: true })
    })

    it('preserves the legacy numeric result for an unknown model', () => {
      const quietCalc = new CostCalculator(DEFAULT_PRICING, {
        onUnknownModel: () => {},
      })
      expect(quietCalc.calculate({
        model: 'unknown-model-xyz',
        promptTokens: 1000,
        completionTokens: 500,
      })).toBe(0)
    })

    it.each([
      ['negative prompt tokens', { promptTokens: -1, completionTokens: 0 }],
      ['negative completion tokens', { promptTokens: 0, completionTokens: -1 }],
      ['fractional prompt tokens', { promptTokens: 1.5, completionTokens: 0 }],
      ['fractional completion tokens', { promptTokens: 0, completionTokens: 1.5 }],
      ['NaN prompt tokens', { promptTokens: Number.NaN, completionTokens: 0 }],
      ['NaN completion tokens', { promptTokens: 0, completionTokens: Number.NaN }],
      ['infinite prompt tokens', { promptTokens: Number.POSITIVE_INFINITY, completionTokens: 0 }],
      ['infinite completion tokens', { promptTokens: 0, completionTokens: Number.POSITIVE_INFINITY }],
      ['unsafe prompt tokens', { promptTokens: Number.MAX_SAFE_INTEGER + 1, completionTokens: 0 }],
      ['unsafe completion tokens', { promptTokens: 0, completionTokens: Number.MAX_SAFE_INTEGER + 1 }],
    ])('rejects %s before cost calculation', (_name, tokens) => {
      const calc = new CostCalculator(DEFAULT_PRICING)

      expect(() =>
        calc.calculate({
          model: 'gpt-4o',
          promptTokens: tokens.promptTokens,
          completionTokens: tokens.completionTokens,
        }),
      ).toThrow(RangeError)
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

    it('preserves low-order costs when summing mixed magnitudes', () => {
      const calc = new CostCalculator({
        expensive: { promptPerMillion: 10_000_000_000_000_000, completionPerMillion: 0 },
        inexpensive: { promptPerMillion: 100_000, completionPerMillion: 0 },
      })
      const entries = [
        { model: 'expensive', promptTokens: 1_000_000, completionTokens: 0 },
        ...Array.from({ length: 20 }, () => ({
          model: 'inexpensive',
          promptTokens: 1,
          completionTokens: 0,
        })),
      ]

      expect(calc.totalCost(entries)).toBe(10_000_000_000_000_002)
    })

    it('reports distinct unknown models without conflating them with a zero-cost total', () => {
      const calc = new CostCalculator(
        { free: { promptPerMillion: 0, completionPerMillion: 0 } },
        { onUnknownModel: () => {} },
      )

      expect(calc.totalCostWithAttribution([
        { model: 'free', promptTokens: 100, completionTokens: 50 },
        { model: 'unknown-a', promptTokens: 100, completionTokens: 50 },
        { model: 'unknown-a', promptTokens: 200, completionTokens: 100 },
        { model: 'unknown-b', promptTokens: 100, completionTokens: 50 },
      ])).toEqual({
        costUsd: 0,
        unknownModelCount: 2,
        unknownModels: ['unknown-a', 'unknown-b'],
      })
    })

    it.each([
      [
        'prompt token aggregate',
        [
          { model: 'gpt-4o', promptTokens: Number.MAX_SAFE_INTEGER, completionTokens: 0 },
          { model: 'gpt-4o', promptTokens: 1, completionTokens: 0 },
        ],
      ],
      [
        'completion token aggregate',
        [
          { model: 'gpt-4o', promptTokens: 0, completionTokens: Number.MAX_SAFE_INTEGER },
          { model: 'gpt-4o', promptTokens: 0, completionTokens: 1 },
        ],
      ],
      [
        'combined prompt and completion aggregate',
        [
          {
            model: 'gpt-4o',
            promptTokens: Number.MAX_SAFE_INTEGER,
            completionTokens: 1,
          },
        ],
      ],
    ])('rejects an unsafe %s', (_name, entries) => {
      const calc = new CostCalculator(DEFAULT_PRICING)

      expect(() => calc.totalCost(entries)).toThrow(RangeError)
    })

    it('validates token aggregates before reporting unknown models', () => {
      const onUnknownModel = vi.fn()
      const calc = new CostCalculator(DEFAULT_PRICING, { onUnknownModel })

      expect(() => calc.totalCost([
        {
          model: 'unknown-model',
          promptTokens: Number.MAX_SAFE_INTEGER,
          completionTokens: 1,
        },
      ])).toThrow(RangeError)
      expect(onUnknownModel).not.toHaveBeenCalled()
    })

    it('returns 0 for an empty list', () => {
      const calc = new CostCalculator(DEFAULT_PRICING)
      expect(calc.totalCost([])).toBe(0)
    })
  })
})
