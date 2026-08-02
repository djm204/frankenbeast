import { ConfigurationError } from '../errors/index.js';

/**
 * Validates an optional USD cost budget. `undefined` means no cost budget is
 * configured and is always valid. When set, the value must be a finite,
 * non-negative number — `Infinity` (or `-Infinity`/`NaN`) must be rejected
 * because `estimatedSpend > Infinity` never trips, silently disabling
 * cost-budget enforcement and allowing unbounded spend (#3843).
 */
export function assertValidCostBudgetUsd(costBudgetUsd: number | undefined): void {
  if (costBudgetUsd === undefined) {
    return;
  }

  if (!Number.isFinite(costBudgetUsd) || costBudgetUsd < 0) {
    throw new ConfigurationError(
      `costBudgetUsd must be a finite, non-negative number, got ${costBudgetUsd}`,
      { context: { costBudgetUsd } },
    );
  }
}
