/**
 * Token spend summary used across module boundaries.
 */
export interface TokenSpend {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
