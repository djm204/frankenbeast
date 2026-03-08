# ADR-006: Critique Loop Engine Design

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-critique team

## Context

The core value proposition of MOD-06 is the Generator-Reviewer cycle described in the project outline:

1. Actor proposes code or a plan
2. Reviewer (MOD-06) evaluates against guardrails and memory
3. If flaws found, return a Correction Request with actionable feedback
4. Actor revises; repeat until pass or circuit breaker trips

The loop engine must:
- Orchestrate the evaluation pipeline (ADR-002) per iteration
- Check circuit breakers (ADR-003) before each iteration
- Track iteration history for consensus failure detection
- Produce a final `CritiqueLoopResult` with the verdict, all iteration results, and metadata
- Be stateless between invocations (all state passed in via `LoopState`)

## Decision

Implement a `CritiqueLoop` class that composes the `CritiquePipeline` and `CircuitBreaker[]`:

```
class CritiqueLoop {
  constructor(
    pipeline: CritiquePipeline,
    breakers: CircuitBreaker[],
    config: LoopConfig
  )

  async run(input: CritiqueInput): Promise<CritiqueLoopResult>
}
```

The `run()` method follows this algorithm:
1. Initialize `LoopState` with iteration count = 0 and empty history
2. **Pre-check**: Run all circuit breakers. If any trip, return immediately.
3. Run the `CritiquePipeline` against the current input
4. Record the `CritiqueResult` in iteration history
5. If the result is a **pass**, return success with all iteration data
6. If the result is a **fail**, construct a `CorrectionRequest` from the failed evaluations
7. Increment iteration count, update `LoopState`
8. Go to step 2

The `CritiqueLoop` does NOT call the Actor to regenerate. It returns a `CorrectionRequest` and expects the caller (the Orchestrator) to feed the revised input back in. This keeps MOD-06 focused on evaluation, not generation.

```
type CritiqueLoopResult =
  | { verdict: 'pass'; iterations: CritiqueIteration[] }
  | { verdict: 'fail'; iterations: CritiqueIteration[]; correction: CorrectionRequest }
  | { verdict: 'halted'; iterations: CritiqueIteration[]; reason: string }
  | { verdict: 'escalated'; iterations: CritiqueIteration[]; escalation: EscalationRequest }
```

## Consequences

### Positive
- Loop is a pure function of its inputs (no hidden state); easy to test with deterministic fixtures
- Separation from Actor means MOD-06 has no dependency on the generation model
- Iteration history is fully captured for observability (MOD-05) and episodic memory (MOD-03)
- Four-variant result type makes all outcomes explicit and exhaustive at the type level

### Negative
- Caller (Orchestrator) must manage the back-and-forth between Actor and Reviewer
- Multiple iterations mean multiple pipeline runs; cost scales linearly with iteration count

### Risks
- If the Orchestrator doesn't respect `CorrectionRequest` and feeds back the same input, the loop will repeat the same critique until a breaker trips. This is by design (breakers are the safety net).

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Loop calls Actor internally | Self-contained; no external orchestration needed | MOD-06 becomes coupled to the generation model; harder to test | Violates single responsibility; MOD-06 should evaluate, not generate |
| Streaming/event-based loop | Real-time feedback to the user | Adds complexity; evaluation is batch, not streaming | Evaluation results are meaningful only when complete |
| Single-shot evaluation (no loop) | Simplest possible | Misses the core "Reflexion" pattern value | Defeats the purpose of MOD-06 |
