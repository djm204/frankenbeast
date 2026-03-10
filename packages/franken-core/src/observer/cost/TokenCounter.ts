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

  record(entry: TokenRecord): void {
    const existing = this.counts.get(entry.model) ?? { prompt: 0, completion: 0 }
    this.counts.set(entry.model, {
      prompt: existing.prompt + entry.promptTokens,
      completion: existing.completion + entry.completionTokens,
    })
  }

  totalsFor(model: string): TokenTotals {
    const entry = this.counts.get(model) ?? { prompt: 0, completion: 0 }
    return {
      promptTokens: entry.prompt,
      completionTokens: entry.completion,
      totalTokens: entry.prompt + entry.completion,
    }
  }

  grandTotal(): TokenTotals {
    let prompt = 0
    let completion = 0
    for (const entry of this.counts.values()) {
      prompt += entry.prompt
      completion += entry.completion
    }
    return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion }
  }

  allModels(): string[] {
    return Array.from(this.counts.keys())
  }

  reset(): void {
    this.counts.clear()
  }
}
