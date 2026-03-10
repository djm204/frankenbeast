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

  record(entry: AttributionEntry): void {
    const existing = this.state.get(entry.model) ?? {
      totalCalls: 0,
      successfulCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
    this.state.set(entry.model, {
      totalCalls: existing.totalCalls + 1,
      successfulCalls: existing.successfulCalls + (entry.success ? 1 : 0),
      promptTokens: existing.promptTokens + entry.promptTokens,
      completionTokens: existing.completionTokens + entry.completionTokens,
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
