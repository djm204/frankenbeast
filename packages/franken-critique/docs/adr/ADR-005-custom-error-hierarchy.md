# ADR-005: Custom Error Hierarchy

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-critique team

## Context

MOD-06 has multiple failure modes that consumers need to distinguish programmatically:

1. **Evaluation failures** — An evaluator encounters bad input or an unexpected state
2. **Circuit breaker trips** — The loop was halted or escalated
3. **Integration errors** — A sibling module (MOD-01, MOD-03) is unreachable or returns invalid data
4. **Configuration errors** — Invalid evaluator setup, missing required evaluators

Generic `Error` objects force consumers to parse error messages as strings, which is fragile and untestable. Sibling modules (franken-governor, franken-brain) use custom error hierarchies.

## Decision

Create a custom error hierarchy rooted at `CritiqueError`:

```
CritiqueError (base)
├── EvaluationError         — individual evaluator failure
├── CircuitBreakerError     — loop halted by a breaker
├── EscalationError         — HITL escalation triggered
├── IntegrationError        — sibling module communication failure
└── ConfigurationError      — invalid pipeline/evaluator setup
```

Each error class:
- Extends `CritiqueError` (which extends `Error`)
- Has a `readonly code: string` for programmatic matching (e.g., `'EVALUATION_FAILED'`)
- Has a `readonly context: Record<string, unknown>` for structured metadata
- Preserves the original `cause` when wrapping external errors

## Consequences

### Positive
- Consumers can catch specific error types: `catch (e) { if (e instanceof CircuitBreakerError) ... }`
- Error codes enable reliable programmatic handling without string parsing
- Structured context enables observability (MOD-05 can log error metadata)
- Consistent with franken-governor and franken-brain error patterns

### Negative
- More boilerplate than throwing plain `Error` objects
- Must be maintained as new failure modes are discovered

### Risks
- Over-granular error types add noise; keep the hierarchy flat (one level deep)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Plain Error with message convention | Zero boilerplate | String parsing is fragile; no type safety | Can't `instanceof` check; breaks if messages change |
| Error code enum on generic Error | Simple, extensible | No structured context; no type narrowing | Loses the benefit of TypeScript's type system |
| Result<T, E> pattern (no exceptions) | Explicit error handling | Requires all callers to handle Result; verbose | Exceptions are idiomatic in the Frankenbeast ecosystem |
