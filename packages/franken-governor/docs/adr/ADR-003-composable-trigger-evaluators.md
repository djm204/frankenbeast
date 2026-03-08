# ADR-003: Composable Trigger Evaluators

## Status

Accepted

## Context

MOD-07 has four distinct trigger conditions that cause an HITL pause: budget breaches (MOD-05 CircuitBreaker), high-stakes skills (MOD-02 requires_hitl), low confidence (MOD-06), and ambiguity (MOD-04 planner). Each trigger has different input types and evaluation logic. They must be independently testable and composable.

## Decision

Define a generic `TriggerEvaluator<TContext>` interface with a single `evaluate(context): TriggerResult` method. Each trigger is a stateless class implementing this interface. A `TriggerRegistry` composes evaluators and returns the first triggered result, short-circuiting evaluation.

Triggers:
- `BudgetTrigger` — evaluates `{ tripped, limitUsd, spendUsd }` (from CircuitBreakerResult)
- `SkillTrigger` — evaluates `{ skillId, requiresHitl, isDestructive }` (from UnifiedSkillContract)
- `ConfidenceTrigger` — evaluates `{ confidenceScore }` (from MOD-06)
- `AmbiguityTrigger` — evaluates `{ hasUnresolvedDependency, hasAdrConflict }` (from MOD-04)

## Consequences

- **Positive:** Each trigger is independently testable with zero I/O.
- **Positive:** New triggers can be added without modifying existing code (OCP).
- **Positive:** TriggerRegistry is a simple composition — no complex state management.
- **Negative:** The generic `TContext` means the registry's `evaluateAll` accepts `unknown` — type safety is at the caller's discretion.
