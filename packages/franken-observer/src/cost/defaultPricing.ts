export interface ModelPricing {
  /** USD per 1,000,000 prompt tokens */
  promptPerMillion: number
  /** USD per 1,000,000 completion tokens */
  completionPerMillion: number
}

export type PricingTable = Record<string, ModelPricing>

/**
 * Default pricing table (USD, as of 2025-Q4).
 * Override by passing your own PricingTable to CostCalculator.
 */
export const DEFAULT_PRICING: PricingTable = {
  // Anthropic Claude
  'claude-opus-4-6': { promptPerMillion: 15.0, completionPerMillion: 75.0 },
  'claude-sonnet-4-6': { promptPerMillion: 3.0, completionPerMillion: 15.0 },
  'claude-haiku-4-5': { promptPerMillion: 0.8, completionPerMillion: 4.0 },
  'claude': { promptPerMillion: 3.0, completionPerMillion: 15.0 }, // Alias for sonnet
  // OpenAI
  'gpt-4o': { promptPerMillion: 5.0, completionPerMillion: 15.0 },
  'gpt-4o-mini': { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  // Google Gemini
  'gemini-2.0-flash': { promptPerMillion: 0.1, completionPerMillion: 0.4 },
  'gemini': { promptPerMillion: 0.1, completionPerMillion: 0.4 }, // Alias for flash
  // Codex CLI (override if your billing differs)
  'codex': { promptPerMillion: 5.0, completionPerMillion: 15.0 },
  // Aider (uses sonnet by default)
  'aider': { promptPerMillion: 3.0, completionPerMillion: 15.0 },
}
