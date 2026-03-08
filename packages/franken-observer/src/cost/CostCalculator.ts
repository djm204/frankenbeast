import type { PricingTable } from './defaultPricing.js'
import type { TokenRecord } from './TokenCounter.js'

export class CostCalculator {
  constructor(private readonly pricing: PricingTable) {}

  calculate(entry: TokenRecord): number {
    const model = this.pricing[entry.model]
    if (model === undefined) return 0
    return (
      (entry.promptTokens / 1_000_000) * model.promptPerMillion +
      (entry.completionTokens / 1_000_000) * model.completionPerMillion
    )
  }

  totalCost(entries: TokenRecord[]): number {
    return entries.reduce((sum, entry) => sum + this.calculate(entry), 0)
  }
}
