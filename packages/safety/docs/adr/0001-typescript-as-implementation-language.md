# ADR-0001 — TypeScript as Implementation Language

**Status**: Accepted

## Context

MOD-01 is a middleware layer that enforces schema contracts between an Orchestrator and multiple LLM providers. The Unified Schema is central to correctness — a wrong shape silently breaks downstream consumers. We need a language where schema violations are caught at compile time, not runtime.

## Decision

Use TypeScript with `strict: true`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` enabled. These settings ensure:

- Optional fields cannot be accessed without a guard
- Array index access acknowledges the possibility of `undefined`
- `type` and `interface` definitions are the single source of truth for schema shapes

## Consequences

- Schema types defined in `src/types/` are imported everywhere — never redefined
- Tests use the same types; no separate test-only schema definitions
- Build failures on type errors; CI blocks merges that introduce type regressions
- New contributors must know TypeScript; acceptable for a middleware infrastructure project
