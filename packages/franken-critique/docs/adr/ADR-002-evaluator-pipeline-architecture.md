# ADR-002: Composable Evaluator Pipeline Architecture

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-critique team

## Context

MOD-06 must evaluate agent output across multiple orthogonal dimensions: factuality, safety, conciseness, scalability, ghost dependencies, complexity bloat, logic loops, and ADR compliance. Each dimension has different data requirements, scoring logic, and failure modes.

We need an architecture that:
1. Allows evaluators to run independently and in parallel where possible
2. Makes it easy to add, remove, or reorder evaluators without touching core logic
3. Produces a unified `CritiqueResult` regardless of which evaluators ran
4. Supports both deterministic checks (linting, type checking) and heuristic checks (complexity assessment)

## Decision

Implement a **composable evaluator pipeline** where each evaluation criterion is an independent function conforming to a shared `Evaluator` interface:

```
interface Evaluator {
  readonly name: string;
  readonly category: 'deterministic' | 'heuristic';
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
```

A `CritiquePipeline` orchestrates evaluators:
1. Accepts a list of `Evaluator` instances at construction
2. Runs all evaluators against the input (deterministic first, then heuristic)
3. Aggregates individual `EvaluationResult`s into a single `CritiqueResult`
4. Short-circuits on critical failures (e.g., safety violations stop further evaluation)

```
CritiquePipeline
├── FactualityEvaluator      (heuristic)  — cross-refs MOD-03
├── SafetyEvaluator           (deterministic) — checks MOD-01 alignment
├── ConciseEvaluator         (heuristic)  — flags over-engineering
├── ScalabilityEvaluator      (heuristic)  — evaluates 0-to-1 readiness
├── GhostDependencyEvaluator  (deterministic) — checks package registry
├── ComplexityEvaluator       (heuristic)  — flags bloat
├── LogicLoopEvaluator        (deterministic) — detects infinite recursion
└── ADRComplianceEvaluator    (heuristic)  — checks against stored ADRs
```

## Consequences

### Positive
- Each evaluator is independently testable with no dependencies on other evaluators
- New evaluators can be added by implementing the interface and registering with the pipeline
- Deterministic evaluators (linting, type checks) run first as cheap gatekeepers
- Short-circuiting on safety failures prevents wasted computation
- Pipeline composition is configurable per use case (e.g., quick check vs. full review)

### Negative
- More files than a monolithic `review()` function
- Aggregation logic in `CritiquePipeline` must handle conflicting evaluator results

### Risks
- Evaluator ordering matters for short-circuiting; must be explicit and well-documented
- Heuristic evaluators may produce inconsistent results across runs; mitigate with deterministic fallbacks

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Single monolithic `review()` function | Simple, one file | Untestable in isolation, hard to extend | Violates SRP; adding a new check means modifying core logic |
| Chain-of-responsibility pattern | Natural ordering | Each handler decides whether to pass; harder to aggregate results | Need all evaluators to run (not just first match) |
| Rule engine (e.g., json-rules-engine) | Declarative rules | External dependency, over-engineered for 8-10 evaluators | Adds complexity without proportional benefit |
