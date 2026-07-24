# Issue #3666: TokenBudgetBreaker Validation - Progress Checklist

Implementation checklist for resolving Issue #3666 (Numeric validation for `TokenBudgetBreaker` configuration).

## Acceptance Criteria

- [x] `TokenBudgetBreaker.check()` validates `config.tokenBudget` and throws `ConfigurationError` if `!Number.isFinite(tokenBudget)` or `tokenBudget <= 0`.
- [x] `TokenBudgetBreaker.check()` validates `config.costBudgetUsd` (if defined) and throws `ConfigurationError` if `!Number.isFinite(costBudgetUsd)` or `costBudgetUsd < 0`.
- [x] Unit tests in `packages/franken-critique/tests/unit/breakers/token-budget.test.ts` verify both valid and invalid configuration cases.
- [x] All package tests in `packages/franken-critique` pass cleanly.

## Checklist

- [x] Create progress document at `tasks/issue-3666-token-budget-validation-progress.md` <!-- id: 0 -->
- [x] Add unit tests for invalid `tokenBudget` and invalid `costBudgetUsd` in `packages/franken-critique/tests/unit/breakers/token-budget.test.ts` <!-- id: 1 -->
- [x] Update `TokenBudgetBreaker.check` in `packages/franken-critique/src/breakers/token-budget.ts` to throw `ConfigurationError` on invalid budget configs <!-- id: 2 -->
- [x] Run vitest suite for `packages/franken-critique` to confirm all tests pass <!-- id: 3 -->
- [x] Mark progress checklist complete <!-- id: 4 -->

