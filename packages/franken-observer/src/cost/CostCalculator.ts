import type { PricingTable } from './defaultPricing.js'
import type { TokenRecord } from './TokenCounter.js'

export interface CostCalculatorOptions {
  onUnknownModel?: (model: string) => void
}

export class CostCalculator {
  private readonly warnedModels = new Set<string>()
  private readonly onUnknownModel: (model: string) => void

  constructor(
    private readonly pricing: PricingTable,
    options?: CostCalculatorOptions,
  ) {
    this.onUnknownModel =
      options?.onUnknownModel ??
      ((model) => console.warn(`[CostCalculator] Unknown model "${model}" — cost will be 0. Add it to the pricing table.`))
  }

  calculate(entry: TokenRecord): number {
    const model = this.pricing[entry.model]
    if (model === undefined) {
      if (!this.warnedModels.has(entry.model)) {
        this.warnedModels.add(entry.model)
        this.onUnknownModel(entry.model)
      }
      return 0
    }
    return (
      (entry.promptTokens / 1_000_000) * model.promptPerMillion +
      (entry.completionTokens / 1_000_000) * model.completionPerMillion
    )
  }

  totalCost(entries: TokenRecord[]): number {
    return entries.reduce((sum, entry) => sum + this.calculate(entry), 0)
  }
}
