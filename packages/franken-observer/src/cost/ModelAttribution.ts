import { CostCalculator } from './CostCalculator.js'
import type { PricingTable } from './defaultPricing.js'

export interface AttributionEntry {
  model: string
  promptTokens: number
  completionTokens: number
  success: boolean
}

export interface AttributionRow {
  model: string
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  successRate: number
  totalCostUsd: number
}

interface ModelState {
  totalCalls: number
  successfulCalls: number
  promptTokens: number
  completionTokens: number
}

export class ModelAttribution {
  private readonly calc: CostCalculator
  private readonly state = new Map<string, ModelState>()

  constructor(pricing: PricingTable) {
    this.calc = new CostCalculator(pricing)
  }

  /** A token delta must be a non-negative safe integer. */
  private static assertValidDelta(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        `ModelAttribution: ${label} must be a non-negative safe integer, received ${value}`,
      )
    }
  }

  /** Add two token counts, throwing if the result would leave the safe-integer range. */
  private static safeAdd(a: number, b: number): number {
    const sum = a + b
    if (!Number.isSafeInteger(sum)) {
      throw new RangeError(
        `ModelAttribution: token total ${sum} exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`,
      )
    }
    return sum
  }

  record(entry: AttributionEntry): void {
    ModelAttribution.assertValidDelta(entry.promptTokens, 'promptTokens')
    ModelAttribution.assertValidDelta(entry.completionTokens, 'completionTokens')

    const existing = this.state.get(entry.model) ?? {
      totalCalls: 0,
      successfulCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
    const promptTokens = ModelAttribution.safeAdd(existing.promptTokens, entry.promptTokens)
    const completionTokens = ModelAttribution.safeAdd(existing.completionTokens, entry.completionTokens)
    ModelAttribution.safeAdd(promptTokens, completionTokens)

    this.state.set(entry.model, {
      totalCalls: existing.totalCalls + 1,
      successfulCalls: existing.successfulCalls + (entry.success ? 1 : 0),
      promptTokens,
      completionTokens,
    })
  }

  report(): AttributionRow[] {
    return Array.from(this.state.entries()).map(([model, s]) => ({
      model,
      totalCalls: s.totalCalls,
      successfulCalls: s.successfulCalls,
      failedCalls: s.totalCalls - s.successfulCalls,
      successRate: s.totalCalls === 0 ? 0 : s.successfulCalls / s.totalCalls,
      totalCostUsd: this.calc.calculate({
        model,
        promptTokens: s.promptTokens,
        completionTokens: s.completionTokens,
      }),
    }))
  }
}
