# ADR-003: Vitest as Testing Framework

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-heartbeat team

---

## Context

MOD-08 requires comprehensive unit and integration testing with TDD methodology. All sibling Frankenbeast modules use Vitest. Consistency across the monorepo reduces cognitive overhead and enables shared CI configuration.

## Decision

Use **Vitest** with the following configuration:

- `globals: false` — explicit imports for clarity
- `environment: 'node'` — no DOM needed for this backend module
- V8 coverage provider with 80% thresholds (lines, branches, functions, statements)
- Separate unit (`tests/unit/`) and integration (`tests/integration/`) paths
- Integration tests gated behind `INTEGRATION=true` env var

## Alternatives Considered

| Option | Reason Rejected |
|--------|-----------------|
| Jest | Slower, requires more configuration for ESM, all sibling modules use Vitest |
| Node.js built-in test runner | Less mature, no coverage thresholds, no watch mode |
| Mocha + Chai | More boilerplate, less integrated with TypeScript tooling |

## Consequences

- **Positive:** Consistent with franken-brain, franken-planner, franken-observer, franken-governor.
- **Positive:** Fast execution, native ESM support, built-in coverage.
- **Negative:** Additional dev dependency (~112 packages in tree).
- **Mitigation:** Dev dependency only; not shipped to production.
