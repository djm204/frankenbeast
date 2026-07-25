export interface TokenRecord {
  model: string
  promptTokens: number
  completionTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export interface TokenTotals {
  promptTokens: number
  completionTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
}

export interface CacheHitRatioInput {
  promptTokens: number
  cacheReadTokens: number
}

export function cacheHitRatio(record: CacheHitRatioInput): number {
  const denominator = record.promptTokens + record.cacheReadTokens
  return denominator === 0 ? 0 : record.cacheReadTokens / denominator
}

export interface TokenCounterOptions {
  /** Maximum number of distinct model labels retained by this counter. */
  maxModels?: number
}

const DEFAULT_MAX_MODELS = 1_000

export class TokenCounter {
  private readonly counts = new Map<string, {
    prompt: number
    completion: number
    cacheRead: number
    cacheCreation: number
  }>()
  private readonly maxModels: number
  private totalPromptTokens = 0
  private totalCompletionTokens = 0
  private totalCacheReadTokens = 0
  private totalCacheCreationTokens = 0

  constructor(options: TokenCounterOptions = {}) {
    const maxModels = options.maxModels ?? DEFAULT_MAX_MODELS
    if (!Number.isSafeInteger(maxModels) || maxModels <= 0) {
      throw new RangeError(
        `TokenCounter: maxModels must be a positive safe integer, received ${maxModels}`,
      )
    }
    this.maxModels = maxModels
  }

  /** A token delta must be a non-negative safe integer. */
  private static assertValidDelta(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        `TokenCounter: ${label} must be a non-negative safe integer, received ${value}`,
      )
    }
  }

  /** Add two token counts, throwing if the result would leave the safe-integer range. */
  private static safeAdd(a: number, b: number): number {
    const sum = a + b
    if (!Number.isSafeInteger(sum)) {
      throw new RangeError(
        `TokenCounter: token total ${sum} exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`,
      )
    }
    return sum
  }

  record(entry: TokenRecord): void {
    const cacheReadTokens = entry.cacheReadTokens ?? 0
    const cacheCreationTokens = entry.cacheCreationTokens ?? 0
    TokenCounter.assertValidDelta(entry.promptTokens, 'promptTokens')
    TokenCounter.assertValidDelta(entry.completionTokens, 'completionTokens')
    TokenCounter.assertValidDelta(cacheReadTokens, 'cacheReadTokens')
    TokenCounter.assertValidDelta(cacheCreationTokens, 'cacheCreationTokens')
    if (!this.counts.has(entry.model) && this.counts.size >= this.maxModels) {
      throw new RangeError(
        `TokenCounter: model cardinality limit of ${this.maxModels} reached; rejected model "${entry.model}"`,
      )
    }
    const existing = this.counts.get(entry.model) ?? {
      prompt: 0,
      completion: 0,
      cacheRead: 0,
      cacheCreation: 0,
    }
    const prompt = TokenCounter.safeAdd(existing.prompt, entry.promptTokens)
    const completion = TokenCounter.safeAdd(existing.completion, entry.completionTokens)
    const cacheRead = TokenCounter.safeAdd(existing.cacheRead, cacheReadTokens)
    const cacheCreation = TokenCounter.safeAdd(existing.cacheCreation, cacheCreationTokens)
    // Validate the combined per-model total up-front so a record whose
    // prompt+completion overflows the safe-integer range is rejected here,
    // atomically, instead of poisoning later totalsFor() reads.
    const modelUncached = TokenCounter.safeAdd(prompt, completion)
    const modelCached = TokenCounter.safeAdd(cacheRead, cacheCreation)
    TokenCounter.safeAdd(modelUncached, modelCached)
    // Also validate the new global totals: a second model could otherwise push
    // grandTotal() past the safe-integer range even when every per-model total
    // is safe (e.g. model A with MAX_SAFE_INTEGER prompt, model B with 1). The
    // current stored state is always valid, so grandTotal() will not throw here.
    const globalPrompt = TokenCounter.safeAdd(this.totalPromptTokens, entry.promptTokens)
    const globalCompletion = TokenCounter.safeAdd(this.totalCompletionTokens, entry.completionTokens)
    const globalCacheRead = TokenCounter.safeAdd(this.totalCacheReadTokens, cacheReadTokens)
    const globalCacheCreation = TokenCounter.safeAdd(
      this.totalCacheCreationTokens,
      cacheCreationTokens,
    )
    const globalUncached = TokenCounter.safeAdd(globalPrompt, globalCompletion)
    const globalCached = TokenCounter.safeAdd(globalCacheRead, globalCacheCreation)
    TokenCounter.safeAdd(globalUncached, globalCached)
    this.counts.set(entry.model, { prompt, completion, cacheRead, cacheCreation })
    this.totalPromptTokens = globalPrompt
    this.totalCompletionTokens = globalCompletion
    this.totalCacheReadTokens = globalCacheRead
    this.totalCacheCreationTokens = globalCacheCreation
  }

  totalsFor(model: string): TokenTotals {
    const entry = this.counts.get(model) ?? {
      prompt: 0,
      completion: 0,
      cacheRead: 0,
      cacheCreation: 0,
    }
    const uncached = TokenCounter.safeAdd(entry.prompt, entry.completion)
    const cached = TokenCounter.safeAdd(entry.cacheRead, entry.cacheCreation)
    return {
      promptTokens: entry.prompt,
      completionTokens: entry.completion,
      cacheReadTokens: entry.cacheRead,
      cacheCreationTokens: entry.cacheCreation,
      totalTokens: TokenCounter.safeAdd(uncached, cached),
    }
  }

  grandTotal(): TokenTotals {
    const uncached = TokenCounter.safeAdd(this.totalPromptTokens, this.totalCompletionTokens)
    const cached = TokenCounter.safeAdd(
      this.totalCacheReadTokens,
      this.totalCacheCreationTokens,
    )
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      cacheReadTokens: this.totalCacheReadTokens,
      cacheCreationTokens: this.totalCacheCreationTokens,
      totalTokens: TokenCounter.safeAdd(uncached, cached),
    }
  }

  allModels(): string[] {
    return Array.from(this.counts.keys())
  }

  reset(): void {
    this.counts.clear()
    this.totalPromptTokens = 0
    this.totalCompletionTokens = 0
    this.totalCacheReadTokens = 0
    this.totalCacheCreationTokens = 0
  }
}
