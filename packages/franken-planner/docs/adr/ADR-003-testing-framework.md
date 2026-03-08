# ADR-003: Vitest as the Testing Framework

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

The project uses modern ESM TypeScript. Tests must run fast for a TDD workflow. Coverage reporting must integrate with CI quality gates.

## Decision

Use **Vitest** as the sole test runner and assertion library.

Configuration targets:

- Coverage via `@vitest/coverage-v8`
- Minimum thresholds: **80% statements, 80% branches, 80% functions**
- `test:watch` mode for local TDD loops
- `test:ci` mode (single-run + coverage) for CI

```json
// vitest.config.ts (sketch)
{
  "coverage": {
    "provider": "v8",
    "thresholds": { "statements": 80, "branches": 80, "functions": 80 }
  }
}
```

## Alternatives Considered

| Option                    | Reason Rejected                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Jest                      | Slower startup; requires `ts-jest` or `babel-jest` transform overhead; less native ESM |
| Mocha + Chai              | More configuration; no built-in coverage; no native TS support                         |
| Node built-in `node:test` | Immature assertion API; poor TypeScript DX                                             |

## Consequences

- **Positive:** Near-instant test startup. Identical config API to Vite (familiar).
- **Positive:** Native TypeScript and ESM — no transpilation layer in tests.
- **Positive:** `vi.mock()`, `vi.spyOn()` cover all mocking needs for module interface fakes.
- **Negative:** Vitest ecosystem slightly smaller than Jest — but coverage is complete for our use case.
