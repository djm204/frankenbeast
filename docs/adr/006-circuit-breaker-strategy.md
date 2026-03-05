# ADR-006: Circuit Breaker Strategy

## Status
Accepted

## Context
The Beast Loop must halt safely when guardrails are tripped rather than silently continuing.

## Decision
Three circuit breakers:

1. **Injection Breaker** — Checks every firewall result. On `blocked: true`, throws `InjectionDetectedError` → immediate halt.
2. **Budget Breaker** — Checks token spend after each task. On `totalTokens > maxTotalTokens`, throws `BudgetExceededError` → HITL escalation.
3. **Critique Spiral Breaker** — Inside plan-critique loop. After `maxCritiqueIterations` failures, throws `CritiqueSpiralError` → HITL escalation.

All breakers are pure functions that return `{ halt: boolean; reason?: string }`. The orchestrator interprets the signal.

## Consequences
- Predictable failure modes with typed errors
- HITL escalation for recoverable situations (budget, critique)
- Immediate halt for security situations (injection)
- Easy to add new breakers without modifying the loop
