import type { PricingTable } from './defaultPricing.js'
import type { TokenRecord } from './TokenCounter.js'

export interface CostCalculatorOptions {
  onUnknownModel?: (model: string) => void
}

/** Structured result for callers that must distinguish unpriced usage from a priced zero. */
export interface CostCalculation {
  costUsd: number
  unknownModel: boolean
}

/** Structured aggregate with distinct unknown model labels in first-seen order. */
export interface TotalCostCalculation {
  costUsd: number
  unknownModelCount: number
  unknownModels: string[]
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

  private static assertValidTokenCount(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        `CostCalculator: ${label} must be a non-negative safe integer, received ${value}`,
      )
    }
  }

  calculate(entry: TokenRecord): number {
    return this.calculateWithAttribution(entry).costUsd
  }

  calculateWithAttribution(entry: TokenRecord): CostCalculation {
    CostCalculator.assertValidTokenCount(entry.promptTokens, 'promptTokens')
    CostCalculator.assertValidTokenCount(entry.completionTokens, 'completionTokens')

    const model = this.pricing[entry.model]
    if (model === undefined) {
      if (!this.warnedModels.has(entry.model)) {
        this.warnedModels.add(entry.model)
        this.onUnknownModel(entry.model)
      }
      return { costUsd: 0, unknownModel: true }
    }
    return {
      costUsd:
        (entry.promptTokens * model.promptPerMillion) / 1_000_000 +
        (entry.completionTokens * model.completionPerMillion) / 1_000_000,
      unknownModel: false,
    }
  }

  totalCost(entries: TokenRecord[]): number {
    return this.totalCostWithAttribution(entries).costUsd
  }

  totalCostWithAttribution(entries: TokenRecord[]): TotalCostCalculation {
    let sum = 0
    let compensation = 0
    const unknownModels = new Set<string>()

    for (const entry of entries) {
      const result = this.calculateWithAttribution(entry)
      const cost = result.costUsd
      if (result.unknownModel) {
        unknownModels.add(entry.model)
      }
      const next = sum + cost

      // Neumaier summation preserves low-order costs that direct addition loses
      // when a snapshot mixes values with very different magnitudes.
      if (Math.abs(sum) >= Math.abs(cost)) {
        compensation += (sum - next) + cost
      } else {
        compensation += (cost - next) + sum
      }
      sum = next
    }

    return {
      costUsd: sum + compensation,
      unknownModelCount: unknownModels.size,
      unknownModels: Array.from(unknownModels),
    }
  }
}
