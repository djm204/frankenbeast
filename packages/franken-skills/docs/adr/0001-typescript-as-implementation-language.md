# ADR-0001 — TypeScript as Implementation Language

**Status**: Accepted

## Context

MOD-02 is the Skill Registry — the canonical source of truth for every capability the agent can invoke. The `UnifiedSkillContract` schema is central to correctness: a wrong shape or missing required field silently allows an invalid skill into the registry, which could cause MOD-01's DeterministicGrounder to grant execution to an unvetted capability.

MOD-01 (Frankenfirewall) is already implemented in TypeScript with `strict: true`. MOD-02 must expose an `ISkillRegistry` interface that MOD-01's DeterministicGrounder consumes. Shared TypeScript types are the cleanest integration surface — no codegen, no schema drift.

## Decision

Use TypeScript with `strict: true`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` enabled — identical compiler settings to MOD-01. The `UnifiedSkillContract` and `ISkillRegistry` interfaces are the authoritative source of truth. Every consumer imports them; no one redefines them.

## Consequences

- Schema violations in `UnifiedSkillContract` are caught at compile time, not at runtime when a bad skill reaches MOD-01
- `ISkillRegistry` can be shared as a package type, giving MOD-01 compile-time confidence in the integration contract
- Tests use the same types as production code — no separate test-only schema definitions
- Build fails on type errors; CI blocks merges that introduce type regressions
- Consistent toolchain with MOD-01 (vitest, eslint, prettier) — lower cognitive overhead across the monorepo
