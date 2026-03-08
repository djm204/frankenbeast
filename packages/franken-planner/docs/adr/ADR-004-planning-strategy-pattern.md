# ADR-004: Strategy Pattern for Planners (Linear / Parallel / Recursive)

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

MOD-04 supports three planning strategies with different execution semantics:

- **Linear** — Sequential tasks, one at a time.
- **Parallel** — Independent tasks dispatched concurrently to a multi-agent setup.
- **Recursive** — Output of one step defines the scope of the next (dynamic depth).

The Planner must select the right strategy per goal and must allow new strategies to be added without modifying core dispatch logic.

## Decision

Apply the **Strategy design pattern**. Define a shared `PlanningStrategy` interface; each strategy is a class implementing it. The `Planner` class holds a reference to the active strategy and delegates `execute()` to it.

```typescript
interface PlanningStrategy {
  name: PlanningStrategyName;
  execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult>;
}

class LinearPlanner implements PlanningStrategy { ... }
class ParallelPlanner implements PlanningStrategy { ... }
class RecursivePlanner implements PlanningStrategy { ... }
```

Strategy selection is determined by the Planner's analysis of the incoming goal (heuristic) or explicitly specified by MOD-01's sanitized input.

## Alternatives Considered

| Option                        | Reason Rejected                                            |
| ----------------------------- | ---------------------------------------------------------- |
| Switch/if-else in Planner     | Violates Open/Closed; grows unmanageably                   |
| Separate top-level functions  | Harder to inject/mock in tests; no shared state management |
| Inheritance from a base class | Strategy pattern is more composition-friendly              |

## Consequences

- **Positive:** New strategies can be added by implementing the interface — no changes to `Planner`.
- **Positive:** Each strategy is independently unit-testable with a stub `PlanGraph`.
- **Positive:** Strategy selection logic is its own testable unit (separate from execution).
- **Negative:** Slightly more indirection than a direct call — acceptable trade-off.
