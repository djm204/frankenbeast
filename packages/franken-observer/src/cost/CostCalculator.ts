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

  private static safeAddTokenCounts(a: number, b: number): number {
    const sum = a + b
    if (!Number.isSafeInteger(sum)) {
      throw new RangeError(
        `CostCalculator: token total ${sum} exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`,
      )
    }
    return sum
  }

  private static assertValidTokenAggregates(entries: TokenRecord[]): void {
    let promptTokens = 0
    let completionTokens = 0
    let cacheReadTokens = 0
    let cacheCreationTokens = 0
    let cacheCreation1hTokens = 0

    for (const entry of entries) {
      const cacheRead = entry.cacheReadTokens ?? 0
      const cacheCreation = entry.cacheCreationTokens ?? 0
      const cacheCreation1h = entry.cacheCreation1hTokens ?? 0
      CostCalculator.assertValidTokenCount(entry.promptTokens, 'promptTokens')
      CostCalculator.assertValidTokenCount(entry.completionTokens, 'completionTokens')
      CostCalculator.assertValidTokenCount(cacheRead, 'cacheReadTokens')
      CostCalculator.assertValidTokenCount(cacheCreation, 'cacheCreationTokens')
      CostCalculator.assertValidTokenCount(cacheCreation1h, 'cacheCreation1hTokens')
      if (cacheCreation1h > cacheCreation) {
        throw new RangeError('CostCalculator: cacheCreation1hTokens must not exceed cacheCreationTokens')
      }
      promptTokens = CostCalculator.safeAddTokenCounts(promptTokens, entry.promptTokens)
      completionTokens = CostCalculator.safeAddTokenCounts(completionTokens, entry.completionTokens)
      cacheReadTokens = CostCalculator.safeAddTokenCounts(cacheReadTokens, cacheRead)
      cacheCreationTokens = CostCalculator.safeAddTokenCounts(cacheCreationTokens, cacheCreation)
      cacheCreation1hTokens = CostCalculator.safeAddTokenCounts(
        cacheCreation1hTokens,
        cacheCreation1h,
      )
      const uncached = CostCalculator.safeAddTokenCounts(promptTokens, completionTokens)
      const cached = CostCalculator.safeAddTokenCounts(cacheReadTokens, cacheCreationTokens)
      CostCalculator.safeAddTokenCounts(uncached, cached)
    }
  }

  calculate(entry: TokenRecord): number {
    return this.calculateWithAttribution(entry).costUsd
  }

  calculateWithAttribution(entry: TokenRecord): CostCalculation {
    const cacheReadTokens = entry.cacheReadTokens ?? 0
    const cacheCreationTokens = entry.cacheCreationTokens ?? 0
    const cacheCreation1hTokens = entry.cacheCreation1hTokens ?? 0
    CostCalculator.assertValidTokenCount(entry.promptTokens, 'promptTokens')
    CostCalculator.assertValidTokenCount(entry.completionTokens, 'completionTokens')
    CostCalculator.assertValidTokenCount(cacheReadTokens, 'cacheReadTokens')
    CostCalculator.assertValidTokenCount(cacheCreationTokens, 'cacheCreationTokens')
    CostCalculator.assertValidTokenCount(cacheCreation1hTokens, 'cacheCreation1hTokens')
    if (cacheCreation1hTokens > cacheCreationTokens) {
      throw new RangeError('CostCalculator: cacheCreation1hTokens must not exceed cacheCreationTokens')
    }

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
        (entry.completionTokens * model.completionPerMillion) / 1_000_000 +
        (cacheReadTokens * (model.cacheReadPerMillion ?? model.promptPerMillion)) / 1_000_000 +
        ((cacheCreationTokens - cacheCreation1hTokens) *
          (model.cacheCreationPerMillion ?? model.promptPerMillion)) /
          1_000_000 +
        (cacheCreation1hTokens *
          (model.cacheCreation1hPerMillion ??
            model.cacheCreationPerMillion ??
            model.promptPerMillion)) /
          1_000_000,
      unknownModel: false,
    }
  }

  totalCost(entries: TokenRecord[]): number {
    return this.totalCostWithAttribution(entries).costUsd
  }

  totalCostWithAttribution(entries: TokenRecord[]): TotalCostCalculation {
    // Validate the full snapshot before calculating costs so no invalid aggregate
    // can produce a partial result or unknown-model warning side effect.
    CostCalculator.assertValidTokenAggregates(entries)

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
