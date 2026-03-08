# ADR-006: Module Interface Contracts (Stubs)

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-heartbeat team

---

## Context

MOD-08 integrates with five other Frankenbeast modules (MOD-03 Memory, MOD-04 Planner, MOD-05 Observability, MOD-06 Self-Critique, MOD-07 HITL Gateway). Each module is developed independently in its own repository. The Heartbeat must define typed contracts for what it needs from each dependency without coupling to concrete implementations.

## Decision

Define **TypeScript interfaces** in `src/modules/` as the contracts MOD-08 requires from each dependency. These interfaces are the single source of truth for inter-module communication from the heartbeat's perspective.

- Each module gets its own file: `memory.ts`, `observability.ts`, `planner.ts`, `critique.ts`, `hitl.ts`
- All types needed by these interfaces are co-located or imported from `src/core/types.ts`
- Concrete implementations are injected at the composition root (CLI entry point)
- Tests use lightweight stubs implementing these interfaces

## Alternatives Considered

| Option | Reason Rejected |
|--------|-----------------|
| Import types directly from sibling module packages | Creates hard dependency on sibling packages; they may not be published yet |
| Shared types package (`@franken/types`) | Premature abstraction; each module is evolving independently |
| Runtime schema validation only (no interfaces) | Loses compile-time safety at integration boundaries |

## Consequences

- **Positive:** MOD-08 can be developed and tested independently of all other modules.
- **Positive:** Interface contracts document exactly what MOD-08 needs from each dependency.
- **Negative:** Interface drift risk — the heartbeat's expected interface may diverge from the actual module.
- **Mitigation:** Integration tests with real module implementations will catch drift when modules are composed.
