# ADR-004: Module Integration Contracts (MOD-01, MOD-03, MOD-05, MOD-07)

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-critique team

## Context

MOD-06 does not operate in isolation. It depends on four sibling modules:

- **MOD-01 (Firewall/Guardrails):** Provides safety rules and sandbox execution for dry-run verification
- **MOD-03 (Brain/Memory):** Provides ADRs, episodic traces, and semantic search for factuality checks; receives successful critiques as new episodic lessons
- **MOD-05 (Observer):** Provides token spend data for the TokenBudgetBreaker
- **MOD-07 (Governor):** Receives escalation requests when consensus failure triggers HITL

We need clear integration boundaries that allow MOD-06 to be developed and tested independently while defining explicit contracts for cross-module communication.

## Decision

Define integration contracts as **TypeScript interfaces** in `src/types/contracts.ts`. Each contract represents the minimal surface area MOD-06 needs from a sibling module:

```
// What MOD-06 needs from MOD-01 (Firewall)
interface GuardrailsPort {
  getSafetyRules(): Promise<SafetyRule[]>;
  executeSandbox(code: string, timeout: number): Promise<SandboxResult>;
}

// What MOD-06 needs from MOD-03 (Brain)
interface MemoryPort {
  searchADRs(query: string, topK: number): Promise<ADRMatch[]>;
  searchEpisodic(taskId: string): Promise<EpisodicTrace[]>;
  recordLesson(lesson: CritiqueLesson): Promise<void>;
}

// What MOD-06 needs from MOD-05 (Observer)
interface ObservabilityPort {
  getTokenSpend(sessionId: string): Promise<TokenSpend>;
}

// What MOD-06 emits to MOD-07 (Governor)
interface EscalationPort {
  requestHumanReview(request: EscalationRequest): Promise<void>;
}
```

These are **ports** in the hexagonal architecture sense. In production, adapters wire them to real module instances. In tests, they are trivially mockable.

## Consequences

### Positive
- MOD-06 can be fully developed and tested without running sibling modules
- Contracts document exactly what MOD-06 expects; sibling teams can implement against them
- Swapping implementations (e.g., mock MOD-03 with a stub) requires no code changes in evaluators
- Type-safe at compile time; runtime mismatches caught by Zod validation at boundaries

### Negative
- Contracts must be kept in sync with sibling module APIs manually until a shared types package exists
- Adds an indirection layer between MOD-06 and real module implementations

### Risks
- Contract drift: if MOD-03 changes its API, the port definition here becomes stale. Mitigate with integration tests in CI that import both modules.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Direct imports from sibling packages | No indirection, always in sync | Tight coupling; can't test MOD-06 without all dependencies installed | Defeats independent development and testing |
| Shared types package (@franken/types) | Single source of truth | Requires publishing and versioning a new package before any module ships | Premature; contracts are small enough to duplicate for MVP |
| Event-driven (pub/sub) | Fully decoupled | Adds message broker dependency; harder to reason about synchronous evaluation flows | Evaluation is request/response, not fire-and-forget |
