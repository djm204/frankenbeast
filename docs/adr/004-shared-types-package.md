# ADR-004: @franken/types Shared Package

## Status
Accepted

## Context
Six type mismatches were discovered across modules: branded TaskId divergence, severity scale splits, RationaleBlock duplication, ILlmClient return type variance, EpisodicTrace quadruple-definition, and Zod version split.

## Decision
Create `franken-types/` as a pure TypeScript package (no Zod dependency) exporting canonical types: `TaskId`, `Severity`, `RationaleBlock`, `VerificationResult`, `ILlmClient`, `IResultLlmClient`, `Result<T,E>`, `TokenSpend`.

Modules re-export from `@franken/types` and keep module-specific types local.

## Consequences
- Single source of truth for shared types
- No runtime dependencies (pure types)
- Modules retain freedom for local type projections (e.g., critique's `EpisodicTrace`)
