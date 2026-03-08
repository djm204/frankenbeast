# ADR-001: TypeScript 5.x with Strict Mode

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

MOD-04 defines typed contracts at every module boundary (MOD-01, MOD-02, MOD-03, MOD-07). Without strict typing, interface drift between modules becomes a silent runtime failure that is hard to trace in an autonomous agent loop.

## Decision

Use **TypeScript 5.x** with the following `tsconfig.json` flags enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

All module interface types live in `src/modules/` and are the single source of truth for inter-module communication.

## Alternatives Considered

| Option                          | Reason Rejected                                                 |
| ------------------------------- | --------------------------------------------------------------- |
| Plain JavaScript                | No compile-time safety for complex DAG + interface types        |
| TypeScript with `strict: false` | Allows implicit `any`; defeats the purpose for module contracts |
| Zod runtime schemas only        | Useful as a complement but not a replacement for static types   |

## Consequences

- **Positive:** Bugs at module boundaries caught at compile time. IDE autocomplete on all task/plan types.
- **Positive:** Enables confident refactoring as the agent system evolves.
- **Negative:** Slightly more verbose — explicit types required at all public API surfaces.
- **Mitigation:** Use `satisfies` operator and type inference where it reduces noise without losing safety.
