import type { TokenSpendData } from '../deps.js';

export class BudgetExceededError extends Error {
  constructor(
    public readonly spent: number,
    public readonly limit: number,
  ) {
    super(`Token budget exceeded: ${spent}/${limit}`);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Budget breaker: checks token spend after each task execution.
 * Returns halt signal if total tokens exceed the configured limit.
 */
export function checkBudget(
  spend: TokenSpendData,
  maxTotalTokens: number,
): { halt: boolean; reason?: string } {
  if (spend.totalTokens > maxTotalTokens) {
    return {
      halt: true,
      reason: `Token budget exceeded: ${spend.totalTokens}/${maxTotalTokens}`,
    };
  }
  return { halt: false };
}
