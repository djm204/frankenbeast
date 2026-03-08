# ADR-003: Circuit Breaker Strategy for Critique Loops

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-critique team

## Context

The Generator-Reviewer cycle (Actor proposes, Reviewer critiques, Actor revises) can enter infinite loops when:
1. The Actor cannot satisfy the Reviewer's feedback (conflicting constraints)
2. The Reviewer oscillates between contradictory critiques
3. Token spend exceeds the budget without convergence
4. A hard failure (security breach, system error) makes further iteration pointless

The project outline specifies three stopping conditions: max iterations (3-5), consensus failure, and token budget. We need a structured approach to implement these as composable, testable components.

## Decision

Implement **circuit breakers** as a set of independent guard functions checked by the `CritiqueLoop` before and after each iteration:

```
interface CircuitBreaker {
  readonly name: string;
  check(state: LoopState): CircuitBreakerResult;
}

type CircuitBreakerResult =
  | { tripped: false }
  | { tripped: true; reason: string; action: 'halt' | 'escalate' };
```

Three breakers, checked in order:

1. **MaxIterationBreaker** — Configurable cap (default: 3, max: 5). Returns `halt` when exceeded.
2. **TokenBudgetBreaker** — Tracks cumulative token spend across iterations. Returns `halt` when budget is exceeded. Integrates with MOD-05 (Observability) for cost data.
3. **ConsensusFailureBreaker** — Detects when the same critique category fails repeatedly without improvement (e.g., same evaluator fails 3 times with no score improvement). Returns `escalate` to trigger HITL via MOD-07 (Governor).

The `CritiqueLoop` checks all breakers before starting each new iteration. If any breaker trips:
- `halt`: Stop the loop immediately, return the best result so far
- `escalate`: Stop the loop, emit an `EscalationRequest` for MOD-07

## Consequences

### Positive
- Each breaker is independently testable with deterministic inputs
- Breakers are composable; can add new ones (e.g., time-based) without modifying loop logic
- Clear separation between "stop and return best effort" vs. "stop and ask a human"
- Token budget integration prevents runaway cost in production

### Negative
- `ConsensusFailureBreaker` requires tracking evaluation history across iterations, adding state complexity
- Three breakers checked per iteration adds minor overhead (negligible vs. LLM call cost)

### Risks
- Setting max iterations too low (1-2) effectively disables the critique loop; enforce minimum of 1
- Token budget must account for both evaluator and actor LLM calls; underestimating causes premature halts

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Single counter with hard limit | Simplest possible | No token awareness, no escalation path | Too primitive; doesn't address cost control or HITL |
| Timeout-based (wall clock) | Simple, universal | LLM response times vary wildly; unreliable | Token count is a better proxy for cost than time |
| Probabilistic convergence detection | Sophisticated, adapts to problem difficulty | Complex to implement, hard to test deterministically | Over-engineered for 3-5 iteration loops |
