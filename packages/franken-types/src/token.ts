/**
 * Token spend summary used across module boundaries.
 */
export interface TokenSpend {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/**
 * Construct a validated {@link TokenSpend}. Enforces non-negative safe-integer
 * token counts, computes the `totalTokens = inputTokens + outputTokens`
 * invariant (rather than trusting a caller-supplied total), and requires a
 * non-negative finite cost. Throws {@link RangeError} on any violation, so
 * overflow or corrupt input surfaces loudly instead of silently mis-billing.
 */
export function makeTokenSpend(
  inputTokens: number,
  outputTokens: number,
  estimatedCostUsd: number,
): TokenSpend {
  const assertCount = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        `TokenSpend: ${label} must be a non-negative safe integer, received ${value}`,
      );
    }
  };
  assertCount(inputTokens, 'inputTokens');
  assertCount(outputTokens, 'outputTokens');
  const totalTokens = inputTokens + outputTokens;
  if (!Number.isSafeInteger(totalTokens)) {
    throw new RangeError(
      `TokenSpend: totalTokens ${totalTokens} exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`,
    );
  }
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) {
    throw new RangeError(
      `TokenSpend: estimatedCostUsd must be a non-negative finite number, received ${estimatedCostUsd}`,
    );
  }
  return { inputTokens, outputTokens, totalTokens, estimatedCostUsd };
}
