# ADR-001: TypeScript 5.x with Strict Mode

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-heartbeat team

---

## Context

MOD-08 defines typed contracts at module boundaries (MOD-03, MOD-04, MOD-05, MOD-06, MOD-07). Without strict typing, interface drift between modules becomes a silent runtime failure. All sibling Frankenbeast modules use TypeScript strict mode as established in franken-brain ADR-001 and franken-planner ADR-001.

## Decision

Use **TypeScript 5.x** with the following `tsconfig.json` flags enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Alternatives Considered

| Option | Reason Rejected |
|--------|-----------------|
| Plain JavaScript | No compile-time safety for module interface contracts |
| TypeScript with `strict: false` | Allows implicit `any`; defeats the purpose for typed boundaries |
| Zod runtime schemas only | Useful as complement but not replacement for static types |

## Consequences

- **Positive:** Bugs at module boundaries caught at compile time. IDE autocomplete on all heartbeat types.
- **Positive:** Consistent with all sibling Frankenbeast modules.
- **Negative:** Slightly more verbose — explicit types required at all public API surfaces.
- **Mitigation:** Use `satisfies` operator and type inference where it reduces noise without losing safety.
