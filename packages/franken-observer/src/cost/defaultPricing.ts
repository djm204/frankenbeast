export interface ModelPricing {
  /** USD per 1,000,000 prompt tokens */
  promptPerMillion: number
  /** USD per 1,000,000 completion tokens */
  completionPerMillion: number
  /** USD per 1,000,000 prompt-cache read tokens; defaults to prompt pricing. */
  cacheReadPerMillion?: number
  /** USD per 1,000,000 prompt-cache creation tokens; defaults to prompt pricing. */
  cacheCreationPerMillion?: number
}

export type PricingTable = Record<string, ModelPricing>

/**
 * Default pricing table (USD, verified 2026-07-25).
 * Override by passing your own PricingTable to CostCalculator.
 */
export const DEFAULT_PRICING: PricingTable = {
  // Anthropic first-party pricing, including 5-minute cache writes and reads:
  // https://platform.claude.com/docs/en/about-claude/pricing
  'claude-opus-4-6': {
    promptPerMillion: 5.0,
    completionPerMillion: 25.0,
    cacheReadPerMillion: 0.5,
    cacheCreationPerMillion: 6.25,
  },
  'claude-sonnet-4-6': {
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  },
  'claude-haiku-4-5': {
    promptPerMillion: 1.0,
    completionPerMillion: 5.0,
    cacheReadPerMillion: 0.1,
    cacheCreationPerMillion: 1.25,
  },
  'claude': {
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  }, // Alias for sonnet
  // OpenAI first-party model pricing, including cached input:
  // https://developers.openai.com/api/docs/models/gpt-4o
  // https://developers.openai.com/api/docs/models/gpt-4o-mini
  'gpt-4o': {
    promptPerMillion: 2.5,
    completionPerMillion: 10.0,
    cacheReadPerMillion: 1.25,
  },
  'gpt-4o-mini': {
    promptPerMillion: 0.15,
    completionPerMillion: 0.6,
    cacheReadPerMillion: 0.075,
  },
  // Google Gemini
  'gemini-2.0-flash': { promptPerMillion: 0.1, completionPerMillion: 0.4 },
  'gemini': { promptPerMillion: 0.1, completionPerMillion: 0.4 }, // Alias for flash
  // Codex CLI (override if your billing differs)
  'codex': { promptPerMillion: 5.0, completionPerMillion: 15.0 },
  // Aider (uses sonnet by default)
  'aider': {
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  },
}
