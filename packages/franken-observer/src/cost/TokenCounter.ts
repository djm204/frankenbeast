export interface TokenRecord {
  model: string
  promptTokens: number
  completionTokens: number
}

export interface TokenTotals {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export class TokenCounter {
  private readonly counts = new Map<string, { prompt: number; completion: number }>()

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
    TokenCounter.assertValidDelta(entry.promptTokens, 'promptTokens')
    TokenCounter.assertValidDelta(entry.completionTokens, 'completionTokens')
    const existing = this.counts.get(entry.model) ?? { prompt: 0, completion: 0 }
    const prompt = TokenCounter.safeAdd(existing.prompt, entry.promptTokens)
    const completion = TokenCounter.safeAdd(existing.completion, entry.completionTokens)
    // Validate the combined per-model total up-front so a record whose
    // prompt+completion overflows the safe-integer range is rejected here,
    // atomically, instead of poisoning later totalsFor() reads.
    TokenCounter.safeAdd(prompt, completion)
    // Also validate the new global totals: a second model could otherwise push
    // grandTotal() past the safe-integer range even when every per-model total
    // is safe (e.g. model A with MAX_SAFE_INTEGER prompt, model B with 1). The
    // current stored state is always valid, so grandTotal() will not throw here.
    const global = this.grandTotal()
    const globalPrompt = TokenCounter.safeAdd(global.promptTokens, entry.promptTokens)
    const globalCompletion = TokenCounter.safeAdd(global.completionTokens, entry.completionTokens)
    TokenCounter.safeAdd(globalPrompt, globalCompletion)
    this.counts.set(entry.model, { prompt, completion })
  }

  totalsFor(model: string): TokenTotals {
    const entry = this.counts.get(model) ?? { prompt: 0, completion: 0 }
    return {
      promptTokens: entry.prompt,
      completionTokens: entry.completion,
      totalTokens: TokenCounter.safeAdd(entry.prompt, entry.completion),
    }
  }

  grandTotal(): TokenTotals {
    let prompt = 0
    let completion = 0
    for (const entry of this.counts.values()) {
      prompt = TokenCounter.safeAdd(prompt, entry.prompt)
      completion = TokenCounter.safeAdd(completion, entry.completion)
    }
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: TokenCounter.safeAdd(prompt, completion),
    }
  }

  allModels(): string[] {
    return Array.from(this.counts.keys())
  }

  reset(): void {
    this.counts.clear()
  }
}
