import { CostCalculator } from './CostCalculator.js'
import type { PricingTable } from './defaultPricing.js'

export interface AttributionEntry {
  model: string
  promptTokens: number
  completionTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
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
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface ModelAttributionOptions {
  /** Maximum number of distinct model labels retained by this attribution report. */
  maxModels?: number
}

const DEFAULT_MAX_MODELS = 1_000

export class ModelAttribution {
  private readonly calc: CostCalculator
  private readonly state = new Map<string, ModelState>()
  private readonly maxModels: number
  private totalPromptTokens = 0
  private totalCompletionTokens = 0
  private totalCacheReadTokens = 0
  private totalCacheCreationTokens = 0

  constructor(pricing: PricingTable, options: ModelAttributionOptions = {}) {
    const maxModels = options.maxModels ?? DEFAULT_MAX_MODELS
    if (!Number.isSafeInteger(maxModels) || maxModels <= 0) {
      throw new RangeError(
        `ModelAttribution: maxModels must be a positive safe integer, received ${maxModels}`,
      )
    }
    this.calc = new CostCalculator(pricing)
    this.maxModels = maxModels
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
    const cacheReadDelta = entry.cacheReadTokens ?? 0
    const cacheCreationDelta = entry.cacheCreationTokens ?? 0
    ModelAttribution.assertValidDelta(cacheReadDelta, 'cacheReadTokens')
    ModelAttribution.assertValidDelta(cacheCreationDelta, 'cacheCreationTokens')
    if (!this.state.has(entry.model) && this.state.size >= this.maxModels) {
      throw new RangeError(
        `ModelAttribution: model cardinality limit of ${this.maxModels} reached; rejected model "${entry.model}"`,
      )
    }

    const existing = this.state.get(entry.model) ?? {
      totalCalls: 0,
      successfulCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }
    const promptTokens = ModelAttribution.safeAdd(existing.promptTokens, entry.promptTokens)
    const completionTokens = ModelAttribution.safeAdd(existing.completionTokens, entry.completionTokens)
    const cacheReadTokens = ModelAttribution.safeAdd(existing.cacheReadTokens, cacheReadDelta)
    const cacheCreationTokens = ModelAttribution.safeAdd(
      existing.cacheCreationTokens,
      cacheCreationDelta,
    )
    const inputTokens = ModelAttribution.safeAdd(promptTokens, cacheReadTokens)
    const reusableInputTokens = ModelAttribution.safeAdd(inputTokens, cacheCreationTokens)
    ModelAttribution.safeAdd(reusableInputTokens, completionTokens)

    const totalPromptTokens = ModelAttribution.safeAdd(this.totalPromptTokens, entry.promptTokens)
    const totalCompletionTokens = ModelAttribution.safeAdd(this.totalCompletionTokens, entry.completionTokens)
    const totalCacheReadTokens = ModelAttribution.safeAdd(
      this.totalCacheReadTokens,
      cacheReadDelta,
    )
    const totalCacheCreationTokens = ModelAttribution.safeAdd(
      this.totalCacheCreationTokens,
      cacheCreationDelta,
    )
    const totalInputTokens = ModelAttribution.safeAdd(totalPromptTokens, totalCacheReadTokens)
    const totalReusableInputTokens = ModelAttribution.safeAdd(
      totalInputTokens,
      totalCacheCreationTokens,
    )
    ModelAttribution.safeAdd(totalReusableInputTokens, totalCompletionTokens)

    this.state.set(entry.model, {
      totalCalls: existing.totalCalls + 1,
      successfulCalls: existing.successfulCalls + (entry.success ? 1 : 0),
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheCreationTokens,
    })
    this.totalPromptTokens = totalPromptTokens
    this.totalCompletionTokens = totalCompletionTokens
    this.totalCacheReadTokens = totalCacheReadTokens
    this.totalCacheCreationTokens = totalCacheCreationTokens
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
        cacheReadTokens: s.cacheReadTokens,
        cacheCreationTokens: s.cacheCreationTokens,
      }),
    }))
  }
}
